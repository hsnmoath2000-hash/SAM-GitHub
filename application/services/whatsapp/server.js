'use strict';

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Boom } = require('@hapi/boom');

const PORT = parseInt(process.env.PORT || '3388', 10);
const DEFAULT_AUTH_PATH = process.env.SAM_WHATSAPP_AUTH_PATH ||
  (process.platform === 'win32' ? path.resolve(__dirname, 'auth_info_baileys') : '/var/lib/mikrotik-usermanager/whatsapp/baileys_auth');
const CHATBOT_URL = process.env.SAM_CHATBOT_URL || 'http://127.0.0.1/api.php?action=handle_chatbot_message';
const LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

function networkIdFromRequest(req) {
  const value = req?.body?.network_id ?? req?.query?.network_id ?? req?.headers?.['x-sam-network-id'];
  if (value === 'system_owner' || value === 'owner' || value === 'sovereign') return 0;
  if (value === undefined || value === null || value === '') return -1;
  const id = Number.parseInt(String(value), 10);
  return Number.isInteger(id) && id >= 0 ? id : -1;
}

function requireNetwork(req, res) {
  const id = networkIdFromRequest(req);
  if (id < 0) {
    res.status(400).json({ success: false, error: 'NETWORK_CONTEXT_REQUIRED' });
    return null;
  }
  return id;
}

function authPathForNetwork(networkId) {
  if (networkId === 0) return `${DEFAULT_AUTH_PATH}_system_owner`;
  return networkId === 1 ? DEFAULT_AUTH_PATH : `${DEFAULT_AUTH_PATH}_network_${networkId}`;
}

function normalizeYemenPhone(phone) {
  let d = String(phone || '').replace(/[^0-9]/g, '');
  if (d.startsWith('00967')) d = d.slice(5);
  else if (d.startsWith('967') && d.length === 12) d = d.slice(3);
  else if (d.startsWith('07')) d = d.slice(1);
  else if (d.startsWith('0') && (d.length === 10 || d.length === 9)) d = d.slice(1);

  if (d.length === 9) return '967' + d;
  if (d.startsWith('967') && d.length === 12) return d;
  return d;
}

function extractMessageText(message) {
  if (!message) return '';
  if (message.ephemeralMessage) return extractMessageText(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return extractMessageText(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return extractMessageText(message.viewOnceMessageV2.message);
  if (message.documentWithCaptionMessage) return extractMessageText(message.documentWithCaptionMessage.message);
  return message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption ||
    message.videoMessage?.caption || message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId || message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId || message.templateButtonReplyMessage?.selectedId ||
    message.interactiveResponseMessage?.body?.text || '';
}

const messageStore = new Map();
function saveMessageToStore(msg) {
  if (msg?.key?.id && msg.message) {
    messageStore.set(msg.key.id, msg);
    if (messageStore.size > 5000) messageStore.delete(messageStore.keys().next().value);
  }
}
const retryCache = new Map();
const msgRetryCounterCache = {
  get: key => retryCache.get(key), set: (key, value) => retryCache.set(key, value),
  del: key => retryCache.delete(key), flushAll: () => retryCache.clear()
};

const clients = new Map();
function getClient(networkId) {
  if (!clients.has(networkId)) {
    clients.set(networkId, {
      networkId, authPath: authPathForNetwork(networkId), status: 'INITIALIZING', qrCodeBase64: null,
      qrCodeRaw: null, clientInfo: null, sock: null, reconnectTimer: null, initPromise: null
    });
  }
  return clients.get(networkId);
}

async function forwardToChatbot(networkId, fromPhone, bodyText, timestamp) {
  try {
    const payload = JSON.stringify({ network_id: networkId, from: fromPhone, phone: fromPhone, body: bodyText, message: bodyText, timestamp: timestamp || Math.floor(Date.now() / 1000) });
    const targetUrl = new URL(CHATBOT_URL);
    const isHttps = targetUrl.protocol === 'https:';
    const clientLib = isHttps ? https : http;
    const options = {
      hostname: targetUrl.hostname, port: targetUrl.port || (isHttps ? 443 : 80), path: targetUrl.pathname + targetUrl.search,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SAM-Network-ID': String(networkId), 'Content-Length': Buffer.byteLength(payload) }
    };
    return await new Promise(resolve => {
      const req = clientLib.request(options, res => { let data = ''; res.on('data', chunk => { data += chunk; }); res.on('end', () => { try { resolve(JSON.parse(data)); } catch (_) { resolve(null); } }); });
      req.on('error', err => { console.error(`[WhatsApp Bot ${networkId}] Webhook error:`, err.message); resolve(null); });
      req.setTimeout(8000, () => { req.destroy(); resolve(null); });
      req.write(payload); req.end();
    });
  } catch (err) { console.error(`[WhatsApp Bot ${networkId}] Forwarding exception:`, err.message); return null; }
}

function scheduleReconnect(state, delayMs = 5000) {
  if (state.reconnectTimer) return;
  state.reconnectTimer = setTimeout(async () => { state.reconnectTimer = null; await initClient(state.networkId); }, delayMs);
}

async function initClient(networkId) {
  const state = getClient(networkId);
  if (state.initPromise) return state.initPromise;
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
  state.initPromise = (async () => {
    try {
      fs.mkdirSync(state.authPath, { recursive: true });
      const { state: authState, saveCreds } = await useMultiFileAuthState(state.authPath);
      let version = [2, 3000, 1015901307];
      try { const fetched = await fetchLatestBaileysVersion(); if (fetched?.version) version = fetched.version; } catch (_) {}
      const logger = pino({ level: LOG_LEVEL });
      const sock = makeWASocket({
        version, logger, printQRInTerminal: false,
        auth: { creds: authState.creds, keys: makeCacheableSignalKeyStore(authState.keys, logger) },
        getMessage: async key => messageStore.get(key.id)?.message,
        msgRetryCounterCache, generateHighQualityLinkPreview: false, syncFullHistory: false,
        markOnlineOnConnect: true, browser: Browsers ? Browsers.ubuntu('Chrome') : ['SAM MikroTik Manager', 'Safari', '20.0.04'],
        defaultQueryTimeoutMs: 60000, retryRequestDelayMs: 2000, keepAliveIntervalMs: 25000,
        emitOwnEvents: false, fireInitQueries: true
      });
      state.sock = sock; state.status = 'INITIALIZING'; sock.ev.on('creds.update', saveCreds);
      sock.ev.on('connection.update', async update => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          state.status = 'QR_READY'; state.qrCodeRaw = qr;
          try { state.qrCodeBase64 = await qrcode.toDataURL(qr, { margin: 2, width: 300, color: { dark: '#000000', light: '#ffffff' } }); } catch (_) { state.qrCodeBase64 = null; }
          console.log(`[WhatsApp/Baileys ${networkId}] QR ready`);
        }
        if (connection === 'open') {
          state.status = 'CONNECTED'; state.qrCodeBase64 = null; state.qrCodeRaw = null;
          const user = sock.user || {}; const rawJid = user.id || ''; const wid = rawJid.split(':')[0].split('@')[0];
          state.clientInfo = { pushname: user.name || user.notify || (networkId === 0 ? 'SAM Sovereign Owner' : 'MikroTik Admin'), wid, platform: 'baileys-websocket', network_id: networkId };
          console.log(`[WhatsApp/Baileys ${networkId}] Connected — ${state.clientInfo.pushname}`);
        } else if (connection === 'close') {
          const statusCode = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          state.status = 'DISCONNECTED'; state.clientInfo = null; state.sock = null;
          if (loggedOut) { try { fs.rmSync(state.authPath, { recursive: true, force: true }); } catch (_) {} }
          scheduleReconnect(state, loggedOut ? 3000 : 5000);
        } else if (connection === 'connecting') state.status = 'INITIALIZING';
      });
      sock.ev.on('messages.upsert', async m => {
        try {
          if (m.type !== 'notify') return;
          for (const msg of m.messages) {
            saveMessageToStore(msg); if (!msg.message || msg.key.fromMe) continue;
            const remoteJid = msg.key.remoteJid || ''; if (remoteJid.endsWith('@g.us')) continue;
            const fromPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
            const body = extractMessageText(msg.message); if (!body.trim()) continue;
            const timestamp = msg.messageTimestamp ? Number(msg.messageTimestamp) : Math.floor(Date.now() / 1000);
            const reply = await forwardToChatbot(networkId, fromPhone, body, timestamp);
            const replyText = reply?.reply || reply?.response || reply?.message || (typeof reply === 'string' ? reply : null);
            if (replyText && String(replyText).trim()) { const sent = await sock.sendMessage(remoteJid, { text: String(replyText) }); saveMessageToStore(sent); }
          }
        } catch (err) { console.error(`[WhatsApp Bot ${networkId}] Inbound error:`, err.message); }
      });
    } catch (err) { state.status = 'ERROR'; console.error(`[WhatsApp/Baileys ${networkId}] Init error:`, err.message); scheduleReconnect(state, 10000); }
    finally { state.initPromise = null; }
  })();
  return state.initPromise;
}

async function stopClient(state, wipeAuth = false) {
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
  try { await state.sock?.logout(); } catch (_) {}
  try { state.sock?.ev.removeAllListeners(); state.sock?.end(undefined); } catch (_) {}
  state.sock = null; state.status = 'DISCONNECTED'; state.clientInfo = null; state.qrCodeBase64 = null; state.qrCodeRaw = null;
  if (wipeAuth) { try { fs.rmSync(state.authPath, { recursive: true, force: true }); } catch (_) {} }
}

const app = express();
app.use(cors()); app.use(express.json({ limit: '50mb' })); app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/status', async (req, res) => {
  const id = requireNetwork(req, res);
  if (id === null) return;
  const state = getClient(id);
  if (!state.sock && state.status !== 'CONNECTED') await initClient(id);
  res.json({
    network_id: id,
    status: state.status,
    connected: state.status === 'CONNECTED',
    info: state.clientInfo,
    error: null,
    engine: 'baileys-websocket-multinetwork',
    cached_messages: messageStore.size
  });
});

app.get('/qr', async (req, res) => {
  const id = requireNetwork(req, res);
  if (id === null) return;
  const state = getClient(id);
  if (!state.sock && state.status !== 'CONNECTED') await initClient(id);
  res.json({
    network_id: id,
    status: state.status,
    qr: state.qrCodeBase64,
    qr_raw: state.qrCodeRaw
  });
});

app.post('/send-message', async (req, res) => {
  const id = requireNetwork(req, res);
  if (id === null) return;
  const state = getClient(id);
  const { phone, message } = req.body || {};
  if (!phone || !message) return res.status(400).json({ success: false, error: 'phone و message مطلوبان', network_id: id });
  if (!state.sock && state.status !== 'CONNECTED') await initClient(id);
  if (state.status !== 'CONNECTED' || !state.sock) return res.status(503).json({ success: false, error: `خدمة الواتساب للشبكة/المالك ${id} غير متصلة (${state.status})`, network_id: id });
  try {
    const clean = normalizeYemenPhone(phone);
    const sent = await state.sock.sendMessage(`${clean}@s.whatsapp.net`, { text: String(message) });
    saveMessageToStore(sent);
    return res.json({ success: true, message_id: sent?.key?.id || 'sent', to: clean, network_id: id });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, network_id: id });
  }
});

app.post('/send-media', async (req, res) => {
  const id = requireNetwork(req, res);
  if (id === null) return;
  const state = getClient(id);
  const { phone, base64, mimetype, filename, caption } = req.body || {};
  if (!phone || !base64) return res.status(400).json({ success: false, error: 'phone و base64 مطلوبان', network_id: id });
  if (!state.sock && state.status !== 'CONNECTED') await initClient(id);
  if (state.status !== 'CONNECTED' || !state.sock) return res.status(503).json({ success: false, error: `خدمة الواتساب للشبكة/المالك ${id} غير متصلة (${state.status})`, network_id: id });
  try {
    const clean = normalizeYemenPhone(phone);
    const mime = mimetype || 'image/png';
    const buffer = Buffer.from(base64, 'base64');
    const fileName = filename || 'file';
    let payload;
    if (mime.startsWith('image/')) payload = { image: buffer, caption: caption || '', fileName };
    else if (mime.startsWith('video/')) payload = { video: buffer, caption: caption || '', fileName };
    else if (mime.startsWith('audio/')) payload = { audio: buffer, mimetype: mime };
    else payload = { document: buffer, mimetype: mime, fileName: fileName.includes('.') ? fileName : `${fileName}.pdf`, caption: caption || '' };
    const sent = await state.sock.sendMessage(`${clean}@s.whatsapp.net`, payload);
    saveMessageToStore(sent);
    return res.json({ success: true, message_id: sent?.key?.id || 'sent', to: clean, network_id: id });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, network_id: id });
  }
});

app.post('/logout', async (req, res) => {
  const id = requireNetwork(req, res);
  if (id === null) return;
  const state = getClient(id);
  await stopClient(state, true);
  scheduleReconnect(state, 2000);
  res.json({ success: true, network_id: id, message: 'تم تسجيل الخروج وسيتم توليد QR مستقل للشبكة/المالك' });
});

app.post('/restart', async (req, res) => {
  const id = requireNetwork(req, res);
  if (id === null) return;
  const state = getClient(id);
  await stopClient(state, false);
  setTimeout(() => initClient(id), 1000);
  res.json({ success: true, network_id: id, message: 'تم طلب إعادة تشغيل جلسة الواتساب للشبكة/المالك' });
});

async function gracefulShutdown(signal) {
  console.log(`[WhatsApp] Received ${signal}, shutting down…`);
  for (const state of clients.values()) await stopClient(state, false);
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', reason => console.error('[WhatsApp] Unhandled rejection:', reason?.message || reason));
process.on('uncaughtException', err => console.error('[WhatsApp] Uncaught exception:', err.message));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[WhatsApp Baileys] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[WhatsApp Baileys] Sovereign Owner auth directory: ${authPathForNetwork(0)}`);
  console.log(`[WhatsApp Baileys] Network 1 auth directory: ${authPathForNetwork(1)}`);
  initClient(0);
  initClient(1);
});

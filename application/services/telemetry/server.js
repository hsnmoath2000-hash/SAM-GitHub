/**
 * SAM Live Telemetry & Real-Time WebSocket Microservice
 * Provides real-time metrics, active user counters, and router statistics
 * to Android Mobile App and Web Dashboard.
 * 
 * Port: 8088 (configurable via TELEMETRY_PORT)
 */

'use strict';

const http = require('http');
const WebSocket = require('ws');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.env.TELEMETRY_PORT || '8088', 10);
const BROADCAST_INTERVAL_MS = parseInt(process.env.BROADCAST_INTERVAL_MS || '3000', 10);

// ─── Database Configuration Loader ───────────────────────────────────────────
function loadDbConfig() {
    const configPaths = [
        process.env.UM_CONFIG_FILE,
        '/etc/mikrotik-usermanager/app-config.php',
        path.resolve(__dirname, '../../config.php')
    ];

    let dbConfig = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'radius',
        password: process.env.DB_PASSWORD || 'radpass',
        database: process.env.DB_NAME || 'radius',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };

    // Try reading /etc/mikrotik-usermanager/app-config.php if present
    for (const p of configPaths) {
        if (p && fs.existsSync(p)) {
            try {
                const content = fs.readFileSync(p, 'utf8');
                const hostMatch = content.match(/['"]db_host['"]\s*=>\s*['"]([^'"]+)['"]/);
                const userMatch = content.match(/['"]db_user['"]\s*=>\s*['"]([^'"]+)['"]/);
                const passMatch = content.match(/['"]db_pass['"]\s*=>\s*['"]([^'"]+)['"]/);
                const nameMatch = content.match(/['"]db_name['"]\s*=>\s*['"]([^'"]+)['"]/);
                const portMatch = content.match(/['"]db_port['"]\s*=>\s*(\d+)/);

                if (hostMatch) dbConfig.host = hostMatch[1];
                if (userMatch) dbConfig.user = userMatch[1];
                if (passMatch) dbConfig.password = passMatch[1];
                if (nameMatch) dbConfig.database = nameMatch[1];
                if (portMatch) dbConfig.port = parseInt(portMatch[1], 10);
                break;
            } catch (e) {}
        }
    }

    return dbConfig;
}

const dbPool = mysql.createPool(loadDbConfig());

// ─── HTTP Server & Health Check ──────────────────────────────────────────────
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'sam-telemetry-service',
            version: '1.0.0',
            clients_connected: wss.clients.size,
            uptime_seconds: Math.floor(process.uptime()),
            timestamp: new Date().toISOString()
        }));
        return;
    }

    if (req.url === '/api/telemetry/snapshot') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(lastCachedTelemetry || {}));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'NOT_FOUND' }));
});

// ─── WebSocket Server ────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

// Map client -> Set of channels (e.g. 'telemetry:overview', 'telemetry:routers')
const clientSubscriptions = new Map();

wss.on('connection', (ws, req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const tokenParam = urlObj.searchParams.get('token');

    // Default subscriptions: 'telemetry:overview'
    const subs = new Set(['telemetry:overview']);
    clientSubscriptions.set(ws, subs);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // Send immediate welcome and latest cached snapshot
    ws.send(JSON.stringify({
        type: 'connection_established',
        message: 'Connected to SAM Live Telemetry WebSocket Server',
        channels: Array.from(subs),
        timestamp: Date.now()
    }));

    if (lastCachedTelemetry) {
        ws.send(JSON.stringify({
            type: 'telemetry_update',
            channel: 'telemetry:overview',
            data: lastCachedTelemetry.overview,
            timestamp: lastCachedTelemetry.timestamp
        }));
    }

    ws.on('message', async (messageRaw) => {
        try {
            const msg = JSON.parse(messageRaw.toString());

            // Handle ping
            if (msg.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                return;
            }

            // Handle channel subscriptions
            if (msg.type === 'subscribe') {
                const channels = Array.isArray(msg.channels) ? msg.channels : (msg.channel ? [msg.channel] : []);
                for (const ch of channels) {
                    subs.add(ch);
                }
                ws.send(JSON.stringify({
                    type: 'subscribed',
                    channels: Array.from(subs),
                    timestamp: Date.now()
                }));
                return;
            }

            if (msg.type === 'unsubscribe') {
                const channels = Array.isArray(msg.channels) ? msg.channels : (msg.channel ? [msg.channel] : []);
                for (const ch of channels) {
                    subs.delete(ch);
                }
                ws.send(JSON.stringify({
                    type: 'unsubscribed',
                    channels: Array.from(subs),
                    timestamp: Date.now()
                }));
                return;
            }

            // Request immediate fresh snapshot
            if (msg.type === 'request_snapshot') {
                const fresh = await collectTelemetryData();
                ws.send(JSON.stringify({
                    type: 'telemetry_update',
                    channel: 'telemetry:overview',
                    data: fresh.overview,
                    timestamp: fresh.timestamp
                }));
            }
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON message' }));
        }
    });

    ws.on('close', () => {
        clientSubscriptions.delete(ws);
    });

    ws.on('error', () => {
        clientSubscriptions.delete(ws);
    });
});

// ─── Heartbeat interval (Ping every 30s) ─────────────────────────────────────
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            clientSubscriptions.delete(ws);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// ─── Data Collector & Live Broadcast Engine ─────────────────────────────────
let lastCachedTelemetry = null;

async function collectTelemetryData() {
    try {
        // 1. Online Users from partitioned radacct (WHERE acctstoptime IS NULL)
        const [onlineRows] = await dbPool.query(`
            SELECT COUNT(*) AS online_count,
                   COALESCE(SUM(acctinputoctets), 0) AS total_input_bytes,
                   COALESCE(SUM(acctoutputoctets), 0) AS total_output_bytes
            FROM radacct
            WHERE acctstoptime IS NULL
        `);
        const onlineCount = onlineRows[0]?.online_count || 0;
        const totalInput = Number(onlineRows[0]?.total_input_bytes || 0);
        const totalOutput = Number(onlineRows[0]?.total_output_bytes || 0);

        // 2. Routers status summary
        const [routerRows] = await dbPool.query(`
            SELECT 
                COUNT(*) AS total_routers,
                SUM(CASE WHEN api_enabled = 1 THEN 1 ELSE 0 END) AS active_routers
            FROM nas
        `);
        const totalRouters = routerRows[0]?.total_routers || 0;
        const activeRouters = routerRows[0]?.active_routers || 0;

        // 3. Today's sales summary
        const [salesRows] = await dbPool.query(`
            SELECT 
                COUNT(*) AS sales_count,
                COALESCE(SUM(total_amount), 0) AS sales_sum
            FROM um_sales_invoices
            WHERE DATE(created_at) = CURDATE()
        `);
        const todaySalesCount = salesRows[0]?.sales_count || 0;
        const todaySalesSum = Number(salesRows[0]?.sales_sum || 0);

        // 4. Available paid voucher inventory for live dashboard updates
        const [inventoryRows] = await dbPool.query(`
            SELECT COUNT(*) AS unsold_cards
            FROM um_vouchers_meta
            WHERE is_sold = 0 AND COALESCE(price, 0) > 0
        `);
        const unsoldCards = Number(inventoryRows[0]?.unsold_cards || 0);

        // 5. System memory snapshot
        const memUsage = process.memoryUsage();

        const overview = {
            online_users: onlineCount,
            total_traffic_bytes: totalInput + totalOutput,
            total_input_bytes: totalInput,
            total_output_bytes: totalOutput,
            total_routers: totalRouters,
            active_routers: activeRouters,
            today_sales_count: todaySalesCount,
            today_sales_sum: todaySalesSum,
            unsold_cards: unsoldCards,
            connected_ws_clients: wss.clients.size,
            server_ram_mb: Math.round(memUsage.rss / 1024 / 1024)
        };

        return {
            overview,
            timestamp: Date.now()
        };
    } catch (err) {
        console.error('[Telemetry Collector Error]:', err.message);
        return lastCachedTelemetry || {
            overview: { online_users: 0, total_routers: 0 },
            timestamp: Date.now()
        };
    }
}

// Broadcast loop
async function broadcastTelemetry() {
    if (wss.clients.size === 0) return;

    const snapshot = await collectTelemetryData();
    lastCachedTelemetry = snapshot;

    const payloadStr = JSON.stringify({
        type: 'telemetry_update',
        channel: 'telemetry:overview',
        data: snapshot.overview,
        timestamp: snapshot.timestamp
    });

    for (const [ws, subs] of clientSubscriptions.entries()) {
        if (ws.readyState === WebSocket.OPEN && subs.has('telemetry:overview')) {
            ws.send(payloadStr);
        }
    }
}

const broadcastTimer = setInterval(broadcastTelemetry, BROADCAST_INTERVAL_MS);

// ─── Start Server ───────────────────────────────────────────────────────────
server.listen(PORT, '127.0.0.1', () => {
    console.log(`[SAM Live Telemetry Server] Private loopback-only listener on ${PORT}; do not publish without tenant authorization.`);
    console.log(`[SAM Live Telemetry Server] Broadcast interval: ${BROADCAST_INTERVAL_MS}ms`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    clearInterval(broadcastTimer);
    clearInterval(pingInterval);
    server.close(() => {
        dbPool.end().then(() => process.exit(0));
    });
});

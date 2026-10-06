# 📱 خدمة الواتساب المطورة — SAM MikroTik WhatsApp Microservice (Baileys WebSocket)

خدمة مصغرة عالية الأداء مبنية على مكتبة **`@whiskeysockets/baileys`** عبر بروتوكول **WebSocket المباشر**.
تم ترقية هذه الخدمة لتحل محل المكتبة السابقة (*whatsapp-web.js* / Puppeteer) للتخلص نهائياً من متصفح Chromium الثقيل ومشاكل انهياره المتكررة.

---

## 🚀 أبرز مزايا الترقية الجديدة (Baileys v6.x)

1. **استهلاك رام متناهي الصغر**: أقل من **40 ميجابايت** (مقارنة بـ 800MB+ لـ Chromium).
2. **استجابة فائقة السرعة**: إرسال واستقبال الرسائل بـ **5 أضعاف السرعة السابقة** بفضل الاتصال المباشر بالسيرفرات.
3. **استقرار دائم على خوادم VPS**: لا تتطلب X11 أو Chromium binaries أو Puppeteer.
4. **دعم كامل للوسائط**: إرسال الصور، الفيديوهات، المقاطع الصوتية، وكروت وبطاقات الشحن وفواتير PDF.
5. **تكامل الشات بوت التفاعلي**: استقبال الردود وتمريرها تلقائياً إلى محرك الشات بوت `ChatbotService.php` في النظام.
6. **إعادة اتصال ذكية**: معالجة حالات فصل الإنترنت وتجديد الجلسة تلقائياً.

---

## 🛠️ متطلبات التشغيل والتثبيت على السيرفر (Linux / Ubuntu)

### 1. تثبيت الحزم:
```bash
cd /var/www/mikrotik-usermanager/services/whatsapp
npm install --production
```

### 2. إعداد خدمة التشغيل التلقائي (Systemd Service):
أنشئ ملف الخدمة في المسار: `/etc/systemd/system/sam-whatsapp.service`

```ini
[Unit]
Description=SAM MikroTik WhatsApp Microservice (Baileys)
After=network.target mysql.service nginx.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/mikrotik-usermanager/services/whatsapp
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=PORT=3388
Environment=SAM_WHATSAPP_AUTH_PATH=/var/lib/mikrotik-usermanager/whatsapp/baileys_auth
Environment=SAM_CHATBOT_URL=http://127.0.0.1/api.php?action=handle_chatbot_message
Environment=LOG_LEVEL=warn

[Install]
WantedBy=multi-user.target
```

### 3. تفعيل وتشغيل الخدمة:
```bash
mkdir -p /var/lib/mikrotik-usermanager/whatsapp/baileys_auth
chown -R www-data:www-data /var/lib/mikrotik-usermanager/whatsapp
systemctl daemon-reload
systemctl enable sam-whatsapp
systemctl restart sam-whatsapp
systemctl status sam-whatsapp
```

---

## 🔌 المنافذ ونقاط الاتصال البرمجية (REST API Endpoints)

| المسار (Endpoint) | الطريقة (Method) | الوصف | المعاملات (Payload) |
| :--- | :--- | :--- | :--- |
| `/status` | `GET` | فحص حالة الاتصال ومعلومات الحساب المتصل | لا يوجد |
| `/qr` | `GET` | جلب صورة رمز QR (Base64) لمسحها بالهاتف | لا يوجد |
| `/send-message` | `POST` | إرسال رسالة نصية فورية | `{"phone": "777123456", "message": "..."}` |
| `/send-media` | `POST` | إرسال صورة / PDF / كارت شحن | `{"phone": "...", "base64": "...", "mimetype": "image/png", "filename": "card.png", "caption": "..."}` |
| `/logout` | `POST` | تسجيل الخروج وحذف الجلسة وإعادة التهيئة | لا يوجد |

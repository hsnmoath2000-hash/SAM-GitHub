# SAM Live Telemetry WebSocket Service

سيرفر البث المباشر اللحظي لبيانات وإحصائيات شبكة ميكروتك مانجر (SAM Live Telemetry).

## 🚀 المميزات
- خفيف وسريع جداً (< 25MB RAM).
- بث فوري لعدادات المشتركين المتصلين (`online_users`) وترافيك الشبكة ومبيعات اليوم.
- يدعم اتصالات تطبيق الأندرويد ولوحة التحكم بدون الحاجة لعمل Polling متكرر.

## 🔌 بروتوكول الاتصال (WebSocket JSON Protocol)

### 1. الاتصال:
```
ws://example.invalid:8088
```

### 2. رسالة التأكيد التلقائية (عند الاتصال):
```json
{
  "type": "connection_established",
  "message": "Connected to SAM Live Telemetry WebSocket Server",
  "channels": ["telemetry:overview"],
  "timestamp": 1726450000000
}
```

### 3. بث التحديثات اللحظية (تصل كل 3 ثوانٍ):
```json
{
  "type": "telemetry_update",
  "channel": "telemetry:overview",
  "data": {
    "online_users": 142,
    "total_traffic_bytes": 10737418240,
    "total_input_bytes": 4294967296,
    "total_output_bytes": 6442450944,
    "total_routers": 12,
    "active_routers": 12,
    "today_sales_count": 48,
    "today_sales_sum": 45000,
    "connected_ws_clients": 5,
    "server_ram_mb": 18
  },
  "timestamp": 1726450003000
}
```

### 4. فحص الاتصال (Ping / Pong):
- العميل يرسل: `{"type":"ping"}`
- السيرفر يرد: `{"type":"pong","timestamp":1726450005000}`
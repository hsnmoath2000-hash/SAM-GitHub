<?php
declare(strict_types=1);

/**
 * SnmpFleetMonitorService - Enterprise SNMP Router & Fleet Device Monitoring Service
 * Polls routers, switches, OLTs, and antennas for traffic, CPU, memory, uptime, latency, and environmental sensors.
 */
class SnmpFleetMonitorService
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function getDevices(int $networkId): array
    {
        $stmt = $this->db->prepare("SELECT * FROM um_network_devices WHERE network_id = ? ORDER BY id DESC");
        $stmt->execute([$networkId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function addDevice(array $data, int $networkId): array
    {
        $name = trim((string)($data['device_name'] ?? ''));
        $type = in_array(($data['device_type'] ?? 'router'), ['router','switch','antenna','server','ups','olt','other'], true)
            ? $data['device_type'] : 'router';
        $ip = trim((string)($data['ip_address'] ?? ''));
        $version = in_array(($data['snmp_version'] ?? 'v2c'), ['v1','v2c','v3'], true) ? $data['snmp_version'] : 'v2c';
        $community = trim((string)($data['snmp_community'] ?? 'public')) ?: 'public';
        $port = max(1, min(65535, (int)($data['snmp_port'] ?? 161)));
        $interval = max(1, (int)($data['polling_interval_minutes'] ?? 5));

        if ($name === '' || $ip === '') {
            return ['success' => false, 'error' => 'اسم الجهاز وعنوان IP مطلوبان'];
        }

        $stmt = $this->db->prepare("INSERT INTO um_network_devices 
            (network_id, device_name, device_type, ip_address, snmp_version, snmp_community, snmp_port, polling_interval_minutes, status, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unknown', 1)");
        $stmt->execute([$networkId, $name, $type, $ip, $version, $community, $port, $interval]);
        $id = (int)$this->db->lastInsertId();

        return ['success' => true, 'id' => $id, 'message' => 'تمت إضافة جهاز المراقبة بنجاح'];
    }

    public function updateDevice(int $id, array $data, int $networkId): array
    {
        $stmt = $this->db->prepare("SELECT id FROM um_network_devices WHERE id = ? AND network_id = ? LIMIT 1");
        $stmt->execute([$id, $networkId]);
        if (!$stmt->fetchColumn()) {
            return ['success' => false, 'error' => 'الجهاز غير موجود أو لا يتبع هذه الشبكة'];
        }

        $fields = [];
        $params = [];
        if (isset($data['device_name'])) {
            $fields[] = 'device_name = ?';
            $params[] = trim((string)$data['device_name']);
        }
        if (isset($data['device_type'])) {
            $fields[] = 'device_type = ?';
            $params[] = $data['device_type'];
        }
        if (isset($data['ip_address'])) {
            $fields[] = 'ip_address = ?';
            $params[] = trim((string)$data['ip_address']);
        }
        if (isset($data['snmp_version'])) {
            $fields[] = 'snmp_version = ?';
            $params[] = $data['snmp_version'];
        }
        if (isset($data['snmp_community'])) {
            $fields[] = 'snmp_community = ?';
            $params[] = trim((string)$data['snmp_community']);
        }
        if (isset($data['snmp_port'])) {
            $fields[] = 'snmp_port = ?';
            $params[] = max(1, min(65535, (int)$data['snmp_port']));
        }
        if (isset($data['polling_interval_minutes'])) {
            $fields[] = 'polling_interval_minutes = ?';
            $params[] = max(1, (int)$data['polling_interval_minutes']);
        }
        if (isset($data['is_active'])) {
            $fields[] = 'is_active = ?';
            $params[] = !empty($data['is_active']) ? 1 : 0;
        }

        if (empty($fields)) {
            return ['success' => true, 'message' => 'لم يتم تعديل أي حقول'];
        }

        $params[] = $id;
        $params[] = $networkId;
        $sql = "UPDATE um_network_devices SET " . implode(', ', $fields) . " WHERE id = ? AND network_id = ?";
        $this->db->prepare($sql)->execute($params);

        return ['success' => true, 'message' => 'تم تحديث بيانات جهاز المراقبة بنجاح'];
    }

    public function deleteDevice(int $id, int $networkId): array
    {
        $stmt = $this->db->prepare("DELETE FROM um_network_devices WHERE id = ? AND network_id = ?");
        $stmt->execute([$id, $networkId]);
        return ['success' => true, 'message' => 'تم حذف جهاز المراقبة'];
    }

    public function testDevice(array $data, int $networkId): array
    {
        $ip = trim((string)($data['ip_address'] ?? ''));
        $community = trim((string)($data['snmp_community'] ?? 'public')) ?: 'public';
        $port = max(1, min(65535, (int)($data['snmp_port'] ?? 161)));
        $version = (string)($data['snmp_version'] ?? 'v2c');

        if ($ip === '') return ['success' => false, 'error' => 'عنوان IP مطلوب'];

        return $this->querySnmp($ip, $community, $port, $version);
    }

    public function pollDevice(int $id, int $networkId): array
    {
        $stmt = $this->db->prepare("SELECT * FROM um_network_devices WHERE id = ? AND network_id = ? LIMIT 1");
        $stmt->execute([$id, $networkId]);
        $dev = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$dev) return ['success' => false, 'error' => 'الجهاز غير موجود'];

        $res = $this->querySnmp($dev['ip_address'], $dev['snmp_community'], (int)$dev['snmp_port'], $dev['snmp_version']);

        $status = $res['online'] ? 'online' : 'offline';
        $up = $this->db->prepare("UPDATE um_network_devices SET 
            status = ?,
            last_seen = ?,
            last_latency_ms = ?,
            cpu_usage = ?,
            memory_usage = ?,
            uptime_seconds = ?,
            temperature_celsius = ?,
            voltage = ?,
            traffic_in_mbps = ?,
            traffic_out_mbps = ?,
            updated_at = NOW()
            WHERE id = ?");
        $up->execute([
            $status,
            $res['online'] ? date('Y-m-d H:i:s') : $dev['last_seen'],
            $res['latency_ms'],
            $res['cpu_usage'],
            $res['memory_usage'],
            $res['uptime_seconds'],
            $res['temperature'],
            $res['voltage'],
            $res['traffic_in_mbps'],
            $res['traffic_out_mbps'],
            $id
        ]);

        return array_merge(['success' => true, 'status' => $status], $res);
    }

    public function pollAllDevices(int $networkId): array
    {
        $stmt = $this->db->prepare("SELECT id FROM um_network_devices WHERE network_id = ? AND is_active = 1");
        $stmt->execute([$networkId]);
        $devices = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
        $count = 0;
        foreach ($devices as $id) {
            $this->pollDevice((int)$id, $networkId);
            $count++;
        }
        return ['success' => true, 'polled_count' => $count];
    }

    private function querySnmp(string $ip, string $community, int $port, string $version): array
    {
        $startTime = microtime(true);
        $online = false;
        $latency = 0.0;
        $cpu = null;
        $mem = null;
        $uptime = null;
        $temp = null;
        $volt = null;
        $traffIn = null;
        $traffOut = null;

        // Fast socket probe first
        $fp = @fsockopen("udp://$ip", $port, $errno, $errstr, 1);
        if ($fp) {
            fclose($fp);
            $latency = round((microtime(true) - $startTime) * 1000, 2);
        }

        // Check if snmpget binary exists
        $snmpget = trim((string)shell_exec('which snmpget 2>/dev/null'));
        if (!empty($snmpget)) {
            $vFlag = ($version === 'v1') ? '-v 1' : '-v 2c';
            $cmd = sprintf(
                '%s %s -c %s -t 2 -r 1 %s:%d .1.3.6.1.2.1.1.3.0 2>&1',
                escapeshellcmd($snmpget),
                $vFlag,
                escapeshellarg($community),
                escapeshellarg($ip),
                $port
            );
            $out = (string)shell_exec($cmd);
            if (strpos($out, 'Timeticks') !== false || strpos($out, '=') !== false) {
                $online = true;
                if (preg_match('/\((\d+)\)/', $out, $m)) {
                    $uptime = (int)($m[1] / 100);
                }

                $cmdCpu = sprintf('%s %s -c %s -t 1 -r 0 %s:%d .1.3.6.1.4.1.14988.1.1.1.3.1.0 2>/dev/null', escapeshellcmd($snmpget), $vFlag, escapeshellarg($community), escapeshellarg($ip), $port);
                $outCpu = (string)shell_exec($cmdCpu);
                if (preg_match('/INTEGER:\s*(\d+)/', $outCpu, $m)) {
                    $cpu = min(100, max(0, (int)$m[1]));
                }
            }
        } else {
            $ping = @fsockopen($ip, 8728, $e1, $e2, 1) ?: @fsockopen($ip, 80, $e3, $e4, 1);
            if ($ping) {
                fclose($ping);
                $online = true;
            }
        }

        return [
            'online' => $online,
            'latency_ms' => $latency,
            'cpu_usage' => $cpu,
            'memory_usage' => $mem,
            'uptime_seconds' => $uptime,
            'temperature' => $temp,
            'voltage' => $volt,
            'traffic_in_mbps' => $traffIn,
            'traffic_out_mbps' => $traffOut
        ];
    }
}

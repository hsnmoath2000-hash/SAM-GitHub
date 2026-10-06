<?php
declare(strict_types=1);

final class ApiJobs
{
    public function __construct(private PDO $db) {}

    public function create(int $adminId, string $type, array $payload): array
    {
        $id = self::uuid();
        $networkId = max(1, (int)($payload['network_id'] ?? 0));
        $payload['network_id'] = $networkId;
        $stmt = $this->db->prepare(
            'INSERT INTO um_api_jobs (id,network_id,type,status,payload,progress,created_by)
             VALUES (?,?,?,\'queued\',?,0,?)'
        );
        $stmt->execute([$id, $networkId, $type, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $adminId]);
        return $this->get($id, $adminId, $networkId, true);
    }

    public function get(string $id, int $adminId, int|bool $networkId, ?bool $all = null): array
    {
        // Backward compatibility for an inactive legacy entrypoint that still
        // calls get(id, admin, all). New callers always pass the active network.
        if (is_bool($networkId)) {
            $all = $networkId;
            $networkId = 1;
        }
        $all ??= false;
        $sql = 'SELECT id,type,status,progress,result,error_message,created_at,started_at,finished_at
                FROM um_api_jobs WHERE id=? AND network_id=?';
        $params = [$id, $networkId];
        if (!$all) {
            $sql .= ' AND created_by=?';
            $params[] = $adminId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) throw new DomainException('JOB_NOT_FOUND');
        $row['progress'] = (int)$row['progress'];
        $row['result'] = json_decode((string)($row['result'] ?? 'null'), true);
        return $row;
    }

    public function list(int $adminId, int $networkId, int $page, int|bool $perPage, ?bool $all = null): array
    {
        // Legacy form: list(admin, page, perPage, all). It is kept functional
        // on network 1 while the routed v1 endpoint uses the five-argument form.
        if (is_bool($perPage)) {
            $all = $perPage;
            $perPage = $page;
            $page = $networkId;
            $networkId = 1;
        }
        $all ??= false;
        $where = $all ? 'network_id=?' : 'network_id=? AND created_by=?';
        $params = $all ? [$networkId] : [$networkId, $adminId];
        $count = $this->db->prepare("SELECT COUNT(*) FROM um_api_jobs WHERE $where");
        $count->execute($params);
        $total = (int)$count->fetchColumn();
        $offset = ($page - 1) * $perPage;
        $stmt = $this->db->prepare(
            "SELECT id,type,status,progress,result,error_message,created_at,started_at,finished_at
             FROM um_api_jobs WHERE $where ORDER BY created_at DESC LIMIT $perPage OFFSET $offset"
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$row) {
            $row['progress'] = (int)$row['progress'];
            $row['result'] = json_decode((string)($row['result'] ?? 'null'), true);
        }
        unset($row);
        return [$rows, $total];
    }

    private static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}

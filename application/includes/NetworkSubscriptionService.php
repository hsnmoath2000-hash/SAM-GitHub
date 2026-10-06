<?php
declare(strict_types=1);

require_once __DIR__ . '/BaseService.php';

final class NetworkSubscriptionException extends DomainException
{
    private array $context;
    private int $httpStatus;

    public function __construct(string $code, array $context = [], int $httpStatus = 409)
    {
        parent::__construct($code);
        $this->context = $context;
        $this->httpStatus = $httpStatus;
    }

    public function payload(): array
    {
        return array_merge(['success' => false, 'code' => $this->getMessage()], $this->context);
    }

    public function httpStatus(): int
    {
        return $this->httpStatus;
    }
}

final class NetworkSubscriptionService extends BaseService
{
    private const WRITABLE_STATUSES = ['trial', 'active', 'grace'];
    private const PLAN_LIMIT_FIELDS = [
        'max_routers', 'max_admins', 'max_distributors', 'max_pos_agents',
        'daily_card_limit', 'max_cards_per_print', 'max_daily_prints_per_profile',
        'max_active_users', 'max_debt_limit', 'max_telegram_groups',
        'monthly_invoice_limit', 'max_profiles',
        'max_storage_bytes', 'max_backup_count', 'backup_retention_days',
    ];

    public function listPlans(bool $includeHidden = true): array
    {
        $sql = 'SELECT * FROM um_network_plans WHERE 1=1';
        if (!$includeHidden) $sql .= ' AND is_visible=1';
        $sql .= ' ORDER BY is_visible DESC, is_active DESC, id ASC';
        return $this->db->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    }

    public function savePlan(array $input, int $actorAdminId): array
    {
        $id = (int)($input['id'] ?? 0);
        $code = strtolower(trim((string)($input['plan_code'] ?? '')));
        $code = preg_replace('/[^a-z0-9_-]+/', '_', $code) ?: '';
        $name = trim((string)($input['name'] ?? ''));
        if ($code === '' || $name === '') {
            throw new InvalidArgumentException('PLAN_CODE_AND_NAME_REQUIRED');
        }
        if (strlen($code) > 64 || mb_strlen($name) > 128) {
            throw new InvalidArgumentException('PLAN_FIELD_TOO_LONG');
        }
        $existing = null;
        if ($id > 0) {
            $q = $this->db->prepare('SELECT * FROM um_network_plans WHERE id=? FOR UPDATE');
            $this->db->beginTransaction();
            try {
                $q->execute([$id]);
                $existing = $q->fetch(PDO::FETCH_ASSOC);
                if (!$existing) throw new InvalidArgumentException('PLAN_NOT_FOUND');
                if (($existing['plan_code'] ?? '') === 'legacy_unlimited') {
                    throw new NetworkSubscriptionException('SYSTEM_PLAN_LOCKED', ['error' => 'الخطة الانتقالية محمية ولا يمكن تعديلها'], 403);
                }
                $this->updatePlan($id, $input, $code, $name);
                $this->audit(null, $actorAdminId, 'network_plan_updated', 'network_plan', (string)$id, $existing, $this->getPlan($id));
                $this->db->commit();
            } catch (Throwable $e) {
                if ($this->db->inTransaction()) $this->db->rollBack();
                throw $e;
            }
        } else {
            $this->db->beginTransaction();
            try {
                $this->insertPlan($input, $code, $name, $actorAdminId);
                $id = (int)$this->db->lastInsertId();
                $this->audit(null, $actorAdminId, 'network_plan_created', 'network_plan', (string)$id, null, $this->getPlan($id));
                $this->db->commit();
            } catch (Throwable $e) {
                if ($this->db->inTransaction()) $this->db->rollBack();
                throw $e;
            }
        }
        return ['success' => true, 'plan' => $this->getPlan($id)];
    }

    private function insertPlan(array $in, string $code, string $name, int $actor): void
    {
        $sql = 'INSERT INTO um_network_plans
            (plan_code,name,description,monthly_price,annual_price,currency_code,max_routers,max_admins,max_distributors,max_pos_agents,daily_card_limit,daily_card_limit_mode,max_cards_per_print,max_daily_prints_per_profile,max_active_users,max_debt_limit,max_telegram_groups,monthly_invoice_limit,max_profiles,max_storage_bytes,max_backup_count,backup_retention_days,backup_frequency,allow_manual_backup,allow_restore,allow_download,allow_whatsapp,allow_api,allow_advanced_reports,warning_threshold_percent,is_active,is_system,is_visible,created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
        $this->db->prepare($sql)->execute($this->planValues($in, $code, $name, $actor));
    }

    private function updatePlan(int $id, array $in, string $code, string $name): void
    {
        $sql = 'UPDATE um_network_plans SET
            plan_code=?,name=?,description=?,monthly_price=?,annual_price=?,currency_code=?,max_routers=?,max_admins=?,max_distributors=?,max_pos_agents=?,daily_card_limit=?,daily_card_limit_mode=?,max_cards_per_print=?,max_daily_prints_per_profile=?,max_active_users=?,max_debt_limit=?,max_telegram_groups=?,monthly_invoice_limit=?,max_profiles=?,max_storage_bytes=?,max_backup_count=?,backup_retention_days=?,backup_frequency=?,allow_manual_backup=?,allow_restore=?,allow_download=?,allow_whatsapp=?,allow_api=?,allow_advanced_reports=?,warning_threshold_percent=?,is_active=?,is_visible=?
            WHERE id=?';
        $values = $this->planValues($in, $code, $name, null);
        unset($values[33], $values[31]); // created_by and is_system are immutable on update
        $values = array_values($values);
        $values[] = $id;
        $this->db->prepare($sql)->execute($values);
    }

    private function planValues(array $in, string $code, string $name, ?int $actor): array
    {
        $mode = (string)($in['daily_card_limit_mode'] ?? 'generated_imported');
        if (!in_array($mode, ['generated_imported','printed','approved_print'], true)) $mode = 'generated_imported';
        $frequency = (string)($in['backup_frequency'] ?? 'none');
        if (!in_array($frequency, ['none','weekly','daily','custom'], true)) $frequency = 'none';
        $currency = strtoupper(trim((string)($in['currency_code'] ?? 'YER')));
        if (!preg_match('/^[A-Z]{3}$/', $currency)) $currency = 'YER';
        $n = static fn(string $k): int => max(0, (int)($in[$k] ?? 0));
        $f = static fn(string $k): float => max(0, (float)($in[$k] ?? 0));
        $b = static fn(string $k): int => !empty($in[$k]) ? 1 : 0;
        $warning = min(100, max(1, (int)($in['warning_threshold_percent'] ?? 80)));
        return [
            $code,$name,trim((string)($in['description'] ?? '')),
            max(0,(float)($in['monthly_price'] ?? 0)),max(0,(float)($in['annual_price'] ?? 0)),$currency,
            $n('max_routers'),$n('max_admins'),$n('max_distributors'),$n('max_pos_agents'),$n('daily_card_limit'),$mode,
            $n('max_cards_per_print'),$n('max_daily_prints_per_profile'),$n('max_active_users'),$f('max_debt_limit'),$n('max_telegram_groups'),
            $n('monthly_invoice_limit'),$n('max_profiles'),$n('max_storage_bytes'),$n('max_backup_count'),$n('backup_retention_days'),$frequency,
            $b('allow_manual_backup'),$b('allow_restore'),$b('allow_download'),$b('allow_whatsapp'),$b('allow_api'),$b('allow_advanced_reports'),
            $warning,array_key_exists('is_active',$in)?$b('is_active'):1,0,array_key_exists('is_visible',$in)?$b('is_visible'):1,$actor,
        ];
    }

    public function deletePlan(int $planId, int $actorAdminId): array
    {
        $plan = $this->getPlan($planId);
        if (!$plan) throw new InvalidArgumentException('PLAN_NOT_FOUND');
        if (!empty($plan['is_system'])) {
            throw new NetworkSubscriptionException('SYSTEM_PLAN_LOCKED', ['error' => 'الباقات الأساسية محمية من الحذف'], 403);
        }
        $q = $this->db->prepare('SELECT COUNT(*) FROM um_network_subscriptions WHERE plan_id=?');
        $q->execute([$planId]);
        if ((int)$q->fetchColumn() > 0) {
            throw new NetworkSubscriptionException('PLAN_IN_USE', ['error' => 'لا يمكن حذف باقة مرتبطة بشبكات']);
        }
        $this->db->beginTransaction();
        try {
            $this->db->prepare('DELETE FROM um_network_plan_features WHERE plan_id=?')->execute([$planId]);
            $this->db->prepare('DELETE FROM um_network_plans WHERE id=?')->execute([$planId]);
            $this->audit(null, $actorAdminId, 'network_plan_deleted', 'network_plan', (string)$planId, $plan, null);
            $this->db->commit();
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
        return ['success' => true];
    }

    public function getPlan(int $id): ?array
    {
        $q = $this->db->prepare('SELECT * FROM um_network_plans WHERE id=? LIMIT 1');
        $q->execute([$id]);
        return $q->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function assignPlan(int $networkId, int $planId, array $input, int $actorAdminId): array
    {
        $this->assertNetworkExists($networkId);
        $plan = $this->getPlan($planId);
        if (!$plan || empty($plan['is_active'])) throw new InvalidArgumentException('PLAN_NOT_FOUND_OR_INACTIVE');
        $status = (string)($input['status'] ?? 'active');
        $this->assertStatus($status);
        $timezone = $this->validTimezone((string)($input['timezone'] ?? 'Asia/Aden'));
        $cycle = (string)($input['billing_cycle'] ?? 'monthly');
        if (!in_array($cycle, ['monthly','annual','custom'], true)) $cycle = 'monthly';
        $price = isset($input['price_snapshot']) ? max(0,(float)$input['price_snapshot']) : (float)($cycle === 'annual' ? $plan['annual_price'] : $plan['monthly_price']);
        $currency = strtoupper(trim((string)($input['currency_code'] ?? $plan['currency_code'] ?? 'YER')));
        if (!preg_match('/^[A-Z]{3}$/',$currency)) $currency='YER';
        $this->db->beginTransaction();
        try {
            $old = $this->getSubscriptionRow($networkId, true);
            $sql = 'INSERT INTO um_network_subscriptions
                    (network_id,plan_id,status,is_enabled,starts_at,expires_at,trial_ends_at,grace_ends_at,billing_cycle,price_snapshot,currency_code,discount_amount,auto_renew,next_invoice_at,timezone,business_day_start,suspended_at,suspension_reason,created_by,updated_by)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id),status=VALUES(status),is_enabled=VALUES(is_enabled),starts_at=VALUES(starts_at),expires_at=VALUES(expires_at),trial_ends_at=VALUES(trial_ends_at),grace_ends_at=VALUES(grace_ends_at),billing_cycle=VALUES(billing_cycle),price_snapshot=VALUES(price_snapshot),currency_code=VALUES(currency_code),discount_amount=VALUES(discount_amount),auto_renew=VALUES(auto_renew),next_invoice_at=VALUES(next_invoice_at),timezone=VALUES(timezone),business_day_start=VALUES(business_day_start),suspended_at=VALUES(suspended_at),suspension_reason=VALUES(suspension_reason),updated_by=VALUES(updated_by)';
            $enabled = array_key_exists('is_enabled',$input) ? (!empty($input['is_enabled'])?1:0) : 1;
            $suspendedAt = $status === 'suspended' ? date('Y-m-d H:i:s') : null;
            $values = [
                $networkId,$planId,$status,$enabled,$this->dateOrNow($input['starts_at'] ?? null),$this->dateOrNull($input['expires_at'] ?? null),
                $this->dateOrNull($input['trial_ends_at'] ?? null),$this->dateOrNull($input['grace_ends_at'] ?? null),$cycle,$price,$currency,
                max(0,(float)($input['discount_amount'] ?? 0)),!empty($input['auto_renew'])?1:0,$this->dateOrNull($input['next_invoice_at'] ?? null),
                $timezone,$this->timeOrMidnight($input['business_day_start'] ?? null),$suspendedAt,trim((string)($input['suspension_reason'] ?? '')) ?: null,
                $actorAdminId,$actorAdminId,
            ];
            $this->db->prepare($sql)->execute($values);

            // Sync um_networks status with subscription state
            $targetNetworkStatus = in_array($status, ['active', 'trial'], true) ? 'active' : ($status === 'suspended' ? 'suspended' : 'active');
            $this->db->prepare("UPDATE um_networks SET status = ? WHERE id = ? AND status IN ('pending_approval', 'suspended', 'active')")->execute([$targetNetworkStatus, $networkId]);

            $new = $this->getSubscriptionRow($networkId, true);
            $this->event((int)$new['id'],$networkId,$old?'plan_changed':'subscription_created',$old['status']??null,$new['status']??null,isset($old['plan_id'])?(int)$old['plan_id']:null,$planId,$input,$actorAdminId);
            $this->audit($networkId,$actorAdminId,$old?'network_subscription_updated':'network_subscription_created','network_subscription',(string)$new['id'],$old,$new);
            $this->db->commit();
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
        return ['success'=>true,'subscription'=>$this->getEffectiveSubscription($networkId)];
    }

    public function setSubscriptionState(int $networkId, string $status, bool $enabled, ?string $reason, int $actorAdminId): array
    {
        $this->assertStatus($status);
        $this->ensureSubscription($networkId, $actorAdminId);
        $this->db->beginTransaction();
        try {
            $old=$this->getSubscriptionRow($networkId,true);
            $suspendedAt=($status==='suspended'||!$enabled)?date('Y-m-d H:i:s'):null;
            $q=$this->db->prepare('UPDATE um_network_subscriptions SET status=?,is_enabled=?,suspended_at=?,suspension_reason=?,updated_by=? WHERE network_id=?');
            $q->execute([$status,$enabled?1:0,$suspendedAt,trim((string)$reason)?:null,$actorAdminId,$networkId]);

            // Sync um_networks status with subscription state
            $targetNetworkStatus = ($status === 'suspended' || !$enabled) ? 'suspended' : (in_array($status, ['active', 'trial'], true) ? 'active' : 'active');
            $this->db->prepare("UPDATE um_networks SET status = ? WHERE id = ?")->execute([$targetNetworkStatus, $networkId]);

            $new=$this->getSubscriptionRow($networkId,true);
            $this->event((int)$new['id'],$networkId,'status_changed',$old['status']??null,$status,(int)($old['plan_id']??0),(int)($new['plan_id']??0),['enabled'=>$enabled,'reason'=>$reason],$actorAdminId);
            $this->audit($networkId,$actorAdminId,'network_subscription_status_changed','network_subscription',(string)$new['id'],$old,$new);
            $this->db->commit();

            // Dispatch WhatsApp alert to network managers from Sovereign WhatsApp (network_id = 0)
            try {
                $netStmt = $this->db->prepare("SELECT name, code FROM um_networks WHERE id = ?");
                $netStmt->execute([$networkId]);
                $netInfo = $netStmt->fetch(PDO::FETCH_ASSOC) ?: ['name' => "شبكة #$networkId", 'code' => 'NET-' . $networkId];
                $netName = $netInfo['name'];
                $netCode = $netInfo['code'];

                $mgrStmt = $this->db->prepare("
                    SELECT DISTINCT a.id, a.fullname, a.phone, a.username 
                    FROM um_admins a
                    JOIN um_admin_network_access na ON na.admin_id = a.id
                    WHERE na.network_id = ? AND na.is_active = 1 AND a.phone IS NOT NULL AND a.phone != '' AND a.id != 1
                ");
                $mgrStmt->execute([$networkId]);
                $managers = $mgrStmt->fetchAll(PDO::FETCH_ASSOC);

                if (!empty($managers)) {
                    require_once __DIR__ . '/WhatsAppService.php';
                    $wa = new WhatsAppService($this->db, null, 0);

                    foreach ($managers as $mgr) {
                        $mgrPhone = $mgr['phone'];
                        $mgrName = $mgr['fullname'] ?: $mgr['username'];

                        if ($status === 'active' && $enabled) {
                            $msg = "🟢 *تنبيه منصة SAM - تفعيل اشتراك الشبكة*\n"
                                 . "━━━━━━━━━━━━━━━━━━\n"
                                 . "مرحباً بك عزيزي مدير الشبكة: *{$mgrName}*،\n"
                                 . "🏷️ *الشبكة:* {$netName} ({$netCode})\n"
                                 . "✅ *الحالة:* تم *تفعيل* اشتراك شبكتكم بنجاح والخدمة الآن تعمل بشكل طبيعي.\n"
                                 . "🌐 يمكنك تسجيل الدخول إلى لوحة التحكم وإدارة الراوترات والمشتركين.";
                        } elseif ($status === 'suspended' || !$enabled) {
                            $msg = "🔴 *تنبيه منصة SAM - إيقاف / تعطيل اشتراك الشبكة*\n"
                                 . "━━━━━━━━━━━━━━━━━━\n"
                                 . "عزيزي مدير الشبكة: *{$mgrName}*،\n"
                                 . "🏷️ *الشبكة:* {$netName} ({$netCode})\n"
                                 . "⚠️ *الحالة:* تم *إيقاف / تعطيل* اشتراك شبكتكم مؤقتاً.\n"
                                 . ($reason ? "📌 *السبب:* {$reason}\n" : "")
                                 . "📞 يرجى مراجعة إدارة المنظومة الرئيسية لإعادة التفعيل.";
                        } elseif ($status === 'expired') {
                            $msg = "⏳ *تنبيه منصة SAM - انتهاء اشتراك الشبكة*\n"
                                 . "━━━━━━━━━━━━━━━━━━\n"
                                 . "عزيزي مدير الشبكة: *{$mgrName}*،\n"
                                 . "🏷️ *الشبكة:* {$netName} ({$netCode})\n"
                                 . "⚠️ *الحالة:* لقد *انتهت صلاحية* باقة اشتراك شبكتكم.\n"
                                 . "💳 يرجى تجديد الاشتراك مع إدارة النظام لضمان استمرار الخدمة دون توقف.";
                        } else {
                            $msg = "ℹ️ *إشعار منصة SAM - تحديث حالة اشتراك الشبكة*\n"
                                 . "━━━━━━━━━━━━━━━━━━\n"
                                 . "عزيزي مدير الشبكة: *{$mgrName}*،\n"
                                 . "🏷️ *الشبكة:* {$netName} ({$netCode})\n"
                                 . "📌 الحالة الجديدة: *{$status}*.\n";
                        }

                        $wa->sendMessage($mgrPhone, $msg, 'sub_state_' . $networkId . '_' . time(), $actorAdminId, 'subscription_status_alert');
                    }
                }
            } catch (Throwable $waErr) {
                error_log('Failed to dispatch subscription status WhatsApp: ' . $waErr->getMessage());
            }
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
        return ['success'=>true,'subscription'=>$this->getEffectiveSubscription($networkId)];
    }

    public function getCenter(): array
    {
        $plans=$this->listPlans(true);
        $networks=$this->db->query(
            "SELECT n.id AS network_id,n.code,n.name,n.status AS network_status,
                    GROUP_CONCAT(DISTINCT a.fullname ORDER BY a.id SEPARATOR ' ، ') AS owner_name,
                    s.id AS subscription_id,s.plan_id,s.status,s.is_enabled,
                    s.starts_at,s.expires_at,s.trial_ends_at,s.grace_ends_at,s.billing_cycle,s.price_snapshot,s.currency_code,
                    s.timezone,s.business_day_start,p.plan_code,p.name AS plan_name,p.max_routers,p.daily_card_limit,p.warning_threshold_percent,
                    (SELECT COUNT(*) FROM nas r WHERE r.network_id=n.id AND COALESCE(r.api_enabled,1)=1) AS active_routers,
                    (SELECT MAX(ra.acctupdatetime) FROM radacct ra WHERE ra.network_id=n.id) AS last_radius_activity,
                    (SELECT COUNT(DISTINCT admin_id) FROM um_admin_network_access WHERE network_id = n.id AND is_active = 1) AS delegated_admins_count
             FROM um_networks n
             LEFT JOIN um_network_subscriptions s ON s.network_id=n.id
             LEFT JOIN um_network_plans p ON p.id=s.plan_id
             LEFT JOIN um_admin_network_access nx ON nx.network_id=n.id AND nx.access_level='owner' AND nx.is_active=1
             LEFT JOIN um_admins a ON a.id=nx.admin_id
             GROUP BY n.id, s.id, p.id
             ORDER BY n.id"
        )->fetchAll(PDO::FETCH_ASSOC);
        $totals=['networks'=>count($networks),'active'=>0,'trial'=>0,'grace'=>0,'suspended'=>0,'expired'=>0,'cancelled'=>0,'routers'=>0,'cards_today'=>0,'near_expiry'=>0];
        foreach($networks as &$row){
            if (empty($row['subscription_id'])) {
                $this->ensureSubscription((int)$row['network_id'], (int)($_SESSION['admin_id']??1));
                $row=$this->centerNetworkRow((int)$row['network_id']);
            }
            $effective=$this->effectiveStatus($row);
            $row['effective_status']=$effective;
            $usage=$this->getDailyUsage((int)$row['network_id'],$row);
            $row['cards_today']=$usage['cards_total'];
            $row['router_usage']=$this->usageMeter((int)$row['active_routers'],(int)($row['max_routers']??0),(int)($row['warning_threshold_percent']??80));
            $row['card_usage']=$this->usageMeter((int)$usage['cards_total'],(int)($row['daily_card_limit']??0),(int)($row['warning_threshold_percent']??80));
            $totals['routers']+=(int)$row['active_routers'];
            $totals['cards_today']+=(int)$usage['cards_total'];
            if(isset($totals[$effective]))$totals[$effective]++;
            if(!empty($row['expires_at']) && strtotime((string)$row['expires_at'])<=strtotime('+7 days'))$totals['near_expiry']++;
        }
        unset($row);
        $events=$this->db->query('SELECT e.*,n.name AS network_name,a.fullname AS actor_name FROM um_network_subscription_events e LEFT JOIN um_networks n ON n.id=e.network_id LEFT JOIN um_admins a ON a.id=e.actor_admin_id ORDER BY e.id DESC LIMIT 30')->fetchAll(PDO::FETCH_ASSOC);
        return ['success'=>true,'totals'=>$totals,'plans'=>$plans,'networks'=>$networks,'events'=>$events];
    }

    private function centerNetworkRow(int $networkId): array
    {
        $q=$this->db->prepare("SELECT n.id AS network_id,n.code,n.name,n.status AS network_status,NULL AS owner_name,s.id AS subscription_id,s.plan_id,s.status,s.is_enabled,s.starts_at,s.expires_at,s.trial_ends_at,s.grace_ends_at,s.billing_cycle,s.price_snapshot,s.currency_code,s.timezone,s.business_day_start,p.plan_code,p.name AS plan_name,p.max_routers,p.daily_card_limit,p.warning_threshold_percent,(SELECT COUNT(*) FROM nas r WHERE r.network_id=n.id AND COALESCE(r.api_enabled,1)=1) AS active_routers,NULL AS last_radius_activity FROM um_networks n LEFT JOIN um_network_subscriptions s ON s.network_id=n.id LEFT JOIN um_network_plans p ON p.id=s.plan_id WHERE n.id=?");
        $q->execute([$networkId]);
        return $q->fetch(PDO::FETCH_ASSOC) ?: [];
    }

    public function getNetworkDetail(int $networkId): array
    {
        $this->assertNetworkExists($networkId);
        $sub=$this->getEffectiveSubscription($networkId);
        $usage=$this->getDailyUsage($networkId,$sub);
        $eventsQ=$this->db->prepare('SELECT e.*,a.fullname AS actor_name FROM um_network_subscription_events e LEFT JOIN um_admins a ON a.id=e.actor_admin_id WHERE e.network_id=? ORDER BY e.id DESC LIMIT 100');
        $eventsQ->execute([$networkId]);
        $auditQ=$this->db->prepare('SELECT l.*,a.fullname AS actor_name FROM um_network_audit_logs l LEFT JOIN um_admins a ON a.id=l.actor_admin_id WHERE l.network_id=? ORDER BY l.id DESC LIMIT 100');
        $auditQ->execute([$networkId]);
        $routers=(int)$this->scalar('SELECT COUNT(*) FROM nas WHERE network_id=? AND COALESCE(api_enabled,1)=1',[$networkId]);
        return ['success'=>true,'subscription'=>$sub,'usage'=>$usage,'meters'=>[
            'routers'=>$this->usageMeter($routers,(int)($sub['max_routers']??0),(int)($sub['warning_threshold_percent']??80)),
            'daily_cards'=>$this->usageMeter((int)$usage['cards_total'],(int)($sub['daily_card_limit']??0),(int)($sub['warning_threshold_percent']??80)),
        ],'events'=>$eventsQ->fetchAll(PDO::FETCH_ASSOC),'audit'=>$auditQ->fetchAll(PDO::FETCH_ASSOC)];
    }

    public function getEffectiveSubscription(int $networkId, bool $lock=false): array
    {
        $this->ensureSubscription($networkId,(int)($_SESSION['admin_id']??1));
        $sql='SELECT s.*,p.plan_code,p.name AS plan_name,p.description AS plan_description,p.max_routers,p.max_admins,p.max_distributors,p.max_pos_agents,p.daily_card_limit,p.daily_card_limit_mode,p.max_cards_per_print,p.max_daily_prints_per_profile,p.max_active_users,p.max_debt_limit,p.max_telegram_groups,p.monthly_invoice_limit,p.max_profiles,p.max_storage_bytes,p.max_backup_count,p.backup_retention_days,p.backup_frequency,p.allow_manual_backup,p.allow_restore,p.allow_download,p.allow_whatsapp,p.allow_api,p.allow_advanced_reports,p.warning_threshold_percent FROM um_network_subscriptions s JOIN um_network_plans p ON p.id=s.plan_id WHERE s.network_id=? LIMIT 1'.($lock?' FOR UPDATE':'');
        $q=$this->db->prepare($sql);$q->execute([$networkId]);
        $row=$q->fetch(PDO::FETCH_ASSOC);
        if(!$row)throw new NetworkSubscriptionException('NETWORK_SUBSCRIPTION_MISSING',['network_id'=>$networkId]);
        $overrides=$this->db->prepare('SELECT limit_key,limit_value FROM um_network_limits WHERE network_id=? AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW())');
        $overrides->execute([$networkId]);
        foreach($overrides->fetchAll(PDO::FETCH_ASSOC) as $o){if(in_array($o['limit_key'],self::PLAN_LIMIT_FIELDS,true))$row[$o['limit_key']]=$o['limit_value'];}
        $row['effective_status']=$this->effectiveStatus($row);
        return $row;
    }

    public function lockRouterCapacity(int $networkId, int $actorAdminId=0): array
    {
        if(!$this->db->inTransaction())throw new LogicException('ROUTER_LIMIT_REQUIRES_TRANSACTION');
        $sub=$this->getEffectiveSubscription($networkId,true);
        $this->assertWritable($sub,'add_router');
        $current=(int)$this->scalar('SELECT COUNT(*) FROM nas WHERE network_id=? AND COALESCE(api_enabled,1)=1',[$networkId]);
        $limit=(int)($sub['max_routers']??0);
        if($limit>0 && $current>=$limit){
            throw new NetworkSubscriptionException('NETWORK_ROUTER_LIMIT_REACHED',['error'=>'تم بلوغ الحد الأقصى للراوترات في الباقة','network_id'=>$networkId,'limit'=>$limit,'current'=>$current]);
        }
        return $this->usageMeter($current,$limit,(int)($sub['warning_threshold_percent']??80));
    }

    public function consumeDailyCards(int $networkId, int $generated, int $imported, int $actorAdminId=0): array
    {
        if(!$this->db->inTransaction())throw new LogicException('CARD_LIMIT_REQUIRES_TRANSACTION');
        $generated=max(0,$generated);$imported=max(0,$imported);$amount=$generated+$imported;
        $sub=$this->getEffectiveSubscription($networkId,true);
        $this->assertWritable($sub,$imported>0?'import_vouchers':'generate_batch');
        $date=$this->businessDate((string)($sub['timezone']??'Asia/Aden'),(string)($sub['business_day_start']??'00:00:00'));
        $meterExists=(bool)$this->scalar('SELECT id FROM um_network_usage_daily WHERE network_id=? AND usage_date=? LIMIT 1',[$networkId,$date]);
        $actual=$meterExists?0:(int)$this->scalar('SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id=? AND created_at >= ? AND created_at <= ?',[$networkId,"$date 00:00:00","$date 23:59:59"]);
        $ins=$this->db->prepare('INSERT IGNORE INTO um_network_usage_daily(network_id,usage_date,generated_cards,active_routers,active_admins) VALUES(?,?,?,?,?)');
        $routers=(int)$this->scalar('SELECT COUNT(*) FROM nas WHERE network_id=? AND COALESCE(api_enabled,1)=1',[$networkId]);
        $admins=(int)$this->scalar('SELECT COUNT(*) FROM um_admin_network_access WHERE network_id=? AND is_active=1',[$networkId]);
        $ins->execute([$networkId,$date,$actual,$routers,$admins]);
        $q=$this->db->prepare('SELECT * FROM um_network_usage_daily WHERE network_id=? AND usage_date=? FOR UPDATE');$q->execute([$networkId,$date]);
        $usage=$q->fetch(PDO::FETCH_ASSOC);
        $current=(int)$usage['generated_cards']+(int)$usage['imported_cards'];
        $limit=(int)($sub['daily_card_limit']??0);
        $beforeMeter=$this->usageMeter($current,$limit,(int)($sub['warning_threshold_percent']??80));
        if($limit>0 && ($current+$amount)>$limit){
            throw new NetworkSubscriptionException('NETWORK_DAILY_CARD_LIMIT_REACHED',['error'=>'تجاوز الطلب الحد اليومي للكروت في الباقة','network_id'=>$networkId,'business_date'=>$date,'limit'=>$limit,'current'=>$current,'requested'=>$amount]);
        }
        $u=$this->db->prepare('UPDATE um_network_usage_daily SET generated_cards=generated_cards+?,imported_cards=imported_cards+?,active_routers=?,active_admins=? WHERE id=?');
        $u->execute([$generated,$imported,$routers,$admins,(int)$usage['id']]);
        $meter=$this->usageMeter($current+$amount,$limit,(int)($sub['warning_threshold_percent']??80));
        $meter['business_date']=$date;$meter['generated_added']=$generated;$meter['imported_added']=$imported;
        $crossedWarning=$meter['level']==='warning' && $beforeMeter['level']==='ok';
        $reachedLimit=$meter['level']==='limit' && $beforeMeter['level']!=='limit';
        if($crossedWarning || $reachedLimit){
            $this->event(
                (int)$sub['id'],$networkId,$reachedLimit?'usage_limit_reached':'usage_warning',
                (string)$sub['status'],(string)$sub['status'],(int)$sub['plan_id'],(int)$sub['plan_id'],
                ['resource'=>'daily_cards','meter'=>$meter],$actorAdminId
            );
        }
        return $meter;
    }

    public function assertNetworkWriteAllowed(int $networkId, string $operation): array
    {
        $sub=$this->getEffectiveSubscription($networkId);
        $this->assertWritable($sub,$operation);
        return $sub;
    }

    private function assertWritable(array $sub,string $operation): void
    {
        $status=(string)($sub['effective_status']??$this->effectiveStatus($sub));
        if(empty($sub['is_enabled'])||!in_array($status,self::WRITABLE_STATUSES,true)){
            throw new NetworkSubscriptionException('NETWORK_SUBSCRIPTION_WRITE_BLOCKED',['error'=>'الاشتراك الحالي يسمح بالقراءة والتقارير فقط ولا يسمح بعمليات جديدة','network_id'=>(int)$sub['network_id'],'subscription_status'=>$status,'operation'=>$operation],403);
        }
    }

    private function effectiveStatus(array $row): string
    {
        if(empty($row['is_enabled']))return 'suspended';
        $status=(string)($row['status']??'expired');$now=time();
        if($status==='trial'&&!empty($row['trial_ends_at'])&&strtotime((string)$row['trial_ends_at'])<$now)return 'expired';
        if(in_array($status,['active','grace'],true)&&!empty($row['expires_at'])&&strtotime((string)$row['expires_at'])<$now){
            if(!empty($row['grace_ends_at'])&&strtotime((string)$row['grace_ends_at'])>=$now)return 'grace';
            return 'expired';
        }
        return $status;
    }

    private function ensureSubscription(int $networkId,int $actorAdminId): void
    {
        $q=$this->db->prepare('SELECT id FROM um_network_subscriptions WHERE network_id=?');$q->execute([$networkId]);
        if($q->fetchColumn())return;
        $this->assertNetworkExists($networkId);
        $plan=$this->db->query("SELECT * FROM um_network_plans WHERE (plan_code='enterprise' OR plan_code='business' OR plan_code='starter') AND is_active=1 ORDER BY (plan_code='enterprise') DESC, id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if(!$plan) $plan=$this->db->query("SELECT * FROM um_network_plans WHERE is_active=1 ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if(!$plan)throw new NetworkSubscriptionException('DEFAULT_NETWORK_PLAN_MISSING');
        try{
            $i=$this->db->prepare("INSERT INTO um_network_subscriptions(network_id,plan_id,status,is_enabled,starts_at,billing_cycle,price_snapshot,currency_code,timezone,business_day_start,created_by,updated_by) VALUES(?,?,'active',1,NOW(),'monthly',?,?,'Asia/Aden','00:00:00',?,?)");
            $i->execute([$networkId,(int)$plan['id'],(float)$plan['monthly_price'],(string)$plan['currency_code'],$actorAdminId,$actorAdminId]);
            $id=(int)$this->db->lastInsertId();
            $this->event($id,$networkId,'subscription_auto_created',null,'active',null,(int)$plan['id'],['source'=>'default_active'],$actorAdminId);
        }catch(PDOException $e){if((string)$e->getCode()!=='23000')throw $e;}
    }

    private function getSubscriptionRow(int $networkId,bool $forUpdate=false): ?array
    {
        $q=$this->db->prepare('SELECT * FROM um_network_subscriptions WHERE network_id=?'.($forUpdate?' FOR UPDATE':''));$q->execute([$networkId]);
        return $q->fetch(PDO::FETCH_ASSOC)?:null;
    }

    private function getDailyUsage(int $networkId,array $sub): array
    {
        $date=$this->businessDate((string)($sub['timezone']??'Asia/Aden'),(string)($sub['business_day_start']??'00:00:00'));
        $q=$this->db->prepare('SELECT * FROM um_network_usage_daily WHERE network_id=? AND usage_date=?');$q->execute([$networkId,$date]);
        $row=$q->fetch(PDO::FETCH_ASSOC)?:['network_id'=>$networkId,'usage_date'=>$date,'generated_cards'=>0,'imported_cards'=>0,'printed_cards'=>0,'sold_cards'=>0];
        $actual=(int)$this->scalar('SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id=? AND DATE(created_at)=?',[$networkId,$date]);
        $reserved=(int)($row['generated_cards']??0)+(int)($row['imported_cards']??0);
        $row['cards_total']=max($actual,$reserved);
        return $row;
    }

    private function usageMeter(int $current,int $limit,int $threshold): array
    {
        $percent=$limit>0?round(($current/$limit)*100,1):0;
        $level=$limit>0&&$current>=$limit?'limit':($limit>0&&$percent>=$threshold?'warning':'ok');
        return ['current'=>$current,'limit'=>$limit,'unlimited'=>$limit<=0,'percent'=>$percent,'level'=>$level,'warning_threshold'=>$threshold,'remaining'=>$limit>0?max(0,$limit-$current):null];
    }

    private function businessDate(string $timezone,string $start): string
    {
        $tz=new DateTimeZone($this->validTimezone($timezone));$now=new DateTimeImmutable('now',$tz);
        [$h,$m,$s]=array_map('intval',array_pad(explode(':',$start),3,0));$boundary=$now->setTime($h,$m,$s);
        if($now<$boundary)$now=$now->modify('-1 day');
        return $now->format('Y-m-d');
    }

    private function validTimezone(string $timezone): string
    {
        try{new DateTimeZone($timezone);return $timezone;}catch(Throwable $e){return 'Asia/Aden';}
    }

    private function assertStatus(string $status): void
    {
        if(!in_array($status,['trial','active','grace','suspended','expired','cancelled'],true))throw new InvalidArgumentException('INVALID_SUBSCRIPTION_STATUS');
    }

    private function assertNetworkExists(int $networkId): void
    {
        if($networkId<=0||(int)$this->scalar('SELECT COUNT(*) FROM um_networks WHERE id=?',[$networkId])!==1)throw new InvalidArgumentException('NETWORK_NOT_FOUND');
    }

    private function scalar(string $sql,array $params=[]): mixed
    {
        $q=$this->db->prepare($sql);$q->execute($params);return $q->fetchColumn();
    }

    private function event(int $subscriptionId,int $networkId,string $type,?string $oldStatus,?string $newStatus,?int $oldPlan,?int $newPlan,array $details,int $actor): void
    {
        $q=$this->db->prepare('INSERT INTO um_network_subscription_events(subscription_id,network_id,event_type,old_status,new_status,old_plan_id,new_plan_id,details,actor_admin_id) VALUES(?,?,?,?,?,?,?,?,?)');
        $q->execute([$subscriptionId,$networkId,$type,$oldStatus,$newStatus,$oldPlan,$newPlan,json_encode($details,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$actor?:null]);
    }

    private function audit(?int $networkId,int $actor,string $action,string $entity,string $entityId,?array $old,?array $new): void
    {
        $q=$this->db->prepare('INSERT INTO um_network_audit_logs(network_id,actor_admin_id,action_key,entity_type,entity_id,old_values,new_values,request_ip,user_agent) VALUES(?,?,?,?,?,?,?,?,?)');
        $q->execute([$networkId,$actor?:null,$action,$entity,$entityId,$old?json_encode($old,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES):null,$new?json_encode($new,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES):null,$_SERVER['REMOTE_ADDR']??null,substr((string)($_SERVER['HTTP_USER_AGENT']??''),0,255)?:null]);
    }

    private function dateOrNow(mixed $value): string{return $this->dateOrNull($value)?:date('Y-m-d H:i:s');}
    private function dateOrNull(mixed $value): ?string
    {
        $v=trim((string)$value);if($v==='')return null;$t=strtotime($v);return $t?date('Y-m-d H:i:s',$t):null;
    }
    private function timeOrMidnight(mixed $value): string
    {
        $v=trim((string)$value);return preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/',$v)?(strlen($v)===5?$v.':00':$v):'00:00:00';
    }
}


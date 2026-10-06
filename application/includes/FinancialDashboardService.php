<?php
declare(strict_types=1);
require_once __DIR__ . '/BaseService.php';

final class FinancialDashboardService extends BaseService
{
    private const KPI_PERMISSIONS = [
        'cash_balance'=>'finance_kpi_cash_balance','receipts'=>'finance_kpi_receipts','expenses'=>'finance_kpi_expenses',
        'net_cashflow'=>'finance_kpi_net_cashflow','receivables'=>'finance_kpi_receivables','open_periods'=>'finance_kpi_open_periods',
        'pending_journals'=>'finance_kpi_pending_journals','reconciliation_differences'=>'finance_kpi_reconciliation_differences',
        'exchange_rate'=>'finance_kpi_exchange_rate'
    ];

    public function getDashboard(array $input, int $adminId): array
    {
        if ($adminId <= 0) throw new RuntimeException('AUTH_REQUIRED');
        $this->enforceDashboardAccess($adminId);
        $networkId = $this->resolveNetwork((int)($input['network_id'] ?? 0), $adminId);
        $start = $this->validDate((string)($input['start_date'] ?? date('Y-m-01')));
        $end = $this->validDate((string)($input['end_date'] ?? date('Y-m-d')));
        if ($start > $end) throw new InvalidArgumentException('تاريخ البداية يجب أن يسبق تاريخ النهاية');

        $k=[]; $currency=$this->baseCurrency($networkId);
        if ($this->canKpi('cash_balance',$adminId)) $k['cash_balance']=$this->cashBalance($networkId);
        if ($this->canKpi('receipts',$adminId)) $k['receipts']=$this->voucherTotal($networkId,'receipt',$start,$end);
        if ($this->canKpi('expenses',$adminId)) $k['expenses']=$this->voucherTotal($networkId,'payment',$start,$end);
        if ($this->canKpi('net_cashflow',$adminId)) {
            $receipts = $k['receipts'] ?? $this->voucherTotal($networkId,'receipt',$start,$end);
            $expenses = $k['expenses'] ?? $this->voucherTotal($networkId,'payment',$start,$end);
            $r=(float)$receipts['amount']; $e=(float)$expenses['amount'];
            $k['net_cashflow']=['amount'=>round($r-$e,2),'receipts'=>$r,'expenses'=>$e];
        }
        if ($this->canKpi('receivables',$adminId)) $k['receivables']=$this->receivables($networkId);
        if ($this->canKpi('open_periods',$adminId)) $k['open_periods']=$this->openPeriods($networkId);
        if ($this->canKpi('pending_journals',$adminId)) $k['pending_journals']=$this->pendingJournals($networkId);
        if ($this->canKpi('reconciliation_differences',$adminId)) $k['reconciliation_differences']=$this->reconciliationDifferences($networkId);
        if ($this->canKpi('exchange_rate',$adminId)) $k['exchange_rate']=$this->latestRates($networkId);
        return ['success'=>true,'network_id'=>$networkId,'base_currency'=>$currency,'period'=>['start_date'=>$start,'end_date'=>$end],'kpis'=>$k,'alerts'=>$this->alerts($k),'updated_at'=>date('c')];
    }

    private function enforceDashboardAccess(int $adminId): void
    {
        $ctx=$this->getActiveAdminContext($adminId); $role=strtolower((string)($ctx['role']??''));
        $global=['system_owner','superadmin','system_admin','finance_manager','chief_accountant','finance','accountant','network_owner'];
        if (in_array($role,$global,true) || $this->checkPermission('finance_dashboard_view',$adminId)) return;
        throw new RuntimeException('لا تملك صلاحية عرض لوحة المؤشرات المالية');
    }
    private function canKpi(string $kpi,int $adminId): bool
    {
        $ctx=$this->getActiveAdminContext($adminId); $role=strtolower((string)($ctx['role']??''));
        if (in_array($role,['system_owner','superadmin','system_admin','finance_manager','chief_accountant','finance','accountant','network_owner'],true)) return true;
        return $this->checkPermission(self::KPI_PERMISSIONS[$kpi]??'', $adminId);
    }
    private function resolveNetwork(int $requested,int $adminId): int
    {
        $ctx=$this->getActiveAdminContext($adminId); if (!$ctx) throw new RuntimeException('AUTH_REQUIRED');
        $active=(int)($ctx['active_network_id']??$this->getActiveNetworkId()); $role=strtolower((string)($ctx['role']??''));
        $global=['system_owner','superadmin','system_admin'];
        if ($requested<=0) $requested=$active;
        if ($requested<=0) throw new RuntimeException('لا توجد شبكة نشطة');
        if (in_array($role,$global,true)) {
            $q=$this->db->prepare("SELECT id FROM um_networks WHERE id=? AND status='active' LIMIT 1"); $q->execute([$requested]);
            if (!$q->fetchColumn()) throw new RuntimeException('الشبكة غير موجودة أو غير نشطة'); return $requested;
        }
        $q=$this->db->prepare("SELECT 1 FROM um_admin_network_access WHERE admin_id=? AND network_id=? AND is_active=1 AND access_level IN ('owner','manager','accountant','member') LIMIT 1");
        $q->execute([$adminId,$requested]); if (!$q->fetchColumn()) throw new RuntimeException('لا تملك صلاحية عرض مؤشرات هذه الشبكة');
        if ($active>0 && $requested!==$active && !$this->checkPermission('finance_dashboard_all_networks',$adminId)) throw new RuntimeException('لا تملك صلاحية تغيير نطاق الشبكة');
        return $requested;
    }
    private function cashBalance(int $n): array { $q=$this->db->prepare('SELECT COALESCE(SUM(balance),0) FROM um_chart_of_accounts WHERE network_id=? AND is_active=1 AND account_type="asset" AND (account_code LIKE "1101%" OR account_code LIKE "1102%")');$q->execute([$n]);return ['amount'=>round((float)$q->fetchColumn(),2)]; }
    private function voucherTotal(int $n,string $type,string $s,string $e): array {
        $sign=$type==='receipt'?'>0':'<0';
        $q=$this->db->prepare("SELECT COALESCE(SUM(ABS(cashbox_impact)),0) amount,COUNT(*) count FROM um_financial_transactions WHERE network_id=? AND cashbox_impact $sign AND created_at>=? AND created_at<?");
        $q->execute([$n,$s.' 00:00:00',date('Y-m-d',strtotime($e.' +1 day')).' 00:00:00']);$r=$q->fetch(PDO::FETCH_ASSOC)?:[];
        return ['amount'=>round((float)($r['amount']??0),2),'count'=>(int)($r['count']??0),'basis'=>'actual_cash_movements'];
    }
    private function receivables(int $n): array { if(!$this->tableExists('um_admin_network_balances'))return ['amount'=>0];$q=$this->db->prepare('SELECT COALESCE(SUM(CASE WHEN balance>0 THEN balance ELSE 0 END),0) FROM um_admin_network_balances WHERE network_id=?');$q->execute([$n]);return ['amount'=>round((float)$q->fetchColumn(),2)]; }
    private function openPeriods(int $n): array { if(!$this->tableExists('um_accounting_periods'))return ['count'=>0];$q=$this->db->prepare("SELECT COUNT(*) FROM um_accounting_periods WHERE network_id=? AND status IN ('open','reopened')");$q->execute([$n]);return ['count'=>(int)$q->fetchColumn()]; }
    private function pendingJournals(int $n): array { $q=$this->db->prepare('SELECT COUNT(*) count,COALESCE(SUM(total_debit),0) amount FROM um_journal_entries WHERE network_id=? AND is_posted=0');$q->execute([$n]);$r=$q->fetch(PDO::FETCH_ASSOC)?:[];return ['count'=>(int)($r['count']??0),'amount'=>round((float)($r['amount']??0),2)]; }
    private function reconciliationDifferences(int $n): array { $a=$this->tableExists('um_cashbox_reconciliations')?"SELECT difference_amount FROM um_cashbox_reconciliations WHERE network_id=? AND status<>'posted'":'SELECT 0 difference_amount WHERE 1=0';$b=$this->tableExists('um_bank_reconciliations')?"SELECT difference_amount FROM um_bank_reconciliations WHERE network_id=? AND status<>'posted'":'SELECT 0 difference_amount WHERE 1=0';$q=$this->db->prepare("SELECT COALESCE(SUM(ABS(difference_amount)),0) amount,COUNT(*) count FROM (($a) UNION ALL ($b)) x");$args=[];if(str_contains($a,'?'))$args[]=$n;if(str_contains($b,'?'))$args[]=$n;$q->execute($args);$r=$q->fetch(PDO::FETCH_ASSOC)?:[];return ['amount'=>round((float)($r['amount']??0),2),'count'=>(int)($r['count']??0)]; }
    private function latestRates(int $n): array { if(!$this->tableExists('um_network_exchange_rates'))return ['rates'=>[]];$q=$this->db->prepare('SELECT currency_code,exchange_rate,buy_rate,sell_rate,last_updated_at FROM um_network_exchange_rates WHERE network_id=? AND is_active=1 ORDER BY last_updated_at DESC,id');$q->execute([$n]);return ['rates'=>$q->fetchAll(PDO::FETCH_ASSOC)]; }
    private function baseCurrency(int $n): string { if(!$this->tableExists('um_network_exchange_rates'))return 'YER_SANAA';$q=$this->db->prepare('SELECT currency_code FROM um_network_exchange_rates WHERE network_id=? AND is_base_currency=1 AND is_active=1 LIMIT 1');$q->execute([$n]);return (string)($q->fetchColumn()?:'YER_SANAA'); }
    private function validDate(string $d): string { $x=DateTimeImmutable::createFromFormat('!Y-m-d',$d);if(!$x||$x->format('Y-m-d')!==$d)throw new InvalidArgumentException('صيغة التاريخ غير صحيحة');return $d; }
    private function alerts(array $k): array { $a=[];if(($k['pending_journals']['count']??0)>0)$a[]=['type'=>'warning','code'=>'PENDING_JOURNALS','message'=>'توجد قيود بانتظار الاعتماد'];if(($k['reconciliation_differences']['amount']??0)>0)$a[]=['type'=>'danger','code'=>'RECONCILIATION_DIFFERENCE','message'=>'توجد فروقات تسويات تحتاج إلى معالجة'];return $a; }
}

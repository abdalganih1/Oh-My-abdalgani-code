// السجل — the student's recent requests (last 200).
import { List, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, DataTable } from '../../ui/index.js';
import { useAsync } from '../../lib/hooks.js';
import { date, ms, tokens, usdPrecise } from '../../lib/format.js';
import { api, useStudent } from '../ctx.js';

export default function Usage() {
  const { me, fmtAmount } = useStudent();
  const q = useAsync(() => api.get('/api/me/usage?limit=200'), []);
  const rows = q.data || [];
  const cols = [
    { key: 'time', header: 'الوقت', cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-fg-2">{date(r.created_at)}</span> },
    { key: 'model', header: 'النموذج', primary: true, cell: (r) => {
      const alias = r.requested_model && r.requested_model.replace(/^(abdalgani|abd)\//, '') !== r.model_id ? r.requested_model : null;
      return (
        <div className="min-w-0 font-mono text-[12.5px] ltr text-start">
          {alias && <span className="text-muted">{alias} → </span>}<b className="text-fg">{r.model_id}</b>
          {r.upstream_model && r.upstream_model !== r.model_id && <div className="text-[11.5px] text-muted">{r.upstream_model}</div>}
        </div>
      );
    } },
    { key: 'in', header: 'دخل', align: 'end', cell: (r) => tokens(r.prompt_tokens) },
    { key: 'out', header: 'خرج', align: 'end', cell: (r) => tokens(r.completion_tokens) },
    { key: 'cost', header: 'الكلفة', align: 'end', cell: (r) => usdPrecise(r.cost) },
    { key: 'charged', header: 'مُخصوم', align: 'end', cell: (r) => { const sub = me.subscriptions.find((s) => s.id === r.subscription_id); return sub ? fmtAmount(sub.kind, r.charged) : r.charged; } },
    { key: 'lat', header: 'المدة', align: 'end', hideOnMobile: true, cell: (r) => <span className="text-muted">{ms(r.latency_ms)}</span> },
    { key: 'st', header: 'الحالة', cell: (r) => <Badge tone={r.status < 400 ? 'ok' : 'bad'} dot><span className="num">{r.status}</span></Badge> },
  ];
  return (
    <Card title="آخر الطلبات" icon={List} subtitle={q.data ? `${rows.length} طلب` : undefined}
      actions={<Button size="sm" variant="secondary" icon={RefreshCw} loading={q.loading && !!q.data} onClick={q.reload}>تحديث</Button>}>
      {q.error && !q.data ? (
        <div className="rounded-2xl border border-bad/25 bg-bad-soft p-4 text-sm text-bad">{q.error.message} <Button size="xs" variant="ghost" onClick={q.reload}>جرّب مرة تانية</Button></div>
      ) : (
        <DataTable columns={cols} rows={rows} loading={q.loading} maxHeight="70vh"
          empty={{ icon: List, title: 'ما في طلبات بعد', text: 'أول ما تستخدم أداة مربوطة بمفتاحك، كل طلب رح يظهر هون مع كلفته.' }} />
      )}
    </Card>
  );
}

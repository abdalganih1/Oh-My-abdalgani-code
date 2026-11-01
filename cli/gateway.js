// Talks to the abdalgani gateway: validates the key and lists the student's models.
import { API_URL, BASE_URL, ALIASES, tr, log, deviceHeaders } from './core.js';

const FALLBACK = [
  { id: ALIASES.main, name: 'abd-main (default)', context: 200000, output: 32768, reasoning: true, alias: true },
  { id: ALIASES.fast, name: 'abd-fast', context: 200000, output: 32768, reasoning: true, alias: true },
  { id: ALIASES.think, name: 'abd-think', context: 200000, output: 32768, reasoning: true, alias: true },
];

/**
 * @returns {Promise<{ok:boolean, models:Array<{id,name,context,output,reasoning,alias}>, account?:object, reason?:string}>}
 */
export async function fetchCatalog(apiKey) {
  const headers = { authorization: `Bearer ${apiKey}`, ...deviceHeaders() };
  try {
    const [mRes, meRes] = await Promise.all([
      fetch(`${API_URL}/models`, { headers, signal: AbortSignal.timeout(15000) }),
      fetch(`${BASE_URL}/api/me`, { headers, signal: AbortSignal.timeout(15000) }),
    ]);
    if (mRes.status === 401 || mRes.status === 403) {
      const body = await mRes.json().catch(() => ({}));
      return { ok: false, models: FALLBACK, reason: body?.error?.message || `HTTP ${mRes.status}` };
    }
    if (mRes.status === 403) {
      const body = await mRes.json().catch(() => ({}));
      return { ok: false, models: FALLBACK, reason: body?.error?.message || 'HTTP 403' };
    }
    if (!mRes.ok) throw new Error(`HTTP ${mRes.status}`);
    const data = (await mRes.json()).data || [];
    const account = meRes.ok ? await meRes.json() : null;
    const models = data.map((m) => ({
      id: m.id,
 name: m.alias_of ? `${m.id} → ${m.alias_of_name || m.alias_of}` : `${m.name || m.id}${m.status === 'legacy' ? tr(' (قديم)', ' (legacy)') : m.status === 'new' ? tr(' (جديد)', ' (new)') : ''}`,
      context: m.context_length || 128000,
      output: m.max_output_tokens || 16384,
      reasoning: !!m.reasoning,
      vision: !!m.vision,
      alias: !!m.alias_of,
      target: m.alias_of || null,
      targetName: m.alias_of_name || null,
    }));
    // aliases first — they're what the student switches from the dashboard
    models.sort((a, b) => Number(b.alias) - Number(a.alias));
    for (const f of FALLBACK) if (!models.some((m) => m.id === f.id)) models.unshift(f);
    return { ok: true, models, account };
  } catch (e) {
    log.warn(`⚠️ ${tr('تعذّر الاتصال بالبوابة — سأستخدم الأسماء الثابتة فقط', 'Gateway unreachable — using stable aliases only')} (${e.message})`);
    if (isDnsError(e)) log.warn(dnsHint());
    return { ok: true, models: FALLBACK, offline: true };
  }
}

export function describeAccount(account) {
  if (!account) return;
  const active = (account.subscriptions || []).filter((s) => s.active);
  const usd = active.filter((s) => s.kind === 'usd').reduce((a, s) => a + s.remaining, 0) / 1e6;
  const tok = active.filter((s) => s.kind === 'tokens').reduce((a, s) => a + s.remaining, 0);
  log.ok(`👤 ${account.user?.name} — ${tr('رصيد', 'balance')}: $${usd.toFixed(2)} + ${(tok / 1e6).toFixed(2)}M tokens`);
  if (!active.length) {
    log.warn(tr(
      `⚠️ ما عندك اشتراك فعّال. الأدوات رح تنضبط، بس الطلبات رح ترجع 402 لحتى تفعّل كوبون من ${BASE_URL}`,
      `⚠️ No active subscription. Tools will be configured, but requests return 402 until you redeem a coupon at ${BASE_URL}`));
  }
}

/** Print alias → real model table (what the student is really using). */
export async function printStatus(apiKey) {
  const res = await fetch(`${BASE_URL}/api/me`, { headers: { authorization: `Bearer ${apiKey}`, ...deviceHeaders() }, signal: AbortSignal.timeout(15000) });
  const me = await res.json().catch(() => ({}));
  if (!res.ok) { log.err(`❌ ${me?.error?.message || res.status}`); return false; }
  describeAccount(me);
  console.log('');
  log.info(tr('🎯 النماذج الحقيقية ورا أسمائك:', '🎯 Real models behind your aliases:'));
  for (const a of me.aliases || []) {
    console.log(`   ${a.alias.padEnd(12)} → ${a.model_name} (${a.model_id})${a.served_by ? `   · ${a.served_by}` : ''}${a.custom ? tr('   [مخصص]', '   [custom]') : ''}`);
  }
  for (const s of (me.subscriptions || []).filter((x) => x.active)) {
    const left = s.kind === 'usd' ? `$${(s.remaining / 1e6).toFixed(2)}` : `${(s.remaining / 1e6).toFixed(2)}M tok`;
    log.dim(`   ${tr('اشتراك', 'subscription')} #${s.id}: ${left} · ${s.group_id || tr('كل النماذج', 'all models')}${s.expires_at ? ` · ${tr('ينتهي', 'expires')} ${new Date(s.expires_at * 1000).toISOString().slice(0, 10)}` : ''}`);
  }
  const dev = deviceHeaders();
  log.dim(`   ${tr('هذا الجهاز', 'This device')}: ${dev['X-Abd-Device-Name']} · ${dev['X-Abd-Device']}`);
  log.dim(`\n   ${tr('بدّل النماذج من', 'Switch models at')} ${BASE_URL}`);
  return true;
}

/** The machine's DNS can't resolve the gateway (seen on fresh VPSes with a broken resolver). */
export const isDnsError = (e) => ['ENOTFOUND', 'EAI_AGAIN'].includes(e?.cause?.code || e?.code);
export const dnsHint = () => tr(
  `   ${new URL(BASE_URL).host} ما انحلّ على هالجهاز — المشكلة بالـ DNS تبع الجهاز، مش بالبوابة.\n   الحل بالـ README ← "ما بيوصل للدومين": https://github.com/abdalganih1/Oh-My-abdalgani-code#dns`,
  `   ${new URL(BASE_URL).host} does not resolve on this machine — its DNS is broken, not the gateway.\n   Fix: https://github.com/abdalganih1/Oh-My-abdalgani-code#dns`);

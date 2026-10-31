// التثبيت والاستخدام — one-command installer per tool/OS, helper commands, and raw
// OpenAI/Anthropic-compatible snippets (exact same generated text as legacy).
import { AlertTriangle, Apple, KeyRound, Monitor, Plug, Terminal, Wrench } from 'lucide-react';
import { Button, Card, CodeBlock, Field, Reveal, Segmented, Select } from '../../ui/index.js';
import { usePersisted } from '../../lib/hooks.js';
import { focusLater, isSession, useStudent } from '../ctx.js';
import { buildSetup, SETUP_PREF, TOOLS } from '../setup.js';
import { store } from '../../lib/store.js';

const H3 = ({ children }) => <h3 className="mb-2 mt-5 flex items-center gap-2 font-display text-[14px] font-semibold text-fg-2 first:mt-0">{children}</h3>;

export default function Setup() {
  const { me, go } = useStudent();
  const [pref, setPref] = usePersisted(SETUP_PREF, { tool: 'OpenCode', os: 'unix' });
  const tool = TOOLS.includes(pref.tool) ? pref.tool : 'OpenCode', os = pref.os === 'win' ? 'win' : 'unix';
  const s = buildSetup(me.base_url, tool, os);
  const noKey = isSession() && !store.get('abd:lastApiKey');

  return (
    <div className="grid gap-4 sm:gap-5">
      {noKey && (
        <Reveal>
          <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-warn/30 bg-warn-soft p-4 text-[13.5px] text-fg-2">
            <AlertTriangle size={18} className="shrink-0 text-warn" />
            <span className="min-w-0 flex-1">دخلت بالإيميل، فالأوامر تحت بدها مفتاح API. اعمل مفتاح جديد وبيتعبّى هون تلقائياً.</span>
            <Button size="sm" variant="primary" icon={KeyRound} onClick={() => { go('keys'); focusLater('keyName'); }}>اعمل مفتاح</Button>
          </div>
        </Reveal>
      )}
      <Reveal>
        <Card title="تثبيت أدوات البرمجة بأمر واحد" icon={Terminal} subtitle="بيثبّت الأداة إذا مش موجودة، وبيربطها بالبوابة مع مفتاحك، وبيضيف دعم العربي.">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="الأداة" className="min-w-[200px] flex-1 sm:max-w-[280px]">
              <Select value={tool} onChange={(v) => setPref((p) => ({ ...p, tool: v }))} options={TOOLS.map((t) => ({ value: t, label: t, icon: Wrench }))} aria-label="الأداة" mono />
            </Field>
            <Segmented value={os} onChange={(v) => setPref((p) => ({ ...p, os: v }))}
              options={[{ value: 'unix', label: 'macOS / Linux', icon: Apple }, { value: 'win', label: 'Windows', icon: Monitor }]} />
          </div>
          <CodeBlock code={s.install} title={os === 'win' ? 'PowerShell — install' : 'bash — install'} wrap />
          <H3>أوامر مفيدة بعد التثبيت</H3>
          <CodeBlock code={s.helper} title="abdalgani-setup" />
        </Card>
      </Reveal>
      <Reveal delay={0.06}>
        <Card title="استخدام مباشر (أي أداة أو SDK متوافق)" icon={Plug}>
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="min-w-0"><H3>OpenAI-compatible</H3><CodeBlock code={s.openai} title="openai" /></div>
            <div className="min-w-0"><H3>Anthropic-compatible (Claude Code)</H3><CodeBlock code={s.anthropic} title="claude code" /></div>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}

# ⚡ Oh-My-abdalgani-code (v2)

بوابة ذكاء اصطناعي خاصة على **Cloudflare Workers** (بديل LiteLLM) بنظام توجيه مثل OpenRouter، مع لوحة تحكم للطلاب ولوحة مدير، وأداة تثبيت تربط أدوات البرمجة (OpenCode 2، Claude Code، Hermes، Codex…) بالبوابة بأمر واحد.

```
الطالب (OpenCode / Claude Code / Hermes / Codex / SDK)
        │  sk-abd-…
        ▼
api.abdalgani.com  ── Cloudflare Worker + D1
  • /v1/chat/completions  (OpenAI)
  • /v1/messages          (Anthropic — Claude Code)
  • /v1/responses         (OpenAI Responses — Codex)
  • التحقق من الاشتراك ← اختيار المسار ← مفتاح مزوّد (تدوير + احتياط) ← المحاسبة
        │
        ├── Z.AI Coding Plan   (OpenAI + Anthropic endpoints)
        ├── OpenRouter          (OpenAI + Anthropic endpoints، الكلفة الفعلية من usage.cost)
        ├── Anthropic           (Messages native، و OpenAI-compat)
        ├── OpenAI Platform     (Chat Completions؛ /v1/messages يُترجَم تلقائياً)
        ├── NVIDIA NIM          (Chat Completions — عدة مفاتيح مجانية بالتناوب)
        └── OpenCode Zen        (pay-as-you-go، Chat + Anthropic)
```

## 📁 هيكل المستودع

| المسار | المحتوى |
|---|---|
| [`gateway/`](gateway/) | البوابة: Worker + قاعدة D1 + لوحة الطالب (`/`) + لوحة المدير (`/admin.html`) — [دليل النشر](gateway/README.md) |
| [`cli/`](cli/) + `setup.js` | أداة التثبيت والربط للطلاب (تفاعلية أو headless للوكلاء) |
| `test/` و `gateway/test/` | اختبارات (`npm test`) |

## 🎓 قواعد النظام (حسب الطلب)

- **لا تسجيل ذاتي، لا شراء، لا تجربة مجانية.** المدير ينشئ حساب الطالب ويعطيه مفتاح `sk-abd-…`.
- **الرصيد فقط عبر كوبونات** يولّدها المدير: إما **رصيد دولار** (مثلاً 10$) أو **توكنات** (مثلاً 10M)، وممكن تنحصر **بفئة نماذج** (Coding / Premium / Cheap…). بدون اشتراك فعّال يغطي النموذج ← `402`.
- **المحاسبة لكل نموذج** بأحد ثلاثة أوضاع: `request` سعر ثابت لكل طلب (كاش) · `token` جدول أسعارك لكل مليون توكن · `provider` الكلفة الفعلية اللي بيرجعها المزوّد (OpenRouter) — مع نسبة إضافية اختيارية.
- **الطالب يشوف** بلوحته: رصيده واشتراكاته، كل النماذج **الجديدة والقديمة** (المتاحة له والمقفولة)، سجل استهلاكه، ومفاتيحه.
- **تبديل النماذج بدون إعادة تثبيت:** كل الأدوات مضبوطة على أسماء ثابتة `abd-main` / `abd-fast` / `abd-think`، والطالب يغيّر لوين بتشير من لوحته فوراً.
- **الطالب دايماً بيعرف النموذج الحقيقي:** بلوحته (جدول "النماذج الحقيقية اللي عم تستخدمها" مع المزوّد اللي عم يخدم فعلياً)، وبكل رد (حقل `model` = النموذج الحقيقي + الترويسات `x-abdalgani-model` / `x-abdalgani-upstream` / `x-abdalgani-alias`)، وبسجل استهلاكه (`abd-main → glm-5.2`)، وبالطرفية `abdalgani-setup --status`. وأسماء النماذج داخل الأدوات نفسها مكتوب فيها الهدف (`abd-main → GLM-5.2`) وبتتحدث بـ `abdalgani-setup --sync`.
- **المدير** يضيف/يبدّل/يوقف **مفاتيح المزوّدين** من اللوحة (مشفّرة AES-GCM بالقاعدة)، مع عدة مفاتيح لكل مزوّد: توزيع بالأوزان + تبريد تلقائي للمفتاح اللي بيرجع 429/401 + انتقال للمسار الاحتياطي.

## 🧰 للطالب: تثبيت الأدوات بأمر واحد

> الأوامر الجاهزة مع مفتاحك موجودة بلوحتك ← تبويب **التثبيت والاستخدام**.

**macOS / Linux / WSL / Git Bash**
```bash
curl -fsSL https://api.abdalgani.com/install.sh | bash
```

**Windows PowerShell**
```powershell
irm https://api.abdalgani.com/install.ps1 | iex; abdalgani-setup
```

أو يدوياً من المستودع:
```bash
git clone https://github.com/abdalganih1/Oh-My-abdalgani-code.git && cd Oh-My-abdalgani-code && npm install && npm start
```

### الأدوات المدعومة وطريقة تثبيتها (محدّثة أكتوبر 2026)

| الأداة | التثبيت المعتمد | ملف الإعداد اللي بيكتبه الـ setup |
|---|---|---|
| **OpenCode 2** | `curl -fsSL https://opencode.ai/v2/install \| bash` · Windows: `npm i -g @opencode/cli` | `~/.config/opencode/opencode.json` بصيغة **V2** (`providers` + `settings` + `variants`)؛ لو V1 موجود بيعرض الترقية وإلا بيكتب صيغة V1 |
| **Claude Code** | `curl -fsSL https://claude.ai/install.sh \| bash` · Windows: `irm https://claude.ai/install.ps1 \| iex` | `~/.claude/settings.json` (Opus→`abd-think`، Sonnet→`abd-main`، Haiku→`abd-fast`) |
| **Hermes Agent** | `curl -fsSL https://hermes-agent.nousresearch.com/install.sh \| bash` · Windows: `iex (irm https://hermes-agent.nousresearch.com/install.ps1)` | `~/.hermes/config.yaml` بالصيغة الحالية `providers: abdalgani` (`transport: chat_completions` + كل النماذج مع `context_length`/`supports_vision`) + `.env`. التبديل داخل Hermes: `/model custom:abdalgani:<id>` |
| **Pi** | `npm i -g @mariozechner/pi-coding-agent` | `~/.pi/agent/models.json` (`providers.abdalgani`، صور للنماذج اللي بتدعمها) |
| **Codex CLI** | `npm i -g @openai/codex` | `~/.codex/config.toml` (`wire_api = "responses"`) + متغير `ABDALGANI_API_KEY` |
| Kilo CLI · Qwen Code · Goose · Aider · OpenClaw · Kimi · EH Code | المثبّت الرسمي لكل أداة | كلٍّ بملفه — بدون حذف مزوّداتك الأخرى (ونسخة احتياطية `*.abdalgani.bak` أول مرة) |

### 🇸🇦 OpenCode بالعربي (لمن يثبّت عبر أداتنا فقط)

داخل OpenCode (و EH Code) بتنضاف أوامر:

| الأمر | الوظيفة |
|---|---|
| `/ar` | من هلق لآخر الجلسة: الرد بالعربي، والكود والمصطلحات التقنية تبقى إنجليزي. `/ar اشرح هالملف` بتطبّق وبتسأل بنفس الوقت |
| `/en` | رجوع للإنجليزي |

وخيار **"عربي افتراضياً"** (سؤال بالإعداد أو `--arabic`) بيضيف ملف تعليمات دائم `abdalgani-arabic.md` لـ `instructions` — كل جلسة بتبلّش بالعربي.

### 🧭 أوامر الطالب بعد التثبيت

```bash
abdalgani-setup --status    # رصيدك + النموذج الحقيقي ورا كل اسم + المزوّد اللي عم يخدم
abdalgani-setup --sync      # بعد ما تبدّل من اللوحة: يحدّث أسماء النماذج داخل كل أدواتك
abdalgani-setup             # إضافة أداة جديدة
```

### استخدام مباشر (أي SDK)

```text
OpenAI-compatible:     base_url = https://api.abdalgani.com/v1     api_key = sk-abd-…   model = abd-main
Anthropic-compatible:  ANTHROPIC_BASE_URL = https://api.abdalgani.com   ANTHROPIC_AUTH_TOKEN = sk-abd-…
```

## 🤖 الوضع غير التفاعلي (للوكلاء)

```bash
node setup.js --list-tools
node setup.js --list-models --api-key sk-abd-…          # النماذج المسموحة لهذا المفتاح فعلياً
node setup.js --tool OpenCode,ClaudeCode --model abd-main --effort high --api-key sk-abd-…
node setup.js --tool Hermes --no-install                 # إعداد فقط بدون تثبيت
```

رسالة جاهزة لوكيل ذكي:

```text
You are operating the "Oh-My-abdalgani-code" repo. It wires AI coding CLIs to the gateway
https://api.abdalgani.com (OpenAI /v1/chat/completions, Anthropic /v1/messages, Responses /v1/responses).
1. Run `node setup.js --list-tools` and `node setup.js --list-models --api-key <KEY>`. Never guess ids.
2. Configure: node setup.js --tool <Tool[,Tool]> --model abd-main --effort <none|low|medium|high> --api-key <KEY>
3. Prefer the stable aliases abd-main / abd-fast / abd-think — the student re-maps them from the dashboard.
Read ./Agent.md before editing code. Gateway code lives in ./gateway (see gateway/README.md).
My request: <tool + model + effort>
```

## 🧪 التطوير

```bash
npm install && npm --prefix gateway install
npm test                       # اختبارات الـ CLI + البوابة (وحدات + E2E على D1 محلية بـ node:sqlite)
cd gateway && npm run dev      # wrangler dev على http://127.0.0.1:8787
```

## 💡 سؤال: أشترك بـ OpenCode Go (10$) وأشاركه مع الطلاب عبر البوابة؟

**لا أنصح فيها — وهذا الترتيب الأفضل بدلها:**

1. **شروط OpenCode صريحة:** حسب [وثائق Go](https://opencode.ai/docs/go/) خطط Go و Go Plus مخصصة لـ workspace **بعضو واحد**، والفرق عندها خطة **Go Teams** (20$ لكل عضو)، والترافيك مراقب ضد الإساءة. مشاركة اشتراك واحد بين عدة طلاب عبر بوابة = مخالفة وخطر حظر الحساب.
2. **حسابياً ما بتوفّر:** كل نموذج له سقف شهري (مثلاً GLM-5.3 = 15$ بالشهر على Go)، ومنه 20% بس بأي 5 ساعات ≈ **3$ لكل الطلاب سوا** — بيخلص بدقائق مع صف كامل.
3. **البديل المعتمد بالبوابة:** **OpenCode Zen** (دفع حسب الاستخدام، يدعم فرق) مضاف كمزوّد `opencode-zen` — حط مفتاحه من لوحة المدير، اربط النماذج اللي بدك ياها، واختار تسعير `provider`/`token` مع نسبة إضافية. أو استخدم **Go لنفسك أنت** عبر OpenCode مباشرة.
4. للطلاب الأرخص فعلياً: **Z.AI coding plan + OpenRouter + عدة مفاتيح NVIDIA (مجانية بحدود)** مع الاحتياط التلقائي — وكلهم جاهزين بالبوابة. (راجع شروط كل مزوّد بخصوص الاستخدام المشترك.)

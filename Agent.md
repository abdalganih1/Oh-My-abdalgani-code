# 🧠 Agent.md — Oh-My-abdalgani-code (v2)

## 📊 نظرة عامة
- **جزآن:** (1) `gateway/` بوابة AI على Cloudflare Workers + D1 (بديل LiteLLM)، (2) `cli/` + `setup.js` أداة ربط أدوات البرمجة بالبوابة.
- **اللغة:** JavaScript ESM خالص، Node ≥ 20. البوابة بدون أي dependency تشغيل.
- **الدومين:** `https://api.abdalgani.com` (القيمة قابلة للتغيير بـ `ABDALGANI_BASE_URL` في الـ CLI).

## 🌲 المخطط الشجري
```
setup.js                  نقطة الدخول (npm start) → cli/main.js
cli/
  main.js                 الوسائط، القوائم التفاعلية، الوضع headless، --status/--sync
  arabic.js               حزمة العربي (WezTerm + launchers + /ar)
  bidi.js                 ترتيب + وصل الأحرف العربية لسطر خلايا (بدون imports — بينسخ جوا البلغن)
  opencode-arabic-plugin.js  بلغن TUI لـ OpenCode: بيصلّح العربي على الشاشة (postProcess)
  schedule.js             التحديث التلقائي (schtasks / cron / systemd)
  core.js                 ثوابت (BASE_URL, ALIASES)، ملفات، مفتاح محفوظ، persistEnv
  gateway.js              /v1/models + /api/me للتحقق من المفتاح وجلب نماذج الطالب
  install.js              وصفات التثبيت الرسمية لكل أداة + كشف OpenCode V1/V2 + تنزيل EH Code
  tools/*.js              كاتب إعداد لكل أداة (build* دوال نقية مُختبرة + configure* تكتب الملف)
gateway/
  wrangler.toml           D1 + Assets + الدومين
  migrations/             0001 الجداول، 0002 المزوّدون/الفئات/نماذج GLM/الأسماء الثابتة، 0003 compat/vision/NVIDIA/Zen، 0004 دورة الحياة/Nous، 0005 المال، 0006 الأمان، 0007 الحسابات/السقوف/التنبيهات
  src/index.js            الراوتر
  src/proxy.js            /v1/chat/completions، /v1/messages، /v1/responses، /v1/models + البث والمحاسبة
  src/routing.js          حلّ النموذج، المسارات، مفاتيح موزونة + تبريد، الترويسات
  src/billing.js          حساب الكلفة واختيار الاشتراك والتسوية
  src/translate.js        Anthropic ⇄ OpenAI (طلب، رد، بث)
  src/responses.js        Responses ⇄ Chat Completions (لـ Codex)
  src/api/admin.js        API المدير    src/api/user.js  API الطالب
  web/                    الواجهات (React 19 + Vite + Tailwind v4) — بتنبني لـ public/ (مولّد، مش بالـ git)
    src/ui/               مكتبة المكوّنات: core (Button/Card/Badge/…)، overlay (Select بحث/Modal/Confirm/Sheet)، table، shell، charts
    src/lib/              api/format/hooks/store
    src/admin/            لوحة المدير (panels/* lazy)        src/student/  موقع الطالب
    public/               _headers (CSP) + install.sh/ps1 (بتنسخ كما هي)
  test/                   d1-shim (node:sqlite) + units + e2e
test/cli.test.js          اختبارات كتّاب الإعداد
```

## 🛠️ أوامر
| الأمر | الوظيفة |
|---|---|
| `npm test` | كل الاختبارات (CLI + البوابة) |
| `node setup.js --help` | مساعدة الـ CLI |
| `node setup.js --status` / `--sync` | النموذج الحقيقي والرصيد / تحديث كل الأدوات المضبوطة |
| `cd gateway && npm run dev` | يبني الواجهات ويشغّل wrangler محلياً |
| `cd gateway && npm run dev:web` | Vite مع HMR (بيحوّل /api و/v1 لـ wrangler dev على 8799، أو `API=…`) |
| `cd gateway && npm run db:migrate && npm run deploy` | نشر |

## ✅ قواعد يجب احترامها
- **لا مفاتيح بالكود أو بالـ SQL أبداً.** مفاتيح المزوّدين تُدخل من لوحة المدير وتُخزن مشفّرة (`ENCRYPTION_KEY`). أسرار Worker عبر `wrangler secret put`.
- **الطالب لا يملك أي طريق للرصيد إلا الكوبون أو منح المدير.** لا تضف تسجيل ذاتي/تجربة.
- **المال بالـ micro-USD أعداد صحيحة.** لا تخزن floats.
- **لا تخترع أحجام سياق أو أسعار.** استخدم زر "استعراض نماذج المزوّد" (يقرأ `/models` الحقيقي) أو وثائق المزوّد.
- **الأدوات تُضبط على الأسماء الثابتة** `abd-main/abd-fast/abd-think` حتى يبدّل الطالب من اللوحة بدون إعادة إعداد.
- **OpenCode V2** يستخدم `providers` (جمع) + `package` + `settings` + `variants`، و V1/Kilo/EH Code يستخدمون `provider` + `npm` + `options`. `opencodeMajor()` يقرر.
- **Codex** يدعم `wire_api = "responses"` فقط → البوابة تخدم `/v1/responses`.
- **Hermes** بالصيغة الحالية: `providers.abdalgani` (`api`, `key_env`, `transport`, `default_model`, `models`) + `model.provider: custom:abdalgani`؛ مدخل `custom_providers` القديم باسمنا يُحذف.
- **الشفافية:** لا ترجع الاسم المستعار بحقل `model` — دائماً النموذج الحقيقي + ترويسات `x-abdalgani-*`.
- **compat لكل مزوّد** بدل حالات خاصة بالكود: أي مزوّد جديد يرفض بارامتر ← عدّل `providers.compat` (أو أضف مفتاح جديد لـ `applyCompat` مع اختبار).
- **OpenCode بالعربي:** أوامر `/ar` و `/en` (`commands` بـ V2، `command` بـ V1) + ملف `abdalgani-arabic.md` بـ `instructions` عند اختيار "عربي افتراضياً".
- **دورة الحياة** (`gateway/src/lifecycle.js`): Cron كل 30د. لا تؤرشف إلا بفشل متواصل ≥ 6 ساعات بلا نجاح (ليميت 5 ساعات شائع). دوال تقبل `now` للاختبار — اختبر أي تعديل بـ `gateway/test/lifecycle.test.js`.
- **عرض العربي داخل OpenCode** (`cli/opencode-arabic-plugin.js` + `cli/bidi.js`): بلغن TUI بينكتب بـ `~/.config/opencode/abdalgani/` وبيتسجّل بـ `tui.json`. بيشتغل بـ `renderer.addPostProcessFn`: بيقرأ النص الحقيقي (`getRealCharBytes`، لأن OpenTUI بيخزّن العربي كـ grapheme ids) وبيكتب الخلايا المعدّلة بـ `setCell`. الشاشة بس، النص المرسل للنموذج ما بيتغيّر. الفقرات العربية بتنصف لليمين ضمن نفس لون الخلفية، والمؤشر بينقل لمكانه البصري (`setCursorPosition` ملفوف + `getCursorState` لـ V2). `/rtl` للتبديل، و`ABDALGANI_ARABIC_DISPLAY=0` بيوقفه (إعداد WezTerm تبعنا بيحطه لأنه WezTerm بيعمل bidi لحاله).
- **حزمة العربي** (`cli/arabic.js`): العرض عبر WezTerm (bidi + shaping) + أوامر `<tool>-ar`، والردود بـ /ar /en. Claude Code مستثنى. لا تكتب فوق إعداد WezTerm خاص بالمستخدم.
- **التحديث التلقائي عند الطالب** (`cli/schedule.js`): Task Scheduler (ويندوز) / cron أو systemd timer (لينكس/ماك) ← `--sync --quiet` يكتب فقط عند تغيّر الكتالوج.
- **التقارير** (`gateway/src/reports.js` + `web/src/ui/charts.jsx`): SVG بدون مكتبات، حسب قواعد مهارة dataviz (محور واحد، tooltip لكل علامة، جدول مع كل رسم، ألوان مُتحقق منها فاتح/داكن). أي رقم مالي = µ$ صحيح. التواريخ داخل نص عربي تُعزل بـ LRI/PDI.
- **الأمان** (`gateway/src/security.js`): كل طلب ← `preflight` (حظر IP، حجم، RL_IP) ← auth (فشل 401 يعدّ للحظر) ← `afterAuth` (RL_USER، الأجهزة) ← `checkSpendCaps` ← حجز ذرّي من الرصيد. لا تُرجع نص خطأ المزوّد للطالب بدون `scrub`. لا تجمع معرّفات عتادية — معرّف الجهاز عشوائي لكل تثبيت. لا inline scripts (CSP).
- **الحسابات** (`gateway/src/accounts.js`): جلسات `abd_ses_` للوحة فقط (ممنوعة على /v1). **الكشف** (`gateway/src/detect.js`): أي قاعدة جديدة = استعلام مجمّع محدود + `raiseAlert` (مكرر-ممنوع بـ UNIQUE مع '' بدل NULL). أي polling بالواجهة = setTimeout متسلسل + توقف عند الإخفاء/الخمول + backoff.
- **OpenCode Go** لا يُضاف كمزوّد مشترك (شروطه: workspace بعضو واحد). المعتمد: OpenCode Zen.
- كتّاب الإعداد يدمجون ولا يحذفون مزوّدات المستخدم الأخرى، ويأخذون نسخة `*.abdalgani.bak` أول مرة.
- أي تعديل على البوابة: أضف/حدّث اختبار في `gateway/test/` وشغّل `npm test`.

## 🧩 EH Code
- نواة OpenCode (V1) كـ `ehcode.exe` على Cloudflare R2: `EHCODE_DOWNLOAD_URL` في `cli/install.js` (رابط ثابت؛ التحديث = رفع لنفس المفتاح `ehcode/ehcode.exe`).
- سكربت الرفع ومفاتيح R2 خارج المستودع (`cloudflare_worker/.dev.vars`) — لا تنسخها هنا.

## ⚠️ مشاكل معروفة
| المشكلة | الحل |
|---|---|
| workerd محلياً لا يمر عبر بروكسي الشبكة | للاختبار الحقيقي ضد مزوّد من بيئة فيها بروكسي استخدم Node مع `NODE_USE_ENV_PROXY=1` |
| Claude Code لا يعرف نافذة سياق `abd-*` | الـ setup يضبط `CLAUDE_CODE_MAX_CONTEXT_TOKENS` لأصغر نافذة بين الأسماء المستخدمة |
| مخطط opencode.ai/config.json المنشور ما زال V1 | تحذير المحرر من `providers` متوقع؛ OpenCode V2 يقرأه |

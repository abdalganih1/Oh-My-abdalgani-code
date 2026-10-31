# 🧠 Agent.md — Oh-My-abdalgani-code (v2)

## 📊 نظرة عامة
- **جزآن:** (1) `gateway/` بوابة AI على Cloudflare Workers + D1 (بديل LiteLLM)، (2) `cli/` + `setup.js` أداة ربط أدوات البرمجة بالبوابة.
- **اللغة:** JavaScript ESM خالص، Node ≥ 20. البوابة بدون أي dependency تشغيل.
- **الدومين:** `https://api.abdalgani.com` (القيمة قابلة للتغيير بـ `ABDALGANI_BASE_URL` في الـ CLI).

## 🌲 المخطط الشجري
```
setup.js                  نقطة الدخول (npm start) → cli/main.js
cli/
  main.js                 الوسائط، القوائم التفاعلية، الوضع headless
  core.js                 ثوابت (BASE_URL, ALIASES)، ملفات، مفتاح محفوظ، persistEnv
  gateway.js              /v1/models + /api/me للتحقق من المفتاح وجلب نماذج الطالب
  install.js              وصفات التثبيت الرسمية لكل أداة + كشف OpenCode V1/V2 + تنزيل EH Code
  tools/*.js              كاتب إعداد لكل أداة (build* دوال نقية مُختبرة + configure* تكتب الملف)
gateway/
  wrangler.toml           D1 + Assets + الدومين
  migrations/             0001 الجداول، 0002 المزوّدون/الفئات/نماذج GLM/الأسماء الثابتة
  src/index.js            الراوتر
  src/proxy.js            /v1/chat/completions، /v1/messages، /v1/responses، /v1/models + البث والمحاسبة
  src/routing.js          حلّ النموذج، المسارات، مفاتيح موزونة + تبريد، الترويسات
  src/billing.js          حساب الكلفة واختيار الاشتراك والتسوية
  src/translate.js        Anthropic ⇄ OpenAI (طلب، رد، بث)
  src/responses.js        Responses ⇄ Chat Completions (لـ Codex)
  src/api/admin.js        API المدير    src/api/user.js  API الطالب
  public/                 لوحة الطالب index.html/me.js، لوحة المدير admin.html/admin.js، install.sh/ps1
  test/                   d1-shim (node:sqlite) + units + e2e
test/cli.test.js          اختبارات كتّاب الإعداد
```

## 🛠️ أوامر
| الأمر | الوظيفة |
|---|---|
| `npm test` | كل الاختبارات (CLI + البوابة) |
| `node setup.js --help` | مساعدة الـ CLI |
| `cd gateway && npm run dev` | تشغيل محلي (wrangler) |
| `cd gateway && npm run db:migrate && npm run deploy` | نشر |

## ✅ قواعد يجب احترامها
- **لا مفاتيح بالكود أو بالـ SQL أبداً.** مفاتيح المزوّدين تُدخل من لوحة المدير وتُخزن مشفّرة (`ENCRYPTION_KEY`). أسرار Worker عبر `wrangler secret put`.
- **الطالب لا يملك أي طريق للرصيد إلا الكوبون أو منح المدير.** لا تضف تسجيل ذاتي/تجربة.
- **المال بالـ micro-USD أعداد صحيحة.** لا تخزن floats.
- **لا تخترع أحجام سياق أو أسعار.** استخدم زر "استعراض نماذج المزوّد" (يقرأ `/models` الحقيقي) أو وثائق المزوّد.
- **الأدوات تُضبط على الأسماء الثابتة** `abd-main/abd-fast/abd-think` حتى يبدّل الطالب من اللوحة بدون إعادة إعداد.
- **OpenCode V2** يستخدم `providers` (جمع) + `package` + `settings` + `variants`، و V1/Kilo/EH Code يستخدمون `provider` + `npm` + `options`. `opencodeMajor()` يقرر.
- **Codex** يدعم `wire_api = "responses"` فقط → البوابة تخدم `/v1/responses`.
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

# 🛰️ abdalgani gateway — Cloudflare Workers + D1

بوابة متوافقة مع OpenAI و Anthropic و Responses، مع اشتراكات بالكوبونات وتوجيه متعدد المزوّدين. بدون أي مكتبات تشغيل (JS خالص)؛ `wrangler` للنشر فقط.

## 🚀 النشر (مرة واحدة)

```bash
cd gateway
npm install
npx wrangler login
npx wrangler d1 create abdalgani-gateway        # انسخ database_id إلى wrangler.toml
npx wrangler secret put ADMIN_TOKEN             # كلمة سر لوحة المدير (طويلة وعشوائية)
npx wrangler secret put ENCRYPTION_KEY          # مفتاح تشفير مفاتيح المزوّدين — لا تغيّره بعدين
npx wrangler secret put NOTIFY_WEBHOOK          # اختياري: تنبيهات (Discord/Slack webhook، أو Telegram: https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<ID>)
npm run db:migrate                              # الجداول + المزوّدون (zai, openrouter, anthropic, openai, nvidia, opencode-zen) + فئات + نماذج GLM
npm run deploy
```

**الدومين:** `wrangler.toml` فيه `routes = [{ pattern = "api.abdalgani.com", custom_domain = true }]`. لازم دومين `abdalgani.com` يكون على Cloudflare، و**احذف سجل DNS القديم** لـ `api` (اللي كان يشير لسيرفر LiteLLM) قبل النشر. للتجربة أولاً: علّق سطر `routes` وانشر على `*.workers.dev`، جرّب، وبعدين حوّل.

> ⚠️ `ENCRYPTION_KEY` إذا تغيّر، المفاتيح المخزّنة ما عاد تنفك — رح تظهر بلوحة المدير بخطأ "cannot decrypt" وتحتاج تعيد إدخالها.

## 🧭 أول إعداد من لوحة المدير (`https://api.abdalgani.com/admin.html`)

1. **المزوّدون والمفاتيح:** أضف مفتاح Z.AI coding plan، ومفتاح OpenRouter، ومفاتيح NVIDIA (`build.nvidia.com` — كل حساب له حد طلبات، فأكثر من مفتاح = توزيع)، ولاحقاً Anthropic و OpenAI و OpenCode Zen. تقدر تضيف أكثر من مفتاح لنفس المزوّد (أوزان + احتياط). زر **اختبار** يتأكد إن المفتاح شغّال.
2. **النماذج والتوجيه:** سعّر نماذج GLM (الافتراضي `request` بسعر 0 = مجاني — غيّره). زر **📥 استعراض نماذج المزوّد** يجيب كتالوج المزوّد مع الأسعار والسياق، وزر "إضافة" يعبّي النموذج. كل نموذج له مسارات مرتّبة: الأول أساسي والباقي احتياط تلقائي (مثلاً `glm-5.2` ← zai، وإذا فشل ← OpenRouter `z-ai/glm-5.2`).
3. **الطلاب:** أنشئ طالب ← بيطلع مفتاح `sk-abd-…` مرة وحدة، أرسله له.
4. **الكوبونات:** ولّد كوبونات (دولار أو مليون توكن، لكل الفئات أو لفئة محددة، مدة الاشتراك، عدد الاستخدامات). أو امنح اشتراك مباشر من صفحة الطالب.
5. **الأسماء الثابتة:** `abd-main / abd-fast / abd-think` وين بتشير افتراضياً (الطالب يقدر يغيّرها لنفسه).

## 💳 منطق الفوترة

- العملة مخزنة بالـ micro-USD (`1$ = 1,000,000`) كأعداد صحيحة.
- لكل طلب يُختار اشتراك واحد بالترتيب: توكنات مخصصة للفئة ← توكنات عامة ← دولار مخصص ← دولار عام، والأقرب انتهاءً أولاً.
- اشتراك التوكنات ينقص بـ (input + output)، اشتراك الدولار ينقص بالكلفة المحسوبة.
- أوضاع التسعير: `request` (ثابت لكل طلب) · `token` (لكل 1M دخل/خرج/كاش) · `provider` (الكلفة الحقيقية من OpenRouter `usage.cost`، وإلا جدول التوكن) + `markup_pct`.
- الطلبات الفاشلة لا تُحتسب. البث (streaming) يُحاسب بعد انتهاء البث من أرقام `usage` الحقيقية.

## 🔀 التوجيه والاحتياط

- `abdalgani/<id>` و `abd/<id>` مقبولة (البادئة تُشال). الاسم يُحلّ: اسم الطالب المخصص ← الاسم الثابت العام ← معرّف النموذج.
- المفاتيح: ترتيب عشوائي موزون. 429 ← تبريد 60 ث، 401/403/402 ← ساعة، 5xx/شبكة ← 20 ث، ثم المفتاح التالي ثم المسار التالي. أخطاء 400 تُرجع للعميل فوراً بدون استهلاك مفاتيح أخرى.
- الترجمة: Claude Code (`/v1/messages`) على مزوّد بدون Anthropic endpoint (OpenAI) ← ترجمة كاملة مع الأدوات والبث. Codex (`/v1/responses`) ← يُترجم دائماً إلى Chat Completions (بما فيه custom tools مثل `apply_patch`).
- `reasoning_effort` يُحذف تلقائياً للنماذج غير المفعّل لها "يدعم التفكير".
- **توافق لكل مزوّد (`compat` JSON بلوحة المدير):** `max_tokens_field` (يحوّل max_tokens ⇄ max_completion_tokens)، `developer_role: false` (يحوّل رسائل developer إلى system)، `efforts` (المستويات المقبولة؛ الباقي يُقرّب لأقرب مستوى — Hermes يرسل `reasoning_effort` دائماً، و`ultra` ← `max`). مضبوطة مسبقاً لـ Z.AI و NVIDIA و OpenAI و OpenRouter و Anthropic.
- **شفافية النموذج الحقيقي:** كل رد يرجع `model` = المعرّف الحقيقي + ترويسات `x-abdalgani-model` و `x-abdalgani-upstream` (مزوّد/معرّف) و `x-abdalgani-alias`، والسجل يحفظ `requested_model` و `upstream_model`.
- كل الطلبات للمزوّدين تحمل `User-Agent: abdalgani-gateway/2.1` (OpenCode يطلب تعريف العميل).

## ⏱ دورة حياة النماذج (Cron كل 30 دقيقة — `[triggers]` بـ wrangler.toml)

1. **مزامنة الكتالوج:** لكل مزوّد عنده مفتاح: `GET /models` ومقارنة بآخر مرة (`provider_models`). أول مزامنة = خط أساس صامت. الجديد ← حدث + نشر تلقائي حسب `providers.auto`:
   `{"publish":true,"free_only":false,"group":"coding","pricing_mode":"request","price_request":0,"markup_pct":0,"match":"^glm-"}`
2. **الغائب:** نموذج اختفى من قائمة المزوّد ≥ `missing_hours` (6) ← مساره مؤرشف؛ يرجع لو رجع.
3. **الصحة:** كل محاولة تسجّل نجاح/فشل للمزوّد والمسار. فشل متواصل (أول فشل ← آخر فشل) ≥ `archive_after_hours` (6) بدون أي نجاح ← أرشفة المزوّد، أو المسار فقط إذا المزوّد نفسه نجح لنماذج تانية بنفس الفترة. (429 ليميت 5 ساعات ما بيوصل للعتبة.) أخطاء 400 (غلط العميل) ما بتنحسب.
4. **النماذج:** نموذج بلا أي مسار حي ← `archived`؛ يرجع لحاله لما يرجع مسار. شارة `new` تنتهي بعد `new_days` (7). الاسم الثابت اللي هدفه مؤرشف ← يتحول لـ `abd-main`.
5. **التنبيهات:** الأحداث الجديدة ← `NOTIFY_WEBHOOK`. وبلوحة المدير تبويب **التحديثات** (+ "افحص الآن"، نشر/تجاهل المعلّق، إعدادات العتبات).
6. **الاستعادة:** إضافة مفتاح أو نجاح "اختبار" لمزوّد مؤرشف ← يرجع فوراً؛ أو زر ♻️.

## 📚 الـ API

| المسار | المصادقة | الوظيفة |
|---|---|---|
| `POST /v1/chat/completions` | `sk-abd-…` | OpenAI |
| `POST /v1/messages` · `/v1/messages/count_tokens` | `sk-abd-…` (Bearer أو x-api-key) | Anthropic |
| `POST /v1/responses` | `sk-abd-…` | OpenAI Responses (Codex) |
| `GET /v1/models` | `sk-abd-…` | النماذج المتاحة لهذا الطالب + أسماؤه الثابتة |
| `/api/me/*` | `sk-abd-…` | لوحة الطالب: الرصيد، تفعيل كوبون، النماذج، تبديل الأسماء، السجل، المفاتيح |
| `/api/admin/*` | `ADMIN_TOKEN` | المزوّدون، المفاتيح، النماذج، الفئات، الطلاب، الكوبونات، السجل، الإحصائيات، `events`، `catalog`، `maintenance`، `lifecycle` |
| `/install.sh` · `/install.ps1` | — | مثبّت الأدوات بأمر واحد |

## 🧪 الاختبارات

```bash
npm test     # وحدات (الفوترة، الترجمة، التشفير) + E2E كامل على D1 محلية (node:sqlite) مع مزوّدين وهميين
npm run dev  # wrangler dev — يحتاج .dev.vars (انسخ .dev.vars.example) و npm run db:migrate:local
```

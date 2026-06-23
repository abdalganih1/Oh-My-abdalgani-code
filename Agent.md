# 🧠 Agent.md - Oh-My-abdalgani-code

## 📊 نظرة عامة
- **نوع المشروع:** CLI Tool Setup Script
- **اللغة:** JavaScript (Node.js)
- **الإطار:** Inquirer.js
- **الإصدار:** N/A
- **نقطة الدخول:** `setup.js`

## 🌲 المخطط الشجري
Oh-My-abdalgani-code/
├── setup.js               # سكريبت إعداد بيئة أدوات الذكاء الاصطناعي (OpenCode, KiloCLI, ClaudeCode, OpenClaw)
├── package.json           # ملف إدارة التبعيات

## 🛠️ أوامر التشغيل
| الأمر | الوظيفة |
|-------|---------|
| `node setup.js` | تشغيل أداة الإعداد |

## 📦 التبعيات الرئيسية
| المكتبة | الإصدار | الوظيفة |
|---------|---------|---------|
| `@inquirer/prompts` | N/A | واجهة المستخدم التفاعلية |
| `chalk` | N/A | تلوين المخرجات |

## ✅ أفضل الممارسات المكتشفة
- تخصيص إعدادات أدوات الذكاء الاصطناعي بناءً على المزود (api.abdalgani.com).
- استخدام `multi_replace_file_content` لتعديل ملفات JavaScript بطريقة آمنة.

## ⚠️ المشاكل المعروفة والحلول
| المشكلة | السبب | الحل | التاريخ |
|---------|-------|------|---------|
| إضافة OpenClaw | الحاجة لإعداد مزود LiteLLM في OpenClaw | إضافة كود ينشئ ملف `openclaw.json` ويمسح كاش النماذج ويعيد تشغيل Gateway | 2026-03-19 |

## 🚫 أنماط يجب تجنبها
- استخدام أوامر صدفية لكتابة ملفات (مثل `cat`).

## 🔗 ملاحظات البيئة
- الأداة مصممة للعمل على أنظمة متعددة مع تركيز خاص على بيئة Windows التي تدعم Node.js.

## 🧩 توزيع EH Code (ehcode) عبر Cloudflare R2

- EH Code = نواة OpenCode مبنية كـ `ehcode.exe` مستقل (~150MB) — **لا يُرفع داخل الريبو** (كبير جداً).
- `setup.js` ينزّله تلقائياً من Cloudflare R2 عبر الثابت `EHCODE_DOWNLOAD_URL`.
- ترتيب مصادر التنصيب في `installEHCode()`: (1) نسخة محلية `EHCODE_DIST_DIR` → (2) `EHCODE_DOWNLOAD_URL` → (3) `EHCODE_RELEASE_REPO`.
- مفتاح R2 الثابت: `ehcode/ehcode.exe` (bucket عام) — الرابط ثابت لا يتغيّر مع التحديثات.
- سكربت الرفع + المفاتيح في: `C:\Users\Abdalgani\Desktop\Hiba\pr1\cloudflare_worker\`
  (المفاتيح داخل `.dev.vars` — gitignored، **لا تنسخها إلى هنا أو إلى setup.js أبداً**).

### 🔄 عند إعطاء تحديث جديد لـ ehcode (مهم)

ارفع الـ exe الجديد إلى **نفس المفتاح بالضبط** حتى يبقى الرابط ثابتاً (overwrite في المكان):

```bash
cd C:\Users\Abdalgani\Desktop\Hiba\pr1\cloudflare_worker
node upload_to_r2.mjs "<مسار ehcode.exe الجديد>" ehcode/ehcode.exe application/octet-stream
```

- النتيجة: نفس `EHCODE_DOWNLOAD_URL` بدون أي تعديل على `setup.js` — أي مستخدم يختار EH Code يأخذ البناء الجديد تلقائياً.
- السكربت يقرأ مفاتيح R2 من `.dev.vars` وقت التشغيل (لا تضع مفاتيح في الكود).
- الرفع لملف كبير على وصلة بطيئة: مهلات undici معطّلة داخل `upload_to_r2.mjs`، وشغّله بالخلفية.
- تحقّق بعد الرفع: `curl -I <EHCODE_DOWNLOAD_URL>` يجب أن يرجع `200` مع `Content-Length` الجديد.

## 📚 مراجع مفيدة
- [وثائق OpenClaw Gateway]

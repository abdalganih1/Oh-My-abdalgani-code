# 🚀 Oh-My-abdalgani-code

مرحباً بك في المستودع الرسمي لربط وتنصيب أدوات التطوير المعتمدة على الذكاء الاصطناعي (AI CLI)، مثل **OpenCode**، **KiloCLI**، **ClaudeCode** و **OpenClaw**، لتعمل بسلاسة مع البنية التحتية والمزود المخصص `api.abdalgani.com`.

---

## 🛠️ أداة التثبيت التفاعلية (أفضل خيار للمطورين)

من خلال أداة التثبيت المتوفرة في هذا المستودع، لست بحاجة إلى نسخ ولصق الإعدادات يدوياً أو كتابة ملفات التكوين. ستظهر لك **قائمة تفاعلية** تتحكم بها عبر أسهم الكيبورد (أعلى/أسفل)، وتوفر المزايا التالية:

1. التحقق من توافر ووجود (OpenCode, ClaudeCode, KiloCLI, OpenClaw) في جهازك، وتحميلها تلقائياً بضغطة زر إن لم تكن متوفرة.
2. طلب مفتاح الوصول API Key الخاص بك لتأمينه برمجياً.
3. التصفح والاختيار بين النماذج الصحيحة (Models) المحدثة لمزوداتنا:
   - **عائلة NanoGPT** (مثل GLM-5، MiniMax) بخصائص السياق القصوى (Context + Output).
   - **عائلة NVIDIA NIM** (مثل Nemotron، Qwen 3.5، DeepSeek-R1).
   - **عائلة Ollama Cloud**.
4. الحقن والدمج الذكي: يتم استهداف التكوين الأصلي ويُدمج مزود `abdalgani` ليدعم توافقية `@ai-sdk/openai-compatible` جنباً إلى جنب **دون حذف مزوداتك السابقة**.

### 🚀 خطوات التشغيل (أمر سريع لمرة واحدة):
انسخ الأمر المناسب للطرفية (Terminal) التي تستخدمها والصقه بالكامل.
صُممت هذه الأوامر لتثبيت المتطلبات الناقصة (مثل Node.js أو Git) إن لم تكن متوفرة، وجلب التحديثات تلقائياً لمنع أي رسائل خطأ:

**1️⃣ لمستخدمي Windows PowerShell (الخيار الأفضل للويندوز):**

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force; if (!(Get-Command git -ea SilentlyContinue)) { Write-Host "جاري تثبيت Git..."; winget install Git.Git -e --silent; $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User") }; if (!(Get-Command npm -ea SilentlyContinue)) { Write-Host "جاري تثبيت Node.js..."; winget install OpenJS.NodeJS -e --silent; $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User") }; if (Test-Path "Oh-My-abdalgani-code") { cd Oh-My-abdalgani-code; git pull } else { git clone https://github.com/abdalganih1/Oh-My-abdalgani-code.git; cd Oh-My-abdalgani-code }; if (Test-Path "package.json") { npm install; npm start } else { Write-Host "حدث خطأ أثناء تحميل الملفات." }
```

**2️⃣ لمستخدمي موجه الأوامر العادي (Windows CMD):**

```cmd
powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force" && powershell -Command "if (!(Get-Command git -ea SilentlyContinue)) { winget install Git.Git -e --silent; $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }; if (!(Get-Command npm -ea SilentlyContinue)) { winget install OpenJS.NodeJS -e --silent; $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }" && if not exist Oh-My-abdalgani-code (git clone https://github.com/abdalganih1/Oh-My-abdalgani-code.git) else (cd Oh-My-abdalgani-code && git pull && cd ..) && cd Oh-My-abdalgani-code && npm install && npm start
```

**3️⃣ لمستخدمي موجه Git Bash (ويندوز) أو أجهزة (Mac / Linux):**

```bash
if ! command -v git &> /dev/null; then echo "جاري تثبيت Git..."; (command -v winget &> /dev/null && winget install Git.Git -e --silent) || (command -v apt-get &> /dev/null && sudo apt-get update && sudo apt-get install -y git) || (command -v brew &> /dev/null && brew install git); fi; if ! command -v npm &> /dev/null; then echo "جاري تثبيت Node.js..."; (command -v winget &> /dev/null && winget install OpenJS.NodeJS -e --silent) || (command -v apt-get &> /dev/null && sudo apt-get install -y nodejs npm) || (command -v brew &> /dev/null && brew install node) || echo "⚠️ تعذر التثبيت التلقائي."; fi; [ ! -d "Oh-My-abdalgani-code" ] && git clone https://github.com/abdalganih1/Oh-My-abdalgani-code.git; cd Oh-My-abdalgani-code && git pull && npm install && npm start
```

*سيبدأ بعدها العرض التفاعلي السلس لاختيار أدواتك وإتمام الربط كلياً.*

---

## 🤖 قسم وكلاء الذكاء الاصطناعي (AI Agents)

أداة الإعداد تدعم **وضعاً غير تفاعلي (headless)** مصمّماً ليشغّله وكيل ذكي بدون أي تدخل بشري — لا أسئلة، ولا تشغيل واجهة TUI.

### ⚙️ الاستخدام غير التفاعلي

```bash
# اكتشاف (للوكيل: لا تخمّن المعرّفات — اقرأها حيّة)
node setup.js --help
node setup.js --list-tools
node setup.js --list-models

# إعداد أداة بأمر واحد
node setup.js --tool Hermes   --model nvidia/glm-4.7 --effort xhigh --api-key sk-xxx
node setup.js --tool EHCode   --model zai/glm-5.2    --effort xhigh
node setup.js --tool OpenCode --effort high
```

- **المفتاح:** `--api-key`، أو متغيّر البيئة `ABDALGANI_API_KEY`، أو مفتاح محفوظ سابقاً.
- **`--effort`:** `none | high | xhigh` (xhigh = أقصى تفكير، موصى للبرمجة على z.ai).
- **`--tool`** يفعّل الوضع غير التفاعلي تلقائياً. EH Code يُنزَّل تلقائياً من Cloudflare R2 (رابط ثابت).

### 📩 رسالة جاهزة أرسلها لوكيلك الذكي

انسخ الرسالة التالية وأعطها لأي وكيل (Claude Code / OpenCode / Hermes...) ليتولّى كل شيء بنفسه — عدّل السطر الأخير فقط:

```text
You are operating the "Oh-My-abdalgani-code" repo: a setup tool that wires AI coding CLIs
(OpenCode, Hermes, EH Code, Pi Code, KiloCLI, Aider, Goose, Qwen Code, Codex, ...) to the
OpenAI-compatible gateway https://api.abdalgani.com/v1 . Configure things FULLY non-interactively.

Steps:
1. cd into the repo. Run `node setup.js --list-tools` and `node setup.js --list-models`
   to discover the exact tool names and model ids. Do NOT guess ids — read them live.
2. Configure with (this never launches a TUI):
     node setup.js --tool <ToolName> --model <modelId> --effort <none|high|xhigh> --api-key <KEY>
   Use the API key I give you, or the ABDALGANI_API_KEY env var.
3. Confirm success from stdout. If the tool isn't installed the script installs it
   automatically (EH Code auto-downloads from Cloudflare R2).

Rules (read these BEFORE editing any models or the gateway config):
- Repo agent guide:        ./Agent.md
- Gateway model protocol:  ../projects/LiteLLMGateway/Agent.md   (only if present locally)
- NEVER invent a model's context-window / output size — verify from the provider's /models
  endpoint or official docs first.
- When adding models: sweep the provider's FULL /models list, add all relevant ones, and keep
  setup.js `models[]` in sync. Respect reasoning-effort per provider (z.ai = none/high/max).
- Z.ai: use the coding-plan endpoint only; never leave a dead endpoint as a fallback target.

My request: <write here: tool + model + effort, e.g. "set up Hermes with nvidia/glm-4.7 at xhigh effort">
```

نرجو لكم أفضل تجربة برمجية وأداء سلس لعمليات التكويد الشاملة! 🚀

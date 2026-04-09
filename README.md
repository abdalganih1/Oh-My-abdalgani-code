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
if (!(Get-Command git -ea SilentlyContinue)) { Write-Host "جاري تثبيت Git..."; winget install Git.Git -e --silent; $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User") }; if (!(Get-Command npm -ea SilentlyContinue)) { Write-Host "جاري تثبيت Node.js..."; winget install OpenJS.NodeJS -e --silent; $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User") }; if (Test-Path "Oh-My-abdalgani-code") { cd Oh-My-abdalgani-code; git pull } else { git clone https://github.com/abdalganih1/Oh-My-abdalgani-code.git; cd Oh-My-abdalgani-code }; if (Test-Path "package.json") { npm install; npm start } else { Write-Host "حدث خطأ أثناء تحميل الملفات." }
```

**2️⃣ لمستخدمي موجه الأوامر العادي (Windows CMD):**

```cmd
powershell -Command "if (!(Get-Command git -ea SilentlyContinue)) { winget install Git.Git -e --silent; $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }; if (!(Get-Command npm -ea SilentlyContinue)) { winget install OpenJS.NodeJS -e --silent; $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }" && if not exist Oh-My-abdalgani-code (git clone https://github.com/abdalganih1/Oh-My-abdalgani-code.git) else (cd Oh-My-abdalgani-code && git pull && cd ..) && cd Oh-My-abdalgani-code && npm install && npm start
```

**3️⃣ لمستخدمي موجه Git Bash (ويندوز) أو أجهزة (Mac / Linux):**

```bash
if ! command -v git &> /dev/null; then echo "جاري تثبيت Git..."; (command -v winget &> /dev/null && winget install Git.Git -e --silent) || (command -v apt-get &> /dev/null && sudo apt-get update && sudo apt-get install -y git) || (command -v brew &> /dev/null && brew install git); fi; if ! command -v npm &> /dev/null; then echo "جاري تثبيت Node.js..."; (command -v winget &> /dev/null && winget install OpenJS.NodeJS -e --silent) || (command -v apt-get &> /dev/null && sudo apt-get install -y nodejs npm) || (command -v brew &> /dev/null && brew install node) || echo "⚠️ تعذر التثبيت التلقائي."; fi; [ ! -d "Oh-My-abdalgani-code" ] && git clone https://github.com/abdalganih1/Oh-My-abdalgani-code.git; cd Oh-My-abdalgani-code && git pull && npm install && npm start
```

*سيبدأ بعدها العرض التفاعلي السلس لاختيار أدواتك وإتمام الربط كلياً.*

---

## 🤖 قسم وكلاء الذكاء الاصطناعي (AI Agents)

لتنصيب الأداة برمجياً بشكل صامت للوكلاء بالاعتماد على مزود التوافق `@ai-sdk/openai-compatible`:

**1. التنصيب التلقائي عبر One-Liner (OpenCode كمثال):**
يقوم هذا الأمر بتثبيت المحرك وتوليد المكونات المتوافقة للحفاظ على المزودات الأخرى نشطة:
```bash
npm install -g opencode && mkdir -p ~/.opencode && echo '{"custom_providers":[{"name":"abdalgani","url":"https://api.abdalgani.com/v1","apiKey":"YOUR_KEY_HERE","type":"@ai-sdk/openai-compatible","models":["glm-5","glm-5:thinking","kimi-k2.5","nvidia/nemotron-ultra-253b","glm-5:cloud"]}],"default_model":"glm-5"}' > ~/.opencode/config.json
```

نرجو لكم أفضل تجربة برمجية وأداء سلس لعمليات التكويد الشاملة! 🚀

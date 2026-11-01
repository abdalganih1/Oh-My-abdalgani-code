# ⚡ Oh-My-abdalgani-code

اربط أدوات البرمجة بالذكاء الاصطناعي (OpenCode، Claude Code، Hermes، Codex…) بـ **بوابة عبدالغني** بأمر واحد،
واستخدم نماذج قوية (GLM، Claude، DeepSeek…) بمفتاح واحد ورصيد واحد.

> **For AI agents:** skip to [🤖 للوكلاء — For AI agents](#-للوكلاء--for-ai-agents).

---

## 👤 للبشر

### 1) خذ مفتاحك

1. افتح **https://api.abdalgani.com** واعمل حساب جديد أو سجّل دخول (أو خد حساب من المدرّس).
2. فعّل **كود التفعيل** (الرصيد) من تبويب **حسابي**.
3. من تبويب **المفاتيح والأمان** اعمل مفتاح وانسخه، بيبلّش بـ `sk-abd-…`.

> بدون رصيد فعّال، الأدوات بتنضبط عادي بس الطلبات بترجع خطأ `402` لحتى تفعّل كود.

### 2) ثبّت بأمر واحد

**macOS / Linux / WSL / Git Bash**
```bash
curl -fsSL https://api.abdalgani.com/install.sh | bash
```

> إذا طلع `Could not resolve host`، فالـ DNS تبع السيرفر معطّل. هاد الأمر بينزّل المثبّت عن طريق DNS-over-HTTPS، والمثبّت بيصلّح DNS الجهاز لحاله:
> ```bash
> curl -fsSL --doh-url https://1.1.1.1/dns-query https://api.abdalgani.com/install.sh | bash
> ```

**Windows (PowerShell)**
```powershell
irm https://api.abdalgani.com/install.ps1 | iex; abdalgani-setup
```

المثبّت بيسألك عن مفتاحك والأدوات اللي بدك ياها، وبيثبّت الناقص منها (Git وNode.js والأداة نفسها)، وبيضبط كل وحدة على البوابة.
ما بيمسح أي إعداد إلك، وبياخد نسخة احتياطية `*.abdalgani.bak` أول مرة.

> لوحتك ← تبويب **التثبيت والاستخدام** فيها نفس الأوامر جاهزة مع مفتاحك.

### 3) استعمل

افتح أداتك متل العادة (`opencode`، `claude`، `hermes`…) واشتغل. الأدوات مضبوطة على ثلاث أسماء ثابتة:

| الاسم | للشو |
|---|---|
| `abd-main` | النموذج الأساسي لكل يوم |
| `abd-fast` | سريع ورخيص، للمهام البسيطة |
| `abd-think` | الأذكى، للمهام الصعبة |

**بدك تغيّر النموذج اللي ورا الاسم؟** من لوحتك ← **تبديل النماذج**. التغيير بيصير فوراً، بدون ما تعيد التثبيت.
وبتقدر كمان تختار أي نموذج باسمه مباشرة من داخل الأداة.

### الأدوات المدعومة

| الأداة | ملاحظة |
|---|---|
| **OpenCode 2** ⭐ | الأنسب. بيعرض العربي صح بأي طرفية، وفيه `/ar` و `/en` |
| **Claude Code** ⭐ | Opus ← `abd-think` · Sonnet ← `abd-main` · Haiku ← `abd-fast` |
| **Hermes Agent** ⭐ | التبديل داخله: `/model custom:abdalgani:<id>` |
| Codex CLI · Kilo CLI · Pi · Qwen Code · Goose · Aider · OpenClaw · Kimi Code | كلها مدعومة |

### أوامر مفيدة بعد التثبيت

```bash
abdalgani-setup --status    # رصيدك + النموذج الحقيقي ورا كل اسم
abdalgani-setup --sync      # يحدّث قائمة النماذج داخل كل أدواتك
abdalgani-setup             # ضيف أداة جديدة
abdalgani-setup --auto-sync on   # تحديث تلقائي كل 6 ساعات (مفعّل افتراضياً إذا وافقت بالتثبيت)
```

### 🇸🇦 العربي

- **OpenCode بيعرض العربي صح بأي طرفية:** اللي بتكتبه وردود النموذج بيظهروا من اليمين لليسار، مصفوفين لليمين والأحرف موصولة (مش "ابحرم")، والمؤشر بيمشي معك بمكانه الصحيح.
  هالشي بيصير بالشاشة بس، يعني النص اللي بيوصل للنموذج ما بيتغيّر. إذا شاشة طلعت غريبة، اكتب `/rtl` لتوقفه أو ترجّعه.
  إذا كنت مثبّت من قبل، أعد أمر التثبيت (بيحدّث الأداة وبيضيفه).
- **الرد بالعربي:** داخل OpenCode و Pi اكتب `/ar` لترجع الردود بالعربي (والكود يضل إنجليزي). و`/en` بترجّعها إنجليزي.
- **باقي الأدوات (Pi، Hermes…):** `abdalgani-setup --arabic-display` بيثبّت WezTerm مضبوط، وبيعطيك أوامر `pi-ar` و`hermes-ar`.

### استخدام مباشر من الكود (أي SDK)

```text
OpenAI-compatible:     base_url = https://api.abdalgani.com/v1   api_key = sk-abd-…   model = abd-main
Anthropic-compatible:  ANTHROPIC_BASE_URL = https://api.abdalgani.com   ANTHROPIC_AUTH_TOKEN = sk-abd-…
OpenAI Responses:      https://api.abdalgani.com/v1/responses
```

```python
from openai import OpenAI
client = OpenAI(base_url="https://api.abdalgani.com/v1", api_key="sk-abd-...")
print(client.chat.completions.create(model="abd-main", messages=[{"role": "user", "content": "مرحبا"}]).choices[0].message.content)
```

قائمة النماذج المتاحة إلك: `GET https://api.abdalgani.com/v1/models`.
كل رد فيه اسم النموذج الحقيقي اللي جاوب (حقل `model` والترويسة `x-abdalgani-model`).

### مشاكل شائعة

| المشكلة | الحل |
|---|---|
| `401` | المفتاح غلط أو انحذف. اعمل واحد جديد من **المفاتيح والأمان** |
| `402` | ما في رصيد فعّال، أو رصيدك ما بيغطي هالنموذج. فعّل كود من **حسابي** |
| `410` | النموذج انسحب. اختار غيره من **تبديل النماذج**، أو استعمل `abd-main` |
| `429` | طلبات كتير ورا بعض. استنى دقيقة |
| الأداة ما بتشوف النماذج الجديدة | `abdalgani-setup --sync` |
| `abdalgani-setup: command not found` | سكّر الطرفية وافتحها من جديد |
| `Could not resolve host: api.abdalgani.com` | الـ DNS تبع جهازك معطّل. شوف [ما بيوصل للدومين](#dns) |


<a id="dns"></a>
### ما بيوصل للدومين (`Could not resolve host`)

الدومين شغّال، بس جهازك أو السيرفر ما عم يقدر يحوّل الاسم لعنوان. هالشي بيصير كتير على سيرفرات VPS جديدة، أو على شبكة بتحجب الـ DNS. الحل إنك تحط DNS عام (Cloudflare `1.1.1.1` وGoogle `8.8.8.8`) مرة وحدة.

**المثبّت بيصلّحها لحاله:** إذا لقى إنه `github.com` أو `npm` أو البوابة ما انحلّوا، بيحط DNS عام. على Linux هاد بيصير إذا شغّلته كـ root أو عندك sudo، وعلى Windows إذا فتحت PowerShell كمسؤول. الملف القديم بينحفظ باسم `/etc/resolv.conf.abdalgani.bak`. وإذا ما بدك المثبّت يغيّر الـ DNS، شغّله مع `ABDALGANI_NO_DNS_FIX=1`.
إذا السيرفر ما قدر ينزّل المثبّت أصلاً، استعمل أمر `--doh-url` اللي فوق. والخطوات اليدوية تحت بتنفع إذا المثبّت ما قدر يصلّحها:

**1. افحص:**
```bash
getent hosts api.abdalgani.com || getent hosts google.com || echo "الـ DNS معطّل كله"
```

**2. صلّح (Linux، كـ root):**

إذا السيرفر عليه `systemd-resolved` (Ubuntu وDebian الجديد)، بيضل الإعداد بعد إعادة التشغيل:
```bash
mkdir -p /etc/systemd/resolved.conf.d && printf '[Resolve]\nDNS=1.1.1.1 8.8.8.8\nFallbackDNS=1.0.0.1 8.8.4.4\n' > /etc/systemd/resolved.conf.d/abdalgani-dns.conf && systemctl restart systemd-resolved
```

إذا ما عليه `systemd-resolved` (Alpine وDebian القديم والحاويات):
```bash
printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' > /etc/resolv.conf
```

> إذا الملف رجع لحاله بعد إعادة التشغيل، فلوحة مزوّد السيرفر أو `netplan` أو DHCP عم يكتبه من جديد. غيّر الـ DNS من هونيك.

**macOS:**
```bash
sudo networksetup -setdnsservers Wi-Fi 1.1.1.1 8.8.8.8 && sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
```

**Windows (PowerShell كمسؤول):**
```powershell
Get-NetAdapter | Where-Object Status -eq Up | Set-DnsClientServerAddress -ServerAddresses 1.1.1.1,8.8.8.8; Clear-DnsClientCache
```

**3. أعد التثبيت** بأمر التثبيت العادي من فوق.

**إذا الحجب على دومينّا بس:** نفس المثبّت موجود على GitHub:
```bash
curl -fsSL https://raw.githubusercontent.com/abdalganih1/Oh-My-abdalgani-code/main/gateway/web/public/install.sh | bash
```
```powershell
irm https://raw.githubusercontent.com/abdalganih1/Oh-My-abdalgani-code/main/gateway/web/public/install.ps1 | iex; abdalgani-setup
```
بس انتبه: أدواتك رح تحكي مع `api.abdalgani.com`، فلازم جهازك يقدر يحلّ هالاسم بالآخر. المثبّت نفسه بيقلك إذا الاسم ما انحلّ.

---

## 🤖 للوكلاء — For AI agents

Paste this to your agent (Claude Code, OpenCode, Cursor…) to set things up for you:

```text
Set up the abdalgani AI gateway for my coding tools.
Gateway: https://api.abdalgani.com (OpenAI /v1/chat/completions, Anthropic /v1/messages, Responses /v1/responses).
My key: sk-abd-...   Tools I want: OpenCode, ClaudeCode   (others: Hermes, CodexCLI, KiloCLI, PiCode, QwenCode, Goose, Aider, OpenClaw, KimiCode)

Steps:
1. macOS/Linux/WSL:  curl -fsSL https://api.abdalgani.com/install.sh | bash -s -- --tool <Tools> --api-key <KEY>
   Windows:          $env:ABDALGANI_API_KEY="<KEY>"; irm https://api.abdalgani.com/install.ps1 | iex; abdalgani-setup --tool <Tools>
   If curl says "Could not resolve host": the machine's DNS is broken. Re-fetch with `curl -fsSL --doh-url https://1.1.1.1/dns-query <same URL> | bash`;
   the installer then fixes the resolver itself (root/sudo). Manual fix: README #dns
   (systemd-resolved drop-in or /etc/resolv.conf → 1.1.1.1 / 8.8.8.8), then retry. Mirror: raw.githubusercontent.com/abdalganih1/Oh-My-abdalgani-code/main/gateway/web/public/install.sh
2. Verify:           abdalgani-setup --status   and   abdalgani-setup --list-models --api-key <KEY>
3. Use the stable aliases abd-main / abd-fast / abd-think unless I name a model. Never invent model ids — take them from --list-models.
Do not edit unrelated config. The installer backs up files it changes (*.abdalgani.bak).
```

### Non-interactive reference

```bash
abdalgani-setup --tool OpenCode,ClaudeCode --model abd-main --effort high --api-key sk-abd-…
abdalgani-setup --tool Hermes --no-install          # write config only, don't install the tool
abdalgani-setup --list-tools
abdalgani-setup --list-models --api-key sk-abd-…    # the models this key can really use
abdalgani-setup --status | --sync [--quiet] | --auto-sync on|off | --arabic | --lang ar|en | --help
```

| Flag | Meaning |
|---|---|
| `--tool` | One or more tools, comma-separated (names from `--list-tools`) |
| `--model` | Model id or alias (default `abd-main`) |
| `--effort` | `none` · `low` · `medium` · `high` · `xhigh` |
| `--api-key` | Gateway key (else env `ABDALGANI_API_KEY`, else the saved key) |
| `--no-install` | Only write config |

Without the one-line installer: `git clone https://github.com/abdalganih1/Oh-My-abdalgani-code.git && cd Oh-My-abdalgani-code && npm install && node setup.js --help`

---

<sub>للمدير وصاحب البوابة: النشر والإدارة والبنية التحتية بـ [gateway/README.md](gateway/README.md) · للمطوّرين: [Agent.md](Agent.md)</sub>

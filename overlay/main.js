const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { buildLaws, findDoc, readDoc } = require("./laws");

// самопроверка запускается в отдельном профиле, чтобы не трогать избранное и настройки игрока
if (process.env.SA_SELFTEST) app.setPath("userData", path.join(app.getPath("temp"), "sa-overlay-selftest"));
const SETTINGS = path.join(app.getPath("userData"), "settings.json");
// избранное — отдельным файлом рядом с настройками (переживает перезапуски и обновления)
const FAVS = path.join(app.getPath("userData"), "favorites.json");
let win;
let laws = { core: "", catalog: [], docs: [] };
let client = null;

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(next) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify({ ...readSettings(), ...next }, null, 2));
}

function getClient() {
  const key = readSettings().apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!client || client.apiKey !== key) client = new Anthropic({ apiKey: key });
  return client;
}

const SYSTEM_RULES = `Ты помощник сотрудника полиции на ролевом GTA 5 RP сервере штата Сан-Андреас. Он прямо сейчас на задержании, адвокат задаёт ему вопросы.

Он ИГРОК, а не юрист: диалог в игре идёт быстро, читать длинное некогда. Отвечай как опытный напарник-коп, а не как адвокат.

ГЛАВНОЕ — ПРОСТО И КОРОТКО. Формат строго такой, без заголовков, жирного и списков:
Ответ: <готовая фраза для игрового чата, 1–2 простых предложения, до ~150 символов>
Тебе: <максимум одно короткое предложение простыми словами; лучше опусти, если не критично>

Запрещено в ответе:
- пропуски и шаблоны («ст. __», «п. «__»», «___», варианты через «/»). Фраза должна быть ГОТОВОЙ, вставил — отправил.
- перечисление букв пунктов («а — …, б — …»), юридические обороты, несколько статей подряд.
- больше одной ссылки на статью в «Ответ:» (обычно одна главная).

Если не хватает данных (за что задержал, какая статья) — возьми их из блока «СЕЙЧАС У ИГРОКА», если он есть. Если и там нет — дай ответ под самый частый случай (застигнут на месте, есть видео) и не спрашивай.

Примеры:
Вопрос: адвокат требует вызвать прокурора, задержанный не госслужащий
Ответ: Прокурора вызывают только к госслужащим (ст. 19 ПК). Ваш подзащитный не госслужащий.
Вопрос: назовите основания задержания (выбрана ст. 17.1 УК)
Ответ: Задержан на месте преступления по ст. 16 ПК, подозревается в посягательстве на жизнь сотрудника (ст. 17.1 УК). Есть видеозапись.

Подробности, цитаты и разбор по пунктам давай ТОЛЬКО если он прямо попросит («подробнее», «почему», «процитируй») или нажал «Проверить ИИ» со списком статей — тогда тоже коротко, максимум 5 пунктов по строке.

Остальные правила:
- Опирайся только на законы и правила сервера. Ниже — полные тексты основных (ПК, УК, АК, ДК, Конституция, адвокатура, LSPD, неприкосновенность, ордера), скачанные с форума. Называй статью и часть.
- Остальные законы, уставы фракций и правила сервера открывай инструментом get_document, если вопрос их касается (например, FIB, шериф, тюрьма, оружие, ОРД, суд, правила допросов).
- Цитируй дословно, только из текстов. Если ответа нет ни в одном документе — так и скажи одной фразой. Не выдумывай статьи.
- Ищи лазейки и тонкости: пороги (суммы, граммы), повторность (ч. 2), когда АК превращается в УК (3+ статьи АК одним действием → ст. 17.4 УК), двойное вменение за одно действие, совокупность, федеральная/региональная статья и куда сажать, особые субъекты (госслужащий, адвокат, неприкосновенный), что адвокат может оспорить.
- Это разговор: учитывай предыдущие сообщения.
- Лазейки и тонкости упоминай в «Тебе:» одним коротким предложением, только если без этого игрок ошибётся.`;

const TOOLS = [
  {
    name: "get_document",
    description: "Открыть полный текст закона, устава или правил сервера из каталога, которого нет в контексте. name — название из каталога (можно часть).",
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
    strict: true
  }
];

async function ask(history) {
  if (!laws.core) laws = buildLaws();
  const c = getClient();
  if (!c) return { error: "Нет API-ключа. Нажми ⚙ и вставь ключ Anthropic." };
  const model = readSettings().model || "claude-haiku-5-5";
  const messages = history.slice();
  const system = [
    { type: "text", text: SYSTEM_RULES },
    // законы не меняются — кэшируем на час, повторные вопросы стоят копейки
    {
      type: "text",
      text: laws.core + "\n\n=== КАТАЛОГ ДРУГИХ ДОКУМЕНТОВ (открывать через get_document) ===\n" + laws.catalog.join("\n"),
      cache_control: { type: "ephemeral", ttl: "1h" }
    }
  ];
  try {
    for (let turn = 0; turn < 5; turn += 1) {
      const response = await c.beta.messages.create({
        model,
        max_tokens: 16000,
        output_config: { effort: "low" },
        // запасная модель при отказе — есть только у Opus/Sonnet
        ...(/haiku/.test(model) ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }),
        system,
        tools: TOOLS,
        messages
      });
      if (response.stop_reason === "refusal") return { error: "ИИ отказался отвечать на этот вопрос. Переформулируй." };
      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        const results = response.content
          .filter((b) => b.type === "tool_use")
          .map((b) => {
            const doc = findDoc(laws.docs, b.input && b.input.name);
            return doc
              ? { type: "tool_result", tool_use_id: b.id, content: readDoc(doc.file) }
              : { type: "tool_result", tool_use_id: b.id, content: "Не найдено. Возьми точное название из каталога.", is_error: true };
          });
        messages.push({ role: "user", content: results });
        continue;
      }
      const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return { text: text || "Пустой ответ, попробуй ещё раз." };
    }
    return { error: "ИИ слишком долго искал по документам. Задай вопрос точнее." };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { error: "Ключ не подходит. Проверь его в ⚙." };
    if (err instanceof Anthropic.RateLimitError) return { error: "Слишком много запросов, подожди пару секунд." };
    if (err instanceof Anthropic.APIConnectionError) return { error: "Нет связи с сервером ИИ. Проверь интернет." };
    if (err instanceof Anthropic.APIError) return { error: `Ошибка ИИ (${err.status}): ${err.message}` };
    return { error: String(err && err.message ? err.message : err) };
  }
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = 400;
  const height = 640;
  win = new BrowserWindow({
    width,
    height,
    x: area.x + area.width - width - 16,
    y: area.y + 80,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    focusable: true,
    title: "Помощник SA",
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true }
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) console.error("[окно]", message);
  });
  win.loadFile(path.join(__dirname, "index.html"));
  if (process.env.SA_SELFTEST) {
    win.webContents.once("did-finish-load", async () => {
      const out = await win.webContents.executeJavaScript(
        `new Promise((ok)=>setTimeout(async()=>{ const b=document.querySelector('[data-star="uk:17.1"]'); const was=b.classList.contains('on'); b.click(); setTimeout(async()=>ok([was, JSON.stringify(await window.sa.getFav()), document.querySelector('[data-fav]').textContent].join(' | ')),300); },500))`
      );
      console.log("SELFTEST", out, "core chars:", laws.core.length, "catalog:", laws.catalog.length);
      app.quit();
    });
  }
}

const HOTKEYS = {
  "Alt+1": "timer",
  "Alt+2": "lawyer",
  "Alt+3": "prosecutor",
  "Alt+S": "arts",
  "Alt+Q": "ask",
  "Alt+H": "toggle"
};

function registerHotkeys() {
  Object.entries(HOTKEYS).forEach(([accel, action]) => {
    globalShortcut.register(accel, () => {
      if (!win) return;
      if (action === "toggle") {
        if (win.isVisible()) win.hide();
        else win.showInactive();
        return;
      }
      if (!win.isVisible()) win.showInactive();
      if (action === "ask" || action === "arts") {
        win.show();
        win.focus();
      }
      win.webContents.send("hotkey", action);
    });
  });
}

ipcMain.handle("ask", (_e, history) => {
  const clean = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!clean.length || clean[0].role !== "user") return { error: "Пустой вопрос." };
  return ask(clean);
});
// ИИ-поиск статей: по описанию ситуации вернуть подходящие id из списка
ipcMain.handle("search", async (_e, query, catalog) => {
  const c = getClient();
  if (!c) return { error: "Нет API-ключа (⚙)" };
  const list = (Array.isArray(catalog) ? catalog : []).slice(0, 400).map((x) => `${x.id} — ${String(x.title).slice(0, 120)}`).join("\n");
  try {
    const response = await c.messages.create({
      model: readSettings().model || "claude-haiku-5-5",
      max_tokens: 2000,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"], additionalProperties: false }
        }
      },
      system: "Ты подбираешь статьи кодексов штата Сан-Андреас (GTA 5 RP) под описание ситуации от полицейского. Верни id подходящих статей из списка, самые вероятные первыми, максимум 8. Только id из списка.",
      messages: [{ role: "user", content: `Список статей:\n${list}\n\nСитуация: ${String(query).slice(0, 500)}` }]
    });
    if (response.stop_reason === "refusal") return { error: "ИИ отказался" };
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const ids = JSON.parse(text).ids || [];
    return { ids: ids.filter((id) => typeof id === "string") };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { error: "Ключ не подходит (⚙)" };
    if (err instanceof Anthropic.APIConnectionError) return { error: "Нет интернета" };
    return { error: "Ошибка ИИ-поиска" };
  }
});

ipcMain.handle("copy", (_e, text) => {
  clipboard.writeText(String(text || ""));
  return true;
});
ipcMain.handle("fav:get", () => {
  try {
    return JSON.parse(fs.readFileSync(FAVS, "utf8"));
  } catch {
    return null; // файла ещё нет
  }
});
ipcMain.handle("fav:set", (_e, list) => {
  const clean = (Array.isArray(list) ? list : []).filter((x) => typeof x === "string").slice(0, 500);
  fs.mkdirSync(path.dirname(FAVS), { recursive: true });
  // пишем через временный файл, чтобы не потерять избранное при сбое
  fs.writeFileSync(FAVS + ".tmp", JSON.stringify(clean));
  fs.renameSync(FAVS + ".tmp", FAVS);
  return true;
});
ipcMain.handle("settings:get", () => {
  const s = readSettings();
  return { hasKey: Boolean(s.apiKey || process.env.ANTHROPIC_API_KEY), model: s.model || "claude-haiku-5-5", opacity: s.opacity || 0.94, speak: Boolean(s.speak) };
});
ipcMain.handle("settings:set", (_e, next) => {
  const clean = {};
  if (typeof next.apiKey === "string" && next.apiKey.trim()) clean.apiKey = next.apiKey.trim();
  if (typeof next.model === "string" && next.model.trim()) clean.model = next.model.trim();
  if (typeof next.speak === "boolean") clean.speak = next.speak;
  if (typeof next.opacity === "number") clean.opacity = Math.min(1, Math.max(0.4, next.opacity));
  writeSettings(clean);
  return true;
});
ipcMain.handle("blur", () => {
  // вернуть фокус игре
  if (win) win.blur();
  return true;
});
ipcMain.handle("hide", () => {
  if (win) win.hide();
  return true;
});
ipcMain.handle("quit", () => app.quit());

app.setAppUserModelId("sa.helper.overlay");
app.whenReady().then(() => {
  laws = buildLaws();
  createWindow();
  registerHotkeys();
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());

const place = loadPlace();
const savedCode = localStorage.getItem("sa-law-code");

const MORE_SHORT = {
  gun: "оружие",
  fish: "рыба",
  hunt: "охота",
  lspd: "LSPD",
  ustav: "устав",
  fib: "ФРБ",
  usss: "USSS",
  sang: "SANG",
  prison: "тюрьмы",
  ems: "ЭМС",
  ethic: "этика",
  bar: "адвокат",
  pros: "прокуратура",
  gov: "правительство",
  const: "конституция",
  civil: "ГК",
  labor: "ТК"
};

const state = {
  mode: "memo",
  quiz: {
    pick: { pk: true, ak: true, dk: true, uk: true },
    n: 10,
    items: [],
    i: 0,
    choice: null,
    score: 0,
    wrong: [],
    phase: "pick"
  },
  code: SA.codes.some((item) => item.id === savedCode) ? savedCode : "pk",
  query: "",
  open: {},
  showReg: place.reg,
  showFed: place.fed,
  favOnly: false,
  fav: loadFav(),
  charge: loadCharge(),
  chargeOpen: localStorage.getItem("sa-law-charge-open") === "1"
};

function loadPlace() {
  const saved = localStorage.getItem("sa-law-place");
  if (saved) {
    const parts = saved.split(",");
    return { reg: parts[0] !== "0", fed: parts[1] !== "0" };
  }
  return { reg: true, fed: localStorage.getItem("sa-law-sizo") !== "1" };
}

function savePlace() {
  localStorage.setItem("sa-law-place", `${state.showReg ? "1" : "0"},${state.showFed ? "1" : "0"}`);
}

function loadFav() {
  try {
    const saved = JSON.parse(localStorage.getItem("sa-law-fav"));
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function saveFav() {
  localStorage.setItem("sa-law-fav", JSON.stringify(state.fav));
}

function favCount() {
  return Object.keys(state.fav).length;
}

function loadCharge() {
  try {
    const saved = JSON.parse(localStorage.getItem("sa-law-charge"));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveCharge() {
  localStorage.setItem("sa-law-charge", JSON.stringify(state.charge));
}

function chargeKey(code, num, part) {
  return `${code}:${num}${part ? `:${part}` : ""}`;
}

function inCharge(key) {
  return state.charge.some((item) => item.key === key);
}

function chargeCode(item) {
  return item.code === "uk" ? "УК" : item.short;
}

function chargeLine(item) {
  const part = item.part ? ` ${item.part}` : "";
  return `${item.num}${part} ${chargeCode(item)}`;
}

function chargeText() {
  return state.charge.map(chargeLine).join(", ");
}

function akChargeCount() {
  return new Set(state.charge.filter((item) => item.code === "ak").map((item) => item.num)).size;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function codeById(id) {
  return SA.codes.find((c) => c.id === id);
}

function dockHtml() {
  const quiz = state.mode === "quiz";
  return `
    <header class="dock">
      <div class="dock-top">
        <h1>${quiz ? "Тест" : "Памятки"}</h1>
        <div class="dock-actions">
          <button type="button" class="mode-btn" data-act="mode">${quiz ? "К статьям" : "Тест"}</button>
          <p>${quiz ? "ПК, АК, ДК, УК" : "1–4 — кодекс, / — поиск"}</p>
        </div>
      </div>
      ${quiz ? "" : `<nav class="codes">${SA.codes.map(renderTab).join("")}</nav>`}
    </header>`;
}

function mount(keep) {
  const root = document.getElementById("app");
  const code = codeById(state.code);
  const y = keep ? window.scrollY : 0;
  const search = document.getElementById("search");
  const typing = keep && search && document.activeElement === search;
  const pos = typing ? search.selectionStart : null;
  if (state.mode === "quiz") {
    root.innerHTML = `
      ${dockHtml()}
      <section class="sheet">${renderQuiz()}</section>
      <button type="button" class="totop" data-act="top" aria-label="Наверх">↑</button>
    `;
    if (keep) window.scrollTo(0, y);
    syncDock();
    return;
  }
  root.innerHTML = `
    ${dockHtml()}
    <section class="sheet">
      ${renderMemo(code)}
    </section>
    ${renderCharge()}
    <button type="button" class="totop" data-act="top" aria-label="Наверх">↑</button>
  `;
  const next = document.getElementById("search");
  if (typing && next) {
    next.focus();
    if (pos != null) next.setSelectionRange(pos, pos);
  }
  const jump = state.query && /^\d/.test(state.query.trim());
  const hit = jump ? document.querySelector(".sheet .art.open") : null;
  if (hit) hit.scrollIntoView({ block: "center" });
  else if (keep) window.scrollTo(0, y);
  syncDock();
}

function syncDock() {
  const dock = document.querySelector(".dock");
  if (!dock) return;
  dock.classList.toggle("slim", state.mode !== "quiz" && window.scrollY > 72);
}

function hi(text, q) {
  const raw = String(text);
  const needle = String(q || "").trim().toLowerCase();
  if (!needle) return esc(raw);
  let out = "";
  let i = 0;
  const lower = raw.toLowerCase();
  while (i < raw.length) {
    const at = lower.indexOf(needle, i);
    if (at < 0) {
      out += esc(raw.slice(i));
      break;
    }
    out += `${esc(raw.slice(i, at))}<mark>${esc(raw.slice(at, at + needle.length))}</mark>`;
    i = at + needle.length;
  }
  return out;
}

function queryOpens(id, q) {
  const query = String(q || "").trim().toLowerCase().replace(/^ст\.?\s*/, "");
  if (!/^\d/.test(query)) return false;
  const cur = String(id).toLowerCase();
  return cur === query || cur.startsWith(`${query}.`) || cur.startsWith(`${query} `);
}

function renderTab(code) {
  return `
    <button type="button" class="code-tab ${code.id === state.code ? "active" : ""}" data-act="code" data-code="${code.id}">
      <img src="${esc(code.img)}" alt="" />
      <span class="code-copy">
        <strong>${esc(code.short)}</strong>
        <span>${esc(code.blurb)}</span>
      </span>
    </button>
  `;
}

const NOTE_NAMES = {
  "что это": "Состав",
  "примечание": "Примечание",
  "примечания": "Примечание",
  "кто водитель": "Кто водитель",
  "превышение": "За превышение",
  "исключение": "Исключение",
  "спецсредства": "Спецсредства",
  "огонь": "Огнестрел",
  "дважды": "Второй раз",
  "обыск": "Первичный обыск",
  "миранда": "Текст Миранды",
  "правительство": "Если адвокатов нет",
  "рация": "Ответ в рацию",
  "частный": "Частный адвокат",
  "прокурор в рации": "Прокурор ответил",
  "нет прокурора": "Прокурор не приехал",
  "кто это подтверждает": "Как подтвердить",
  "разбор": "Разбор",
  "увольнение": "Увольнение",
  "не терпит отлагательства": "Без ордера",
  "гараж": "Гараж",
  "досмотр": "Досмотр",
  "арест": "Кто сажает",
  "снять боло": "Как снять",
  "чужой участок": "Чужой участок"
};

function fields(item) {
  if (item.length >= 4) return { n: item[0], t: item[1], d: item[2], p: item[3], img: item[4] || "" };
  const n = String(item[0]).replace(/^ст\.\s*/i, "");
  const text = item[1];
  const em = text.indexOf(" — ");
  const tail = em > 0 ? text.slice(em + 3) : "";
  const tailHead = tail.split(/(?<=\.)\s+(?=[А-ЯA-Z«])/)[0] || "";
  if (em > 0 && (em < 110 || /\$|суток|сутки|лет|года|год|лишени|предупрежден|арест/i.test(tailHead))) {
    return { n, t: text.slice(0, em), d: text, p: tail.replace(/\.$/, ""), img: "" };
  }
  const dot = text.indexOf(". ");
  const t = dot > 8 && dot < 92 ? text.slice(0, dot) : text;
  return { n, t, d: text, p: "", img: "" };
}

function lawKey(label) {
  return String(label).replace(/^ст\.\s*/i, "").replace(/\s+/g, " ").trim();
}

function joinLaws(items) {
  const ready = items.filter(Boolean);
  if (!ready.length) return null;
  return {
    title: "",
    text: ready.map((item) => item.text).filter(Boolean).join("\n\n"),
    pen: ready.map((item) => item.pen).filter(Boolean).join(" ")
  };
}

function articleParts(book, id) {
  const prefix = `${id} ч.`;
  return Object.keys(book)
    .filter((name) => name.startsWith(prefix))
    .sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));
}

function withParts(book, id, law) {
  if (!law) return null;
  if (/\sч\./i.test(id)) {
    const note = book[`${id} note`];
    if (note && note.text && (!law.pen || note.pen)) {
      return { title: law.title, text: law.text, pen: law.pen || note.pen || "" };
    }
    return law;
  }
  const parts = articleParts(book, id);
  const stub = !law.text || law.text.trim() === (law.title || "").trim();
  if (!parts.length) {
    const note = book[`${id} note`];
    if (stub && !law.pen && note && note.text) return { title: law.title, text: `${plainTitle(law.title)}\n\n${note.text}`, pen: "" };
    if (stub) return { title: law.title, text: plainTitle(law.title), pen: law.pen || "" };
    return law;
  }
  const text = parts.map((name) => {
    const part = book[name];
    const label = name.slice(id.length).trim();
    const body = plainTitle(part.text || "");
    const lines = [body, part.pen].map((line) => (line || "").trim()).filter(Boolean);
    return `${label} ${lines.join("\n")}`.trim();
  }).join("\n\n");
  return { title: law.title || "", text, pen: law.pen || "" };
}

function lawOf(codeId, label, articleId) {
  const book = window.SA_FULL && SA_FULL[codeId];
  if (!book) return null;
  const key = lawKey(label);
  if (/\sч\./i.test(key) && book[key]) return withParts(book, key, book[key]);
  if (book[key]) return withParts(book, key, book[key]);
  if ((/что это/i.test(key) || /кто водитель/i.test(key)) && book[`${articleId} note`]) return book[`${articleId} note`];
  const range = key.match(/^(\d+)\s*[–-]\s*(\d+)$/);
  if (range) {
    const items = [];
    for (let n = Number(range[1]); n <= Number(range[2]); n += 1) items.push(withParts(book, String(n), book[String(n)]));
    return joinLaws(items);
  }
  const pair = key.match(/^(\d+(?:\.\d+)?)\s+и\s+(\d+(?:\.\d+)?)$/);
  if (pair) return joinLaws([withParts(book, pair[1], book[pair[1]]), withParts(book, pair[2], book[pair[2]])]);
  return null;
}

function plainTitle(title) {
  return String(title).replace(/^\([^)]+\)\s*/, "").replace(/^\s*-\s*/, "").trim();
}

function hasPlacePrefix(title) {
  return /^\([^)]*(?:ФЕДЕРАЛ|РЕГИОН|ФИНАНС|ВОЕН)/i.test(title || "");
}

function dropPlaceSentence(text) {
  return String(text || "")
    .split(/(?<=\.)\s+/)
    .filter((part) => !/^(федеральная|региональная)(?:\s+или\s+(?:федеральная|региональная))?\.?$/i.test(part.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function placeFromTitle(title) {
  const text = String(title || "").toUpperCase();
  const fed = /ФЕДЕРАЛ/.test(text);
  const regional = /РЕГИОН/.test(text);
  const money = /ФИНАНС/.test(text);
  const military = /ВОЕНН/.test(text);
  if (regional && !fed && !money && !military) return { id: "sizo", name: "региональный" };
  if ((fed || money || military) && !regional) return { id: "fed", name: "федеральный" };
  if (regional && (fed || money || military)) return { id: "mix", name: "региональный или федеральный" };
  return null;
}

function groupPlace(codeId, group) {
  const found = group.parts
    .map((part) => lawOf(codeId, part.item[0], group.id))
    .map((law) => law && placeFromTitle(law.title))
    .filter(Boolean);
  if (!found.length) return null;
  if (found.some((place) => place.id === "mix") || (found.some((place) => place.id === "fed") && found.some((place) => place.id === "sizo"))) {
    return { id: "mix", name: "региональный или федеральный" };
  }
  return found[0];
}

function clipTitle(text) {
  if (text.length <= 78) return text;
  const cut = text.slice(0, 76);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`;
}

function ruWord(text, word) {
  return new RegExp(`(?:^|[^а-яё])${word}(?=$|[^а-яё])`, "i").test(text);
}

function driveLoss(text) {
  return /лишен[а-яё]*\s+лицензи[а-яё]*\s+на\s+вождение/i.test(text)
    || /лишен[а-яё]*\s+прав(?![а-яё])/i.test(text);
}

function gunLoss(text) {
  return /изъять лицензию на гражданское оружие|лишен[а-яё]* лицензии на право владения|аннулирован[а-яё]* лицензии/i.test(text);
}

function seal(kind) {
  const name = kind === "drive" ? "права" : "оружие";
  return `<span class="seal ${kind}"><i aria-hidden="true"></i><b>${name}</b><em>лишение</em></span>`;
}

function markHtml(text) {
  return `${driveLoss(text) ? seal("drive") : ""}${gunLoss(text) ? seal("gun") : ""}`;
}

function placeVisible(codeId, group) {
  if (codeId !== "uk") return true;
  const place = groupPlace(codeId, group);
  if (!place) return true;
  if (place.id === "sizo") return state.showReg;
  if (place.id === "fed") return state.showFed;
  return state.showReg || state.showFed;
}

function sanctionKind(bit) {
  if (/лишен[а-яё]*\s+лицензи[а-яё]*\s+на\s+право\s+владения/i.test(bit)) return "gun";
  if (/лишен[а-яё]*\s+(лицензи[а-яё]*|прав(?![а-яё]))/i.test(bit)) return "license";
  if (/суток|сутки|кпз|арест/i.test(bit)) return "cell";
  if (ruWord(bit, "лет") || ruWord(bit, "года") || ruWord(bit, "год") || /пожизнен/i.test(bit)) return "prison";
  if (ruWord(bit, "час") && /\d/.test(bit)) return "hold";
  if (/\$/.test(bit) || /штраф/i.test(bit)) return "fine";
  if (/предупрежден/i.test(bit)) return "warn";
  return "";
}

function chipSource(pen, fallback) {
  const raw = String(pen || fallback || "").trim();
  if (!raw) return "";
  return raw
    .replace(/^влечет\s+(наложение\s+)?/i, "")
    .replace(/административного\s+штрафа/gi, "штраф")
    .replace(/наложени[ея]\s+административного\s+штрафа/gi, "штраф")
    .replace(/административный\s+арест/gi, "арест")
    .replace(/(\d+[^\d]{0,12}суток)\s+лишения\s+свободы/gi, "$1")
    .replace(/лишения\s+свободы/gi, "лет")
    .replace(/\s+/g, " ")
    .trim();
}

function sanctionHtml(text) {
  const lines = String(text).replace(/\.$/, "").split(/(?<=\.)\s+(?=[А-ЯA-Z«])/).filter(Boolean);
  return lines.map((line) => {
    if (!/\$|суток|сутки|лет|года|год|лишени|предупрежден|арест|кпз|час/i.test(line)) {
      return `<p>${esc(line)}</p>`;
    }
    const tokens = line.split(/(\s+или\s+|\s+либо\s+|\s+и\s+|,\s*)/);
    const chips = tokens.map((token) => {
      const bit = token.trim().replace(/\.$/, "");
      if (!bit) return "";
      if (bit === "или" || bit === "либо" || bit === "и") return `<span class="conj">${esc(bit)}</span>`;
      const kind = sanctionKind(bit);
      if (!kind) return `<span class="rest">${esc(bit)}</span>`;
      const name = { fine: "штраф", cell: "КПЗ", prison: "тюрьма", hold: "задержание", license: "права", gun: "оружие", warn: "устно" }[kind];
      return `<span class="tag ${kind}"><span class="mark" aria-hidden="true"></span><span class="kind">${name}</span><span>${esc(bit)}</span></span>`;
    }).join("");
    return `<div class="sans">${chips}</div>`;
  }).join("");
}

function articleId(label) {
  const stripped = String(label).replace(/^ст\.\s*/i, "").trim();
  if (!/^\d/.test(stripped)) return null;
  const match = stripped.match(/^(\d+(?:\.\d+)*)(?:\s+(ч\.?\s*[\d.]+(?:\s*[–\-]\s*[\d.]+)?))?$/i);
  if (!match) return { id: stripped, part: "" };
  const part = match[2] ? match[2].replace(/\s+/g, " ").replace(/^ч(?!\.)/i, "ч.") : "";
  return { id: match[1], part };
}

function noteName(label) {
  const text = String(label).trim();
  const key = text.toLowerCase();
  if (NOTE_NAMES[key]) return NOTE_NAMES[key];
  if (/^ч\.?\s*[\d.]/i.test(text)) return text.replace(/^ч(?!\.)/i, "ч.");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function extraText(f) {
  if (!f.d || f.d === f.t) return "";
  const plain = f.d.replace(/\.$/, "");
  if (f.p && (plain === `${f.t} — ${f.p}` || plain === f.p)) return "";
  return f.d;
}

function groupItems(entries) {
  const groups = [];
  entries.forEach((entry) => {
    const parsed = articleId(entry.item[0]);
    const last = groups[groups.length - 1];
    if (parsed && last && last.id === parsed.id) {
      last.parts.push({ ...entry, part: parsed.part });
      return;
    }
    if (!parsed && last) {
      last.parts.push({ ...entry, part: noteName(entry.item[0]) });
      return;
    }
    groups.push({
      id: parsed ? parsed.id : noteName(entry.item[0]),
      parts: [{ ...entry, part: parsed ? parsed.part : "" }]
    });
  });
  return groups;
}

function starHtml(id) {
  const on = !!state.fav[id];
  return `<button type="button" class="star ${on ? "on" : ""}" data-act="fav" data-fav="${esc(id)}" aria-pressed="${on}" aria-label="${on ? "Убрать из избранного" : "В избранное"}">${on ? "★" : "☆"}</button>`;
}

function pinHtml(code, num, part, title, tag) {
  if (code === "pk") return "";
  const key = chargeKey(code, num, part);
  const on = inCharge(key);
  return `<button type="button" class="pin ${on ? "on" : ""}" data-act="charge" data-code="${esc(code)}" data-num="${esc(num)}" data-part="${esc(part || "")}" data-title="${esc(title)}" data-tag="${esc(tag || "")}" aria-pressed="${on}" aria-label="${on ? "Убрать из обвинения" : "Добавить в обвинение"}">${on ? "✓" : "+"}</button>`;
}

function renderCharge() {
  if (!state.charge.length) return "";
  const text = chargeText();
  const ak = akChargeCount();
  const warn = ak >= 3
    ? `<p class="charge-warn">Уже ${ak} статьи КоАП. Если это одно действие — пиши УК ст. 17.4, не три отдельных АК.</p>`
    : "";
  return `
    <aside class="charge" aria-live="polite">
      <div class="charge-bar">
        <strong>Обвинение</strong>
        <span>${state.charge.length}</span>
        <button type="button" class="tool-btn" data-act="chargeopen">${state.chargeOpen ? "Скрыть список" : "Список"}</button>
        <button type="button" class="tool-btn copy" data-act="copy">Копировать</button>
        <button type="button" class="tool-btn" data-act="clear">Очистить</button>
      </div>
      ${warn}
      <textarea class="charge-text" readonly>${esc(text)}</textarea>
      ${state.chargeOpen ? `
        <ol class="charge-list">
          ${state.charge.map((item) => `
            <li>
              <span>${esc(chargeLine(item))}</span>
              <button type="button" data-act="uncharge" data-key="${esc(item.key)}" aria-label="Убрать">×</button>
            </li>
          `).join("")}
        </ol>
      ` : ""}
    </aside>
  `;
}

function renderMemo(code) {
  const q = state.query.trim().toLowerCase();
  const sources = state.favOnly ? SA.codes : [code];
  const blocks = sources.flatMap((source) => source.blocks
    .map((block, bi) => {
      if (block.fold) {
        if (state.favOnly) return { ...block, bi, items: [], source };
        const rows = block.items.filter((item) => !q || item.join(" ").toLowerCase().includes(q));
        return { ...block, bi, items: rows, source };
      }
      const items = groupItems(block.items.map((item, ii) => ({ item, ii }))).filter((group) => {
        if (state.favOnly && !state.fav[`${source.id}:${group.id}`]) return false;
        if (!placeVisible(source.id, group)) return false;
        if (!q) return true;
        return group.parts.some(({ item }) => {
          const f = fields(item);
          return `${group.id} ${f.n} ${f.t} ${f.d} ${f.p}`.toLowerCase().includes(q);
        });
      });
      return {
        ...block,
        title: state.favOnly ? `${source.short} · ${block.title}` : block.title,
        bi,
        items,
        source
      };
    })
    .filter((block) => block.items.length));
  const side = renderSide();
  const shown = blocks.reduce((sum, block) => sum + (block.fold ? 0 : block.items.length), 0);
  const sideHits = q && window.SA_MORE
    ? SA_MORE.reduce((sum, law) => sum + law.arts.filter((art) => {
      if (state.favOnly && !state.fav[`more:${law.id}:${art.n}`]) return false;
      if (/^\d/.test(q.trim())) return queryOpens(art.n, q);
      return `${art.n} ${art.title} ${art.text}`.toLowerCase().includes(q);
    }).length, 0)
    : 0;
  const foundLine = !shown && !sideHits
    ? "Ничего не нашлось."
    : `В этом кодексе: ${shown}${sideHits ? `. Ниже в прочих законах: ${sideHits}` : ""}.`;
  const opened = Object.keys(state.open).some((key) => state.open[key]);
  return `
    <div class="sheet-bar">
      <div class="sheet-id">
        ${state.favOnly
          ? `<div class="fav-mark" aria-hidden="true">★</div>`
          : `<img src="${esc(code.img)}" alt="" />`}
        <div>
          <h2>${state.favOnly ? `Избранное <span class="fav-count">${favCount()}</span>` : `${esc(code.short)} · ${esc(code.name)}`}</h2>
          <p class="meta">${state.favOnly ? "Отмеченные статьи из всех кодексов." : q ? foundLine : `${esc(code.lead)} Нажми на статью, чтобы открыть текст и санкцию.`}</p>
        </div>
      </div>
      <div class="sheet-tools">
        <button type="button" class="tool-btn fav ${state.favOnly ? "on" : ""}" data-act="favonly"><span aria-hidden="true">★</span>${state.favOnly ? "Все статьи" : "Избранное"}${!state.favOnly && favCount() ? `<b>${favCount()}</b>` : ""}</button>
        ${opened ? `<button type="button" class="tool-btn" data-act="shut">Свернуть</button>` : ""}
        ${code.id === "uk" || state.favOnly ? `
          <button type="button" class="tool-btn reg ${state.showReg ? "on" : ""}" data-act="place" data-place="reg" aria-pressed="${state.showReg}">Региональные</button>
          <button type="button" class="tool-btn fed ${state.showFed ? "on" : ""}" data-act="place" data-place="fed" aria-pressed="${state.showFed}">Федеральные</button>
        ` : ""}
        <input class="search" id="search" placeholder="Номер или слово" value="${esc(state.query)}" autocomplete="off" oninput="onSearch(event)" />
      </div>
    </div>
    <div class="sheet-body">
      <div class="chips">${code.chips.map((chip) => `<span class="chip">${esc(chip)}</span>`).join("")}</div>
      ${blocks.length ? blocks.map((block) => block.fold ? renderFold(block, block.source) : `
        <h3 class="group-title">${esc(block.title)}</h3>
        <div class="rows">
          ${block.items.map((group, gi) => {
            const first = fields(group.parts[0].item);
            const leadLaw = lawOf(block.source.id, group.parts[0].item[0], group.id);
            const named = leadLaw && plainTitle(leadLaw.title);
            const title = clipTitle(
              named && named.length <= 72 && named !== leadLaw.text
                ? named
                : first.t
            );
            const place = block.source.id === "uk" ? groupPlace(block.source.id, group) : null;
            const blob = group.parts.map((part) => {
              const f = fields(part.item);
              const law = lawOf(block.source.id, part.item[0], group.id);
              return [f.t, f.d, f.p, law && law.text, law && law.pen].filter(Boolean).join(" ");
            }).join(" ");
            const marks = markHtml(blob);
            const chips = group.parts.length > 1
              ? group.parts.map((part) => part.part || "общее")
              : [];
            const key = `${block.source.id}-${block.bi}-${gi}`;
            const favId = `${block.source.id}:${group.id}`;
            const open = Boolean(state.open[key]) || queryOpens(group.id, q) || Boolean(q && shown > 0 && shown <= 3);
            return `
              <article class="art ${open ? "open" : ""} ${group.parts.length > 1 ? "bundle" : ""}">
                <div class="art-line">
                <button type="button" class="art-head" data-act="art" data-key="${key}" aria-expanded="${open}">
                  <span class="num">${hi(group.id, q)}</span>
                  <span class="at">
                    ${hi(title, q)}
                    ${place ? (place.id === "mix"
                      ? `<span class="where sizo">региональный</span><span class="where fed">федеральный</span>`
                      : `<span class="where ${place.id}">${esc(place.name)}</span>`) : ""}
                    ${marks}
                    ${chips.length ? `<span class="bits">${chips.map((chip) => `<span class="bit">${esc(chip)}</span>`).join("")}</span>` : ""}
                  </span>
                  <span class="pm">${open ? "–" : "+"}</span>
                </button>
                ${pinHtml(block.source.id, group.id, "", title)}
                ${starHtml(favId)}
                </div>
                <div class="art-body">
                  ${group.parts.map((part) => {
                    const f = fields(part.item);
                    const parsed = articleId(part.item[0]);
                    const label = part.part || (group.parts.length > 1 ? "общее" : "");
                    const law = lawOf(block.source.id, part.item[0], group.id);
                    const detail = law ? "" : extraText(f);
                    const clipped = !law && group.parts.length === 1 && f.t.length > 78 && !detail;
                    const shown = law && law.text ? plainTitle(law.text) : "";
                    const heading = law ? plainTitle(law.title || "") : "";
                    const lead = heading && shown && heading !== shown && !shown.includes(heading) && !heading.startsWith(shown) ? heading : "";
                    const penalty = chipSource(law && law.pen, place ? dropPlaceSentence(f.p) : f.p);
                    return `
                      <div class="part">
                        ${label ? `<span class="bit">${esc(label)}</span>` : "<span></span>"}
                        ${parsed && parsed.part ? pinHtml(block.source.id, parsed.id, parsed.part, f.t) : ""}
                        <div>
                          ${f.img ? `<img class="shot" src="${esc(f.img)}" alt="" />` : ""}
                          ${group.parts.length > 1 && !shown ? `<b>${esc(f.t)}</b>` : ""}
                          ${lead ? `<p class="law">${esc(lead)}</p>` : ""}
                          ${shown ? `<p class="law">${esc(shown)}</p>` : ""}
                          ${law && law.pen ? `<p class="law">${esc(law.pen)}</p>` : ""}
                          ${clipped ? `<p>${esc(f.t)}</p>` : ""}
                          ${detail ? `<p>${esc(detail)}</p>` : ""}
                          ${penalty ? sanctionHtml(penalty) : ""}
                        </div>
                      </div>
                    `;
                  }).join("")}
                </div>
              </article>
            `;
          }).join("")}
        </div>
      `).join("") : (!side ? `<p class="empty">${state.favOnly ? "В избранном пока пусто. Звезда справа на статье сохраняет её." : "В этой памятке такого нет. Сбрось поиск или открой другой кодекс."}</p>` : "")}
      ${side}
    </div>
  `;
}

function renderSide() {
  const laws = window.SA_MORE;
  if (!laws || !laws.length) return "";
  const q = state.query.trim().toLowerCase();
  const shown = laws.map((law) => {
    const arts = law.arts.filter((art) => {
      if (state.favOnly && !state.fav[`more:${law.id}:${art.n}`]) return false;
      if (!q) return true;
      if (/^\d/.test(q.trim())) return queryOpens(art.n, q);
      return `${art.n} ${art.title} ${art.text}`.toLowerCase().includes(q);
    });
    if (!arts.length && (q || state.favOnly)) return "";
    return renderSideLaw(q || state.favOnly ? { ...law, arts } : law, q);
  }).join("");
  if (!shown) return "";
  return `
    <div class="side-laws">
      <h3 class="group-title">Прочие законы</h3>
      <p class="side-note">Закрыты, пока не откроешь. Поиск оставляет только совпадения.</p>
      ${shown}
    </div>
  `;
}

function renderSideLaw(law, q) {
  const key = `side-${law.id}`;
  const open = state.favOnly || Boolean(q) || state.open[key];
  return `
    <article class="art fold side ${open ? "open" : ""}">
      <button type="button" class="art-head" data-act="art" data-key="${key}" aria-expanded="${open}">
        <span class="num">${law.arts.length}</span>
        <span class="at">${hi(law.title, q)}</span>
        <span class="pm">${open ? "–" : "+"}</span>
      </button>
      <div class="art-body">
        ${law.lead ? `<p class="law side-lead">${esc(law.lead)}</p>` : ""}
        ${(open ? law.arts : []).map((art) => {
          const akey = `side-${law.id}-${art.n}`;
          const aopen = Boolean(state.open[akey]) || queryOpens(art.n, q) || Boolean(q && law.arts.length <= 3);
          const body = art.text === art.title || art.text.startsWith(art.title)
            ? art.text
            : `${art.title}\n\n${art.text}`;
          return `
            <article class="art ${aopen ? "open" : ""}">
              <div class="art-line">
              <button type="button" class="art-head" data-act="art" data-key="${esc(akey)}" aria-expanded="${aopen}">
                <span class="num">${hi(art.n, q)}</span>
                <span class="at">${hi(clipTitle(art.title || art.text), q)}${markHtml(`${art.title} ${art.text}`)}</span>
                <span class="pm">${aopen ? "–" : "+"}</span>
              </button>
              ${pinHtml("more", art.n, "", clipTitle(art.title || art.text), MORE_SHORT[law.id] || law.title)}
              ${starHtml(`more:${law.id}:${art.n}`)}
              </div>
              <div class="art-body">
                <div class="part">
                  <span></span>
                  <div><p class="law">${esc(body)}</p></div>
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

function renderFold(block, code) {
  const rows = block.items;
  if (!rows.length) return "";
  const key = `${code.id}-fold-${block.bi}`;
  const open = Boolean(state.query.trim()) || state.open[key];
  return `
    <h3 class="group-title">${esc(block.title)}</h3>
    <article class="art fold ${open ? "open" : ""}">
      <button type="button" class="art-head" data-act="art" data-key="${key}" aria-expanded="${open}">
        <span class="num">инфо</span>
        <span class="at">${esc(block.hint || "Справка без отдельной санкции на улице.")}</span>
        <span class="pm">${open ? "–" : "+"}</span>
      </button>
      <div class="art-body">
        ${rows.map((item) => {
          const law = lawOf(code.id, item[0], "");
          const text = law && law.text ? law.text : item[1];
          const pen = law && law.pen && law.pen !== law.text ? law.pen : "";
          return `
          <div class="part">
            <span class="bit">${esc(String(item[0]).replace(/^ст\.\s*/i, ""))}</span>
            <div>
              <p class="law">${esc(text)}</p>
              ${pen ? `<p class="law">${esc(pen)}</p>` : ""}
            </div>
          </div>
        `;
        }).join("")}
      </div>
    </article>
  `;
}

let searchTimer = 0;
function onSearch(event) {
  state.query = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => mount(true), 70);
}

function onAction(event) {
  const button = event.target.closest("[data-act]");
  if (!button) return;
  const act = button.dataset.act;
  if (act === "fav") {
    const id = button.dataset.fav;
    if (state.fav[id]) delete state.fav[id];
    else state.fav[id] = 1;
    saveFav();
    if (state.favOnly) {
      mount();
      return;
    }
    const on = !!state.fav[id];
    button.classList.toggle("on", on);
    button.textContent = on ? "★" : "☆";
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? "Убрать из избранного" : "В избранное");
    const toggle = document.querySelector("[data-act=favonly]");
    const count = toggle && toggle.querySelector("b");
    if (favCount()) {
      if (count) count.textContent = String(favCount());
      else if (toggle) toggle.insertAdjacentHTML("beforeend", `<b>${favCount()}</b>`);
    } else if (count) count.remove();
    return;
  }
  if (act === "charge") {
    const key = chargeKey(button.dataset.code, button.dataset.num, button.dataset.part);
    if (inCharge(key)) {
      state.charge = state.charge.filter((item) => item.key !== key);
    } else {
      const source = codeById(button.dataset.code);
      state.charge.push({
        key,
        code: button.dataset.code,
        short: button.dataset.tag || (source ? source.short : "закон"),
        num: button.dataset.num,
        part: button.dataset.part,
        title: button.dataset.title
      });
    }
    saveCharge();
    mount();
    return;
  }
  if (act === "uncharge") {
    state.charge = state.charge.filter((item) => item.key !== button.dataset.key);
    saveCharge();
    mount();
    return;
  }
  if (act === "clear") {
    state.charge = [];
    saveCharge();
    mount();
    return;
  }
  if (act === "copy") {
    const text = chargeText();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
    else {
      const box = document.querySelector(".charge-text");
      if (box) {
        box.focus();
        box.select();
        document.execCommand("copy");
      }
    }
    button.textContent = "Скопировано";
    setTimeout(() => {
      if (button.isConnected) button.textContent = "Копировать";
    }, 1200);
    return;
  }
  if (act === "favonly") {
    state.favOnly = !state.favOnly;
    mount();
    return;
  }
  if (act === "art") {
    const key = button.dataset.key;
    state.open[key] = !state.open[key];
    if (/^side-[^-]+$/.test(key)) {
      mount(true);
      return;
    }
    const art = button.closest(".art");
    art.classList.toggle("open", state.open[key]);
    button.querySelector(".pm").textContent = state.open[key] ? "–" : "+";
    button.setAttribute("aria-expanded", String(state.open[key]));
    return;
  }
  if (act === "shut") {
    state.open = {};
    mount(true);
    return;
  }
  if (act === "top") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (act === "chargeopen") {
    state.chargeOpen = !state.chargeOpen;
    localStorage.setItem("sa-law-charge-open", state.chargeOpen ? "1" : "0");
    mount(true);
    return;
  }
  if (act === "place") {
    if (button.dataset.place === "reg") state.showReg = !state.showReg;
    if (button.dataset.place === "fed") state.showFed = !state.showFed;
    savePlace();
    mount();
    return;
  }
  if (act === "code") {
    state.code = button.dataset.code;
    state.query = "";
    state.favOnly = false;
    localStorage.setItem("sa-law-code", state.code);
    mount();
    return;
  }
  if (act === "mode") {
    state.mode = state.mode === "quiz" ? "memo" : "quiz";
    mount();
    window.scrollTo(0, 0);
    return;
  }
  if (act === "quizcode") {
    const id = button.dataset.code;
    const next = !state.quiz.pick[id];
    const other = ["pk", "ak", "dk", "uk"].some((code) => code !== id && state.quiz.pick[code]);
    if (!next && !other) return;
    state.quiz.pick[id] = next;
    mount(true);
    return;
  }
  if (act === "quizn") {
    state.quiz.n = Number(button.dataset.n);
    mount(true);
    return;
  }
  if (act === "quizstart") {
    startQuiz();
    return;
  }
  if (act === "quizopt") {
    if (state.quiz.choice != null) return;
    const choice = Number(button.dataset.i);
    const item = state.quiz.items[state.quiz.i];
    state.quiz.choice = choice;
    if (choice === item.answer) state.quiz.score += 1;
    else state.quiz.wrong.push({ item, choice });
    mount(true);
    return;
  }
  if (act === "quiznext") {
    state.quiz.i += 1;
    state.quiz.choice = null;
    if (state.quiz.i >= state.quiz.items.length) state.quiz.phase = "done";
    mount(true);
    window.scrollTo(0, 0);
    return;
  }
  if (act === "quizagain") {
    state.quiz.phase = "pick";
    mount();
    window.scrollTo(0, 0);
  }
}

function quizPool() {
  return (window.SA_QUIZ || []).filter((item) => state.quiz.pick[item.code]);
}

function startQuiz() {
  const pool = quizPool();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = pool[i];
    pool[i] = pool[j];
    pool[j] = swap;
  }
  state.quiz.items = pool.slice(0, Math.min(state.quiz.n, pool.length)).map((item) => {
    const order = item.options.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = order[i];
      order[i] = order[j];
      order[j] = swap;
    }
    return {
      code: item.code,
      kind: item.kind,
      ask: item.ask,
      q: item.q,
      why: item.why,
      options: order.map((index) => item.options[index]),
      answer: order.indexOf(item.answer)
    };
  });
  state.quiz.i = 0;
  state.quiz.choice = null;
  state.quiz.score = 0;
  state.quiz.wrong = [];
  state.quiz.phase = state.quiz.items.length ? "ask" : "pick";
  mount();
  window.scrollTo(0, 0);
}

function quizCodeName(id) {
  return id === "pk" ? "ПК" : id === "ak" ? "АК" : id === "dk" ? "ДК" : "УК";
}

function quizLetter(index) {
  return "АБВГ"[index] || String(index + 1);
}

function renderQuiz() {
  if (state.quiz.phase === "ask") return renderQuizAsk();
  if (state.quiz.phase === "done") return renderQuizDone();
  const pool = quizPool();
  const counts = { pk: 0, ak: 0, dk: 0, uk: 0 };
  (window.SA_QUIZ || []).forEach((item) => {
    counts[item.code] += 1;
  });
  const take = Math.min(state.quiz.n, pool.length);
  return `
    <div class="exam">
      <header class="exam-hero">
        <p class="kicker">Тренировка</p>
        <h2>Какие статьи берём</h2>
        <p>Без номеров статей. ПК — ситуации на задержании, остальные — что за это будет.</p>
      </header>
      <div class="exam-codes">
        ${["pk", "ak", "dk", "uk"].map((id) => {
          const code = codeById(id);
          return `
            <button type="button" class="exam-code${state.quiz.pick[id] ? " on" : ""}" data-act="quizcode" data-code="${id}">
              <img src="${code.img}" alt="" />
              <b>${code.short}</b>
              <span>${counts[id]}</span>
            </button>`;
        }).join("")}
      </div>
      <div class="exam-len">
        <span>Вопросов в заходе</span>
        <div>
          ${[10, 15, 20].map((n) => `
            <button type="button" class="exam-size${state.quiz.n === n ? " on" : ""}" data-act="quizn" data-n="${n}">${n}</button>
          `).join("")}
        </div>
      </div>
      <button type="button" class="exam-go" data-act="quizstart" ${take ? "" : "disabled"}>Начать · ${take}</button>
    </div>`;
}

function renderQuizAsk() {
  const item = state.quiz.items[state.quiz.i];
  const chosen = state.quiz.choice;
  const code = codeById(item.code);
  const total = state.quiz.items.length;
  const progress = Math.round(((state.quiz.i + 1) / total) * 100);
  const options = item.options.map((text, index) => {
    let cls = "exam-opt";
    if (chosen != null && index === item.answer) cls += " good";
    else if (chosen === index) cls += " bad";
    return `
      <button type="button" class="${cls}" data-act="quizopt" data-i="${index}" ${chosen != null ? "disabled" : ""}>
        <i>${quizLetter(index)}</i>
        <span>${esc(text)}</span>
      </button>`;
  }).join("");
  const right = chosen === item.answer;
  return `
    <div class="exam">
      <div class="exam-top">
        <p class="exam-chip">${code.short}</p>
        <span>${state.quiz.i + 1} / ${total}</span>
      </div>
      <div class="exam-bar" aria-hidden="true"><i style="width:${progress}%"></i></div>
      <p class="exam-ask">${esc(item.ask || "Выбери ответ")}</p>
      <h2 class="exam-q${item.q.length > 60 ? " long" : ""}">${esc(item.q)}</h2>
      <div class="exam-opts">${options}</div>
      ${chosen == null ? "" : `
        <div class="exam-note${right ? " good" : " bad"}">
          <b>${right ? "Верно" : "Мимо"}</b>
          <p>${esc(item.why)}</p>
        </div>
        <button type="button" class="exam-go" data-act="quiznext">${state.quiz.i + 1 === total ? "Результат" : "Дальше"}</button>
      `}
    </div>`;
}

function renderQuizDone() {
  const total = state.quiz.items.length || 1;
  const score = state.quiz.score;
  const pct = Math.round((score / total) * 100);
  const line = score === state.quiz.items.length
    ? "Чистый заход. Можно взять следующий набор."
    : "Ниже только промахи. Прочитай пояснение и пройди ещё раз.";
  const misses = state.quiz.wrong.map((row) => `
    <article>
      <p class="exam-miss-code">${quizCodeName(row.item.code)}</p>
      <h3>${esc(row.item.q)}</h3>
      <p><span>Ответ</span> ${esc(row.item.options[row.choice])}</p>
      <p><span>Верно</span> ${esc(row.item.options[row.item.answer])}</p>
      <p class="exam-miss-why">${esc(row.item.why)}</p>
    </article>
  `).join("");
  return `
    <div class="exam">
      <div class="exam-score" style="--p:${pct}">
        <b>${score}</b>
        <span>из ${state.quiz.items.length}</span>
      </div>
      <p class="exam-line">${line}</p>
      ${misses ? `<div class="exam-miss">${misses}</div>` : ""}
      <button type="button" class="exam-go" data-act="quizagain">Ещё раз</button>
    </div>`;
}

document.addEventListener("click", onAction);
window.addEventListener("scroll", syncDock, { passive: true });
document.addEventListener("keydown", (event) => {
  if (state.mode === "quiz") return;
  const field = event.target && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA");
  if (event.key === "Escape") {
    if (!state.query) return;
    state.query = "";
    mount(true);
    return;
  }
  if (field || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "/") {
    event.preventDefault();
    const box = document.getElementById("search");
    if (box) box.focus();
    return;
  }
  if (event.key >= "1" && event.key <= String(SA.codes.length)) {
    const next = SA.codes[Number(event.key) - 1];
    if (!next) return;
    state.code = next.id;
    state.query = "";
    state.favOnly = false;
    localStorage.setItem("sa-law-code", state.code);
    mount();
  }
});

mount();

// Разбирает УК, АК, ДК с форума (forum/texts) на статьи и части с наказаниями.
// Запуск: node build-articles.js  → создаёт articles.js для окна помощника.
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "forum", "texts");
const CODES = [
  ["uk", /Уголовный кодекс/],
  ["ak", /Административных правонарушениях/],
  ["dk", /Дорожный кодекс/]
];

const PEN = /^\s*[—–-]\s*(?=\S)/;
const clip = (s, n) => (s.length > n ? s.slice(0, s.lastIndexOf(" ", n) > 40 ? s.lastIndexOf(" ", n) : n).replace(/[,:;]\s*$/, "") + "…" : s);
const tidy = (s) => s.replace(/\(\([^)]*\)\)/g, "").replace(/\s+/g, " ").replace(/^\s*[-—–]\s*/, "").replace(/\s*[-—–:]\s*$/, "").trim();
// полный текст части: строки (списки а), б)…) сохраняем; если часть начинается со списка — подставляем первую фразу статьи
function fullText(lines, title) {
  const body = lines
    .map((l) => l.replace(/\(\([^)]*\)\)/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\s*[-—–]\s*$/, "");
  if (!body) return title;
  if (/^[а-яё]\)/i.test(body)) return title + "\n" + body;
  return body;
}
const shortPen = (s) =>
  s.replace(/наложение административного штрафа в размере/gi, "штраф")
    .replace(/административного штрафа в размере/gi, "штрафа")
    .replace(/административный арест/gi, "арест")
    .replace(/^наложение\s+/i, "")
    .trim();

function parse(code, text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let art = null;
  const noPen = [];
  const flush = () => {
    if (!art) return;
    const body = art.lines.join("\n").trim();
    const rawTitle = art.title;
    const fed = /ФЕДЕРАЛЬН|ФИНАНСОВ|ВОЕНН/i.test(rawTitle);
    const reg = /РЕГИОНАЛЬН/i.test(rawTitle);
    const title = tidy(rawTitle.replace(/^\s*\([^)]*\)\s*/, ""));
    // части «ч. N …» с наказанием
    const parts = [];
    let cur = { n: "", text: [], pen: [] };
    const push = () => { if (cur.text.length || cur.pen.length) parts.push(cur); };
    for (const line of body.split("\n")) {
      const m = line.match(/^\s*ч\.\s*(\d+(?:\.\d+)?)\s+(.*)$/);
      if (m) { push(); cur = { n: m[1], text: [m[2]], pen: [] }; continue; }
      if (/^\s*Примечани/i.test(line)) { push(); cur = { n: "note", text: [], pen: [] }; continue; }
      if (cur.n === "note") {
        // наказание, записанное после примечания (как в ДК 1), относится к самой статье
        if (/^\s*[—–-]\s*(влеч|штраф|наложен|от\s*\$?\d|до\s*\$?\d|\$?\d|лишени|арест|устн|предупрежд|принудит)/i.test(line)) {
          const owner = parts.filter((x) => x.n !== "note").pop();
          if (owner) owner.pen.push(line.replace(PEN, ""));
          else parts.push({ n: "", text: [], pen: [line.replace(PEN, "")] });
        }
        continue;
      }
      // одиночное «—»: дальше идёт список наказаний (как в ДК 32)
      if (/^\s*[—–-]\s*$/.test(line)) { cur.penList = true; continue; }
      if (PEN.test(line)) cur.pen.push(line.replace(PEN, ""));
      else if (cur.penList && line.trim()) cur.pen.push(line.trim());
      else if (line.trim()) cur.text.push(line.trim());
    }
    push();
    const real = parts.filter((p) => p.pen.length);
    const note = (body.match(/Примечани[\s\S]*/i) || [""])[0].trim();
    if (!real.length) {
      // без санкции: запомним — вдруг общее наказание дано ниже («за нарушение … в статьях 6, 6.1, 6.2»)
      noPen.push({ n: art.n, title, full: fullText(body.split("\n").filter((l) => l.trim() && !/^\s*Примечани/i.test(l)), title), fed, reg });
      art = null;
      return;
    }
    // общее наказание для нескольких статей
    real.forEach((p) => {
      const ref = p.pen.join(" ").match(/стать[а-я]*[;:,]?\s*([\d.,;\s]+)/i);
      if (!ref) return;
      const nums = ref[1].split(/[,;\s]+/).map((x) => x.replace(/\.$/, "")).filter(Boolean);
      noPen.filter((x) => nums.includes(x.n)).forEach((x) => {
        out.push({ id: `${code}:${x.n}`, code, key: x.n, base: x.n, title: x.title, text: clip(x.title, 200), full: x.full,
          pen: shortPen(tidy(p.pen.join(" ")).replace(/^за нарушение[^-—–]*[-—–]\s*/i, "")), fed: x.fed, reg: x.reg, note: "" });
      });
    });
    real.forEach((p) => {
      const key = p.n && real.length > 1 ? `${art.n} ч. ${p.n}` : p.n && p.n !== "1" ? `${art.n} ч. ${p.n}` : art.n;
      const own = tidy(p.text.join(" "));
      let name = own && own.length < 220 ? own : title;
      if (/^(Повторн|То же|Те же|Деяни[ея],? предусмотренн|Свыше|Совершенн)/i.test(own) || own.length < 25) name = `${title}: ${own.charAt(0).toLowerCase()}${own.slice(1)}`;
      if (!own) name = title;
      out.push({
        id: `${code}:${key}`,
        code,
        key,
        base: art.n,
        title,
        text: clip(name, 200),
        full: fullText(p.text, title),
        pen: shortPen(tidy(p.pen.join(" ")).replace(/^влеч[её]т\s+/i, "")),
        fed,
        reg,
        note: note.replace(/\(\([^)]*\)\)/g, "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim()
      });
    });
    art = null;
  };
  for (const line of lines) {
    const m = line.match(/^\s*Статья\s+(\d+(?:\.\d+)*)\.?\s*(.*)$/);
    if (m) { flush(); art = { n: m[1], title: m[2], lines: [] }; continue; }
    if (art) art.lines.push(line);
  }
  flush();
  return out;
}

// Какие статьи есть в памятках сайта (js/data.js) — в оверлее показываем только их
function siteKeys() {
  const vm = require("vm");
  const box = { window: {} };
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "data.js"), "utf8"), box);
  const keys = new Set();
  box.window.SA.codes.forEach((code) => {
    code.blocks.forEach((block) => {
      block.items.forEach((item) => {
        const label = String(item[0] || "").trim();
        if (!/^ст\.\s*\d/.test(label)) return;
        // «ст. 4–5», «ст. 6 и 7» → каждая статья отдельно
        const raw = label.replace(/^ст\.\s*/, "");
        const range = raw.match(/^(\d+)\s*[–-]\s*(\d+)$/);
        if (range) for (let n = +range[1]; n <= +range[2]; n += 1) keys.add(`${code.id}:${n}`);
        else raw.split(/\s+и\s+/).forEach((k) => keys.add(`${code.id}:${k.replace(/\s*ч\.\s*\d+$/, "").trim()}`));
      });
    });
  });
  return keys;
}

// Короткие названия статей из памяток сайта: «Телефон в движении», «Мелкое хулиганство»…
function siteShortNames() {
  const vm = require("vm");
  const box = { window: {} };
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "data.js"), "utf8"), box);
  const map = new Map();
  const cut = (t) => {
    let s = String(t || "").split(" — ")[0];
    s = s.split(/[.:]\s/)[0].replace(/[.:]$/, "").trim();
    return s.length > 48 ? s.slice(0, s.lastIndexOf(" ", 46)) + "…" : s;
  };
  box.window.SA.codes.forEach((code) => {
    code.blocks.forEach((block) => {
      block.items.forEach((item) => {
        const label = String(item[0] || "").trim();
        if (!/^ст\.\s*\d/.test(label)) return;
        const key = label.replace(/^ст\.\s*/, "").replace(/\s+/g, " ");
        const short = item.length >= 4 ? cut(item[1]) : cut(item[1]);
        if (short) map.set(`${code.id}:${key}`, short);
      });
    });
  });
  return map;
}
const SHORTS = siteShortNames();
function shortName(a) {
  const own = SHORTS.get(`${a.code}:${a.key}`) || SHORTS.get(`${a.code}:${a.base}`);
  const baseName = SHORTS.get(`${a.code}:${a.base} ч. 1`) || SHORTS.get(`${a.code}:${a.base}`);
  // «Повторно», «Свыше 10 000 $» — допишем, о какой статье речь
  if (own && /^(Повторно|Свыше|То же|Частный|Два и более|Насилие)/i.test(own) && baseName && baseName !== own) return `${baseName.split(/[,(]/)[0].trim()}: ${own.charAt(0).toLowerCase()}${own.slice(1)}`;
  if (own) return own;
  // нет на сайте — первые слова названия статьи до запятой
  const t = a.title.split(/,|\sто есть\s|\sкоторое\s/)[0].trim();
  return t.length > 48 ? t.slice(0, t.lastIndexOf(" ", 46)) + "…" : t;
}

const files = fs.readdirSync(DIR);
const all = [];
for (const [code, re] of CODES) {
  const file = files.find((f) => re.test(f));
  if (!file) { console.warn("нет файла для", code); continue; }
  const onSite = siteKeys();
  const items = parse(code, fs.readFileSync(path.join(DIR, file), "utf8")).filter((a) => onSite.has(`${a.code}:${a.base}`) && !(a.code === "uk" && a.base === "20.1"));
  console.log(code, items.length, "статей/частей");
  const MANUAL = require("./short-names.js");
  items.forEach((a) => { a.short = MANUAL[a.id] || shortName(a); });
  all.push(...items);
}
fs.writeFileSync(path.join(__dirname, "articles.js"), "window.SA_ARTS = " + JSON.stringify(all) + ";\n");
console.log("итого", all.length);

// Законы и правила, скачанные с форума (forum/texts).
// Основные всегда лежат в контексте ИИ, остальные он открывает сам через инструмент.
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "forum", "texts");

// всегда в контексте: то, что нужно на задержании и в споре с адвокатом
const CORE = [
  /Процессуальный кодекс/,
  /Уголовный кодекс/,
  /Административных правонарушениях/,
  /Дорожный кодекс/,
  /адвокатуре/,
  /Полицейском Департаменте/,
  /неприкосновенности/,
  /системе ордеров/
];

function listDocs() {
  let files = [];
  try {
    files = fs.readdirSync(DIR).filter((f) => f.endsWith(".txt")).sort();
  } catch {
    return [];
  }
  return files.map((file) => {
    const title = file.replace(/\.txt$/, "");
    return { title, file, core: CORE.some((re) => re.test(title)) };
  });
}

function readDoc(file) {
  return fs.readFileSync(path.join(DIR, file), "utf8");
}

function buildLaws() {
  const docs = listDocs();
  if (!docs.length) return { core: "Законы не найдены: нет папки forum/texts.", catalog: [], docs };
  const core = docs
    .filter((d) => d.core)
    .map((d) => `=== ${d.title} ===\n${readDoc(d.file)}`)
    .join("\n\n");
  const catalog = docs.filter((d) => !d.core).map((d) => d.title);
  return { core, catalog, docs };
}

function findDoc(docs, name) {
  const q = String(name || "").toLowerCase();
  return (
    docs.find((d) => d.title.toLowerCase() === q) ||
    docs.find((d) => d.title.toLowerCase().includes(q)) ||
    docs.find((d) => q.split(/\s+/).filter((w) => w.length > 3).every((w) => d.title.toLowerCase().includes(w)))
  );
}

module.exports = { buildLaws, findDoc, readDoc };

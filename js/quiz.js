(function () {
  function clip(raw, limit) {
    let text = String(raw || "");
    text = text.replace(/\(\([^)]*\)\)/g, " ");
    text = text.replace(/^\s*\((?:ФЕДЕРАЛЬНЫЙ|РЕГИОНАЛЬНЫЙ|ФИНАНСОВЫЙ|ВОЕННЫЙ)[^)]*\)\s*/i, "");
    text = text.replace(/^\s*-\s*/, "");
    text = text.replace(/\s+/g, " ").trim();
    const penalty = text.search(/\s+(?:влеч[её]т|штраф\b|административн(?:ый|ого)\s+штраф|лишени[ея]\s+свободы|арест\b)\b/i);
    if (penalty > 30) text = text.slice(0, penalty);
    text = text.split(/\s+[—–-]\s*(?=а\)\s*штраф|штраф\b)/i)[0];
    text = text.replace(/[;,:\s—–-]+$/g, "").trim();
    if (text.length > limit) {
      const at = text.lastIndexOf(" ", limit);
      text = text.slice(0, at > 60 ? at : limit).replace(/[,:;]\s*$/, "").trim() + "…";
    }
    return text;
  }

  function articleText(book, key) {
    const own = book[key];
    const part = book[`${key} ч. 1`];
    const ownText = own && String(own.text || "").replace(/\s+/g, " ").trim();
    const ownTitle = own && String(own.title || "").replace(/\s+/g, " ").trim();
    const thin = !ownText || ownText.length < (ownTitle || "").length + 12;
    const source = thin && part && part.text ? part : own;
    if (!source || !source.text) return "";
    return clip(source.text, 170);
  }

  function take(list, count, skipKey) {
    const pool = list.filter((item) => item.key !== skipKey);
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = pool[i];
      pool[i] = pool[j];
      pool[j] = swap;
    }
    return pool.slice(0, count);
  }

  const bank = [];
  ["ak", "dk", "uk"].forEach((code) => {
    const source = window.SA.codes.find((item) => item.id === code);
    const book = window.SA_FULL && window.SA_FULL[code];
    if (!source || !book) return;
    const seen = new Set();
    const articles = [];
    source.blocks.forEach((block) => {
      block.items.forEach((item) => {
        const label = String(item[0] || "");
        if (!/^ст\./i.test(label)) return;
        const key = label.replace(/^ст\.\s*/i, "").replace(/\s+/g, " ").trim();
        if (/[–-]/.test(key) || /\sи\s/.test(key)) return;
        const text = articleText(book, key);
        if (text.length < 24 || seen.has(text)) return;
        seen.add(text);
        articles.push({ key, label: `ст. ${key}`, text });
      });
    });
    if (articles.length < 4) return;
    articles.forEach((article) => {
      const others = take(articles, 3, article.key);
      if (others.length < 3) return;
      const texts = [article.text, ...others.map((item) => item.text)];
      const numbers = [article.label, ...others.map((item) => item.label)];
      bank.push({
        code,
        kind: "num",
        q: article.label,
        options: texts,
        answer: 0,
        why: `${article.label}. ${article.text}`
      });
      bank.push({
        code,
        kind: "text",
        q: article.text,
        options: numbers,
        answer: 0,
        why: `${article.label}. ${article.text}`
      });
    });
  });
  window.SA_QUIZ = bank;
})();

// Рисует icon.png (256px) и icon.ico из icon.svg. Запуск: npx electron make-icon.js
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, "icon.svg"), "utf8");
  const win = new BrowserWindow({ width: 256, height: 256, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
    `<html><body style="margin:0;background:transparent">${svg}</body></html>`
  ));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  const sizes = [256, 64, 48, 32, 16];
  const pngs = sizes.map((s) => (s === 256 ? img : img.resize({ width: s, height: s, quality: "best" })).toPNG());
  fs.writeFileSync(path.join(__dirname, "icon.png"), pngs[0]);

  // ICO с PNG внутри (Windows Vista+ понимает)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  const dir = Buffer.alloc(16 * sizes.length);
  let offset = 6 + dir.length;
  sizes.forEach((s, i) => {
    const b = i * 16;
    dir.writeUInt8(s >= 256 ? 0 : s, b); dir.writeUInt8(s >= 256 ? 0 : s, b + 1);
    dir.writeUInt8(0, b + 2); dir.writeUInt8(0, b + 3);
    dir.writeUInt16LE(1, b + 4); dir.writeUInt16LE(32, b + 6);
    dir.writeUInt32LE(pngs[i].length, b + 8); dir.writeUInt32LE(offset, b + 12);
    offset += pngs[i].length;
  });
  fs.writeFileSync(path.join(__dirname, "icon.ico"), Buffer.concat([header, dir, ...pngs]));
  console.log("icon.png и icon.ico готовы");
  app.quit();
});

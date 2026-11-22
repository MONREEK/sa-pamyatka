const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sa", {
  ask: (q) => ipcRenderer.invoke("ask", q),
  search: (q, catalog) => ipcRenderer.invoke("search", q, catalog),
  copy: (t) => ipcRenderer.invoke("copy", t),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (s) => ipcRenderer.invoke("settings:set", s),
  blur: () => ipcRenderer.invoke("blur"),
  hide: () => ipcRenderer.invoke("hide"),
  getFav: () => ipcRenderer.invoke("fav:get"),
  setFav: (list) => ipcRenderer.invoke("fav:set", list),
  quit:() => ipcRenderer.invoke("quit"),
  onHotkey: (fn) => ipcRenderer.on("hotkey", (_e, action) => fn(action))
});

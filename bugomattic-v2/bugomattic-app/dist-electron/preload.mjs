"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  store: {
    get: (key) => electron.ipcRenderer.invoke("store:get", key),
    set: (key, value) => electron.ipcRenderer.invoke("store:set", key, value),
    delete: (key) => electron.ipcRenderer.invoke("store:delete", key),
    has: (key) => electron.ipcRenderer.invoke("store:has", key)
  }
});

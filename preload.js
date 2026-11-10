const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bee', {
  // Окно
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  openExternal: url => ipcRenderer.send('shell:open-external', url),
  openFolder: target => ipcRenderer.send('shell:open-folder', target),

  // Конфиг
  configGet: () => ipcRenderer.invoke('config:get'),
  configSet: patch => ipcRenderer.invoke('config:set', patch),

  // Моды
  modsSearch: params => ipcRenderer.invoke('mods:search', params),
  modsVersions: id => ipcRenderer.invoke('mods:versions', id),
  modsInstall: ({ projectId, versionId, title, slug, type }) =>
    ipcRenderer.invoke('mods:install', { projectId, versionId, title, slug, type }),
  modsUninstall: id => ipcRenderer.invoke('mods:uninstall', id),
  modsListInstalled: () => ipcRenderer.invoke('mods:list-installed'),

  // Запуск
  launchStart: opts => ipcRenderer.invoke('launch:start', opts),
  launchStop: () => ipcRenderer.invoke('launch:stop'),
  launchIsRunning: () => ipcRenderer.invoke('launch:is-running'),

  // Диалоги
  chooseJava: () => ipcRenderer.invoke('dialog:choose-java'),

  // Инфо
  appInfo: () => ipcRenderer.invoke('app:info'),

  // События
  onLaunchProgress: cb => ipcRenderer.on('launch:progress', (_e, d) => cb(d)),
  onLaunchStatus: cb => ipcRenderer.on('launch:status', (_e, d) => cb(d)),
  onLaunchLog: cb => ipcRenderer.on('launch:log', (_e, d) => cb(d)),
  onLaunchError: cb => ipcRenderer.on('launch:error', (_e, d) => cb(d)),
  onModsDownloadProgress: cb => ipcRenderer.on('mods:download-progress', (_e, d) => cb(d)),
  onModsInstalled: cb => ipcRenderer.on('mods:installed', (_e, d) => cb(d)),
  onModsError: cb => ipcRenderer.on('mods:error', (_e, d) => cb(d)),
  removeListener: (channel, cb) => ipcRenderer.removeListener(channel, cb)
});

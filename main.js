const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MC_VERSION = '1.21.4';
const FABRIC_LOADER = '0.16.9';
const USER_AGENT = 'BeeVisualLauncher/1.0.0 (beevisual.client)';
const MODRINTH_API = 'https://api.modrinth.com/v2';
const VERSIONS_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const FABRIC_META = 'https://meta.fabricmc.net/v2';
const PARALLEL_LIBS = 8;
const PARALLEL_ASSETS = 32;

let mainWindow = null;
let activeProcess = null;

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 1080,
    minHeight: 640,
    frame: false,
    backgroundColor: '#141210',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('maximize', () => send('window:state', true));
  mainWindow.on('unmaximize', () => send('window:state', false));
  mainWindow.on('closed', () => (mainWindow = null));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  Menu.setApplicationMenu(null);
}

function send(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// Window controls
// ---------------------------------------------------------------------------
ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow && mainWindow.close());
ipcMain.handle('window:is-maximized', () => !!mainWindow && mainWindow.isMaximized());
ipcMain.on('shell:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});
ipcMain.on('shell:open-folder', (_e, target) => {
  const dir = target === 'mods' ? paths().mods : paths().game;
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
});

// ---------------------------------------------------------------------------
// Paths and config
// ---------------------------------------------------------------------------
function paths() {
  const root = path.join(app.getPath('appData'), 'BeeVisual');
  const game = path.join(root, 'minecraft');
  return {
    root, game,
    mods: path.join(game, 'mods'),
    versions: path.join(game, 'versions'),
    libraries: path.join(game, 'libraries'),
    assets: path.join(game, 'assets'),
    natives: path.join(game, 'natives'),
    temp: path.join(root, 'temp'),
    config: path.join(root, 'config.json'),
    profiles: path.join(root, 'profiles')
  };
}

function ensureDirs() {
  const p = paths();
  ['root', 'game', 'mods', 'versions', 'libraries', 'assets', 'natives', 'temp', 'profiles']
    .forEach(k => fs.mkdirSync(p[k], { recursive: true }));
}

const DEFAULT_CONFIG = () => ({
  nickname: '', ram: 4096, javaPath: '', installedMods: [], installedPacks: []
});

function readConfig() {
  try {
    return { ...DEFAULT_CONFIG(), ...JSON.parse(fs.readFileSync(paths().config, 'utf8')) };
  } catch {
    return DEFAULT_CONFIG();
  }
}
function writeConfig(cfg) {
  ensureDirs();
  fs.writeFileSync(paths().config, JSON.stringify(cfg, null, 2), 'utf8');
}
ipcMain.handle('config:get', () => readConfig());
ipcMain.handle('config:set', (_e, patch) => {
  const cfg = { ...readConfig(), ...patch };
  writeConfig(cfg);
  return cfg;
});

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function httpGet(url, { json = false, headers = {}, timeout = 30000, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...headers } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('Too many redirects'));
        return resolve(httpGet(new URL(res.headers.location, url).toString(), {
          json, headers, timeout, redirects: redirects - 1
        }));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} — ${url}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (!json) return resolve(buf);
        try { resolve(JSON.parse(buf.toString('utf8'))); }
        catch (err) { reject(err); }
      });
      res.on('error', reject);
    });
    req.setTimeout(timeout, () => req.destroy(new Error('Connection timeout')));
    req.on('error', reject);
  });
}

function download(url, dest, onProgress, { redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('Too many redirects'));
        return resolve(download(new URL(res.headers.location, url).toString(), dest, onProgress,
          { redirects: redirects - 1 }));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} — ${url}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const tmp = `${dest}.${process.pid}.${Date.now()}.part`;
      const out = fs.createWriteStream(tmp);
      res.on('data', chunk => {
        received += chunk.length;
        if (onProgress) onProgress(received, total);
      });
      res.on('error', err => {
        out.destroy();
        try { fs.unlinkSync(tmp); } catch (_) {}
        reject(err);
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => {
        try { fs.renameSync(tmp, dest); resolve(dest); }
        catch (err) { reject(err); }
      }));
      out.on('error', err => {
        try { fs.unlinkSync(tmp); } catch (_) {}
        reject(err);
      });
    });
    req.setTimeout(60000, () => req.destroy(new Error('Download timeout')));
    req.on('error', reject);
  });
}

function needsDownload(dest, expectedSize) {
  try {
    const st = fs.statSync(dest);
    return !st.isFile() || st.size === 0 ||
      (typeof expectedSize === 'number' && expectedSize > 0 && st.size !== expectedSize);
  } catch { return true; }
}

async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next], next++);
  });
  await Promise.all(runners);
}

function makeProgress(totalSteps, label) {
  let step = 0;
  return (subLabel, fraction = 0) => {
    const pct = Math.min(99, Math.round(((step + fraction) / totalSteps) * 100));
    send('launch:progress', { pct, label: subLabel || label });
  };
}

// ---------------------------------------------------------------------------
// Mojang version, libraries and assets
// ---------------------------------------------------------------------------
async function getVersionManifest() {
  return httpGet(VERSIONS_MANIFEST, { json: true });
}
async function getVersionJson(versionId = MC_VERSION) {
  const manifest = await getVersionManifest();
  const entry = manifest.versions.find(v => v.id === versionId);
  if (!entry) throw new Error(`Minecraft version ${versionId} not found`);
  return httpGet(entry.url, { json: true });
}

function ruleAllows(rules) {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    if (rule.os?.name && rule.os.name !== 'windows') continue;
    if (rule.os?.arch && !['x64', 'x86_64'].includes(rule.os.arch)) continue;
    allowed = rule.action === 'allow';
  }
  return allowed;
}

function mavenPath(name) {
  const [coords, ext] = name.split('@');
  const [group, artifact, version, classifier] = coords.split(':');
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? `-${classifier}` : ''}.${ext || 'jar'}`;
}
function libArtifactPath(lib) {
  return lib.downloads?.artifact?.path || mavenPath(lib.name);
}
function libUrl(lib) {
  if (lib.downloads?.artifact?.url) return lib.downloads.artifact.url;
  return `${(lib.url || 'https://libraries.minecraft.net/').replace(/\/?$/, '/')}${libArtifactPath(lib)}`;
}
function nativeClassifiers() {
  if (process.platform === 'win32') return ['natives-windows'];
  if (process.platform === 'darwin') return ['natives-macos', 'natives-osx'];
  return ['natives-linux'];
}

async function ensureLibraries(versionJson, progress) {
  const p = paths();
  const tasks = [];
  const natives = [];
  for (const lib of (versionJson.libraries || []).filter(l => ruleAllows(l.rules))) {
    const artifact = lib.downloads?.artifact;
    if (artifact?.url || lib.name) {
      tasks.push({ url: libUrl(lib), dest: path.join(p.libraries, libArtifactPath(lib)), size: artifact?.size });
    }
    for (const classifier of nativeClassifiers()) {
      const native = lib.downloads?.classifiers?.[classifier];
      if (native?.path && native.url) {
        tasks.push({ url: native.url, dest: path.join(p.libraries, native.path), size: native.size });
        natives.push({ zip: path.join(p.libraries, native.path), exclude: lib.extract?.exclude || [] });
      }
    }
  }
  let done = 0;
  await runPool(tasks, PARALLEL_LIBS, async task => {
    if (needsDownload(task.dest, task.size)) await download(task.url, task.dest);
    done++;
    progress(`Библиотеки ${done}/${tasks.length}`, done / Math.max(1, tasks.length));
  });

  fs.mkdirSync(p.natives, { recursive: true });
  for (const native of natives) {
    if (!fs.existsSync(native.zip)) continue;
    try {
      for (const entry of new AdmZip(native.zip).getEntries()) {
        if (entry.isDirectory || native.exclude.some(ex => entry.entryName.startsWith(ex))) continue;
        const basename = path.basename(entry.entryName);
        if (basename) new AdmZip(native.zip).extractEntryTo(entry, p.natives, false, true);
      }
    } catch (_) {}
  }
}

async function ensureClientJar(versionJson, progress) {
  const p = paths();
  const client = versionJson.downloads.client;
  const dest = path.join(p.versions, versionJson.id, `${versionJson.id}.jar`);
  if (needsDownload(dest, client.size)) {
    await download(client.url, dest, (received, total) => progress('Клиент Minecraft', total ? received / total : 0));
  }
  const jsonDest = path.join(p.versions, versionJson.id, `${versionJson.id}.json`);
  if (!fs.existsSync(jsonDest)) fs.writeFileSync(jsonDest, JSON.stringify(versionJson, null, 2), 'utf8');
  return dest;
}

async function ensureAssets(versionJson, progress) {
  const p = paths();
  const indexInfo = versionJson.assetIndex;
  const indexPath = path.join(p.assets, 'indexes', `${indexInfo.id}.json`);
  if (needsDownload(indexPath, indexInfo.size)) await download(indexInfo.url, indexPath);
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const objects = Object.values(index.objects || {});
  let done = 0;
  await runPool(objects, PARALLEL_ASSETS, async obj => {
    const prefix = obj.hash.slice(0, 2);
    const dest = path.join(p.assets, 'objects', prefix, obj.hash);
    if (needsDownload(dest, obj.size)) {
      await download(`https://resources.download.minecraft.net/${prefix}/${obj.hash}`, dest);
    }
    done++;
    if (done % 50 === 0 || done === objects.length) {
      progress(`Ресурсы ${done}/${objects.length}`, done / Math.max(1, objects.length));
    }
  });
}

async function ensureJava(progress) {
  const cfg = readConfig();
  if (cfg.javaPath && fs.existsSync(cfg.javaPath)) return cfg.javaPath;
  const candidates = [
    path.join(app.getPath('userData'), 'jre', 'bin', 'java.exe'),
    'C:\\Program Files\\Java\\jdk-21\\bin\\java.exe',
    'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe',
    'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.4.7-hotspot\\bin\\java.exe'
  ];
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  const dir = path.join(app.getPath('userData'), 'jre');
  const found = findJavaIn(dir);
  if (found) return found;

  fs.mkdirSync(dir, { recursive: true });
  progress('Скачивание Java 21', 0.05);
  const api = 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse';
  const list = await httpGet(api, { json: true });
  const pkg = list?.[0]?.binary?.package;
  if (!pkg?.link) throw new Error('Не удалось найти сборку Java 21');
  const zip = path.join(dir, 'jre.zip');
  await download(pkg.link, zip, (received, total) => progress('Скачивание Java 21', total ? received / total : 0));
  new AdmZip(zip).extractAllTo(dir, true);
  try { fs.unlinkSync(zip); } catch (_) {}
  const java = findJavaIn(dir);
  if (!java) throw new Error('Java не распаковалась корректно');
  progress('Java готова', 1);
  return java;
}
function findJavaIn(dir) {
  const direct = path.join(dir, 'bin', 'java.exe');
  if (fs.existsSync(direct)) return direct;
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return null; }
  for (const name of entries) {
    const full = path.join(dir, name);
    try { if (!fs.statSync(full).isDirectory()) continue; } catch { continue; }
    const candidate = path.join(full, 'bin', 'java.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fabric
// ---------------------------------------------------------------------------
async function ensureFabric(progress, mcVersion = MC_VERSION) {
  const p = paths();
  const name = `fabric-loader-${FABRIC_LOADER}-${mcVersion}`;
  const dir = path.join(p.versions, name);
  const jsonPath = path.join(dir, `${name}.json`);
  if (!fs.existsSync(jsonPath)) {
    progress('Fabric loader', 0.1);
    const profile = await httpGet(`${FABRIC_META}/versions/loader/${mcVersion}/${FABRIC_LOADER}/profile/json`, { json: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(profile, null, 2), 'utf8');
  }
  return { dir, json: jsonPath, name };
}

// ---------------------------------------------------------------------------
// Modrinth
// ---------------------------------------------------------------------------
ipcMain.handle('mods:search', async (_e, { query = '', offset = 0, limit = 20, category = '' } = {}) => {
  const facets = [['project_type:mod'], [`versions:${MC_VERSION}`], ['categories:fabric']];
  if (category) facets.push([`categories:${category}`]);
  const params = new URLSearchParams({ query, limit: String(limit), offset: String(offset), facets: JSON.stringify(facets), index: 'relevance' });
  const data = await httpGet(`${MODRINTH_API}/search?${params}`, { json: true });
  const cfg = readConfig();
  const p = paths();
  const installed = new Set((cfg.installedMods || [])
    .filter(m => m.fileName && fs.existsSync(path.join(p.mods, m.fileName)))
    .map(m => m.projectId));
  return {
    total: data.total_hits,
    hits: data.hits.map(h => ({
      id: h.project_id, slug: h.slug, title: h.title, description: h.description,
      icon: h.icon_url, downloads: h.downloads, categories: h.categories,
      installed: installed.has(h.project_id)
    }))
  };
});

ipcMain.handle('mods:versions', async (_e, projectId) => {
  const params = new URLSearchParams({ loaders: JSON.stringify(['fabric']), game_versions: JSON.stringify([MC_VERSION]) });
  const list = await httpGet(`${MODRINTH_API}/project/${projectId}/version?${params}`, { json: true });
  return list.map(v => ({
    id: v.id, name: v.name, versionNumber: v.version_number, date: v.date_published,
    channel: v.version_type, downloads: v.downloads, dependencies: v.dependencies || []
  }));
});

async function modFileForVersion(versionId) {
  const version = await httpGet(`${MODRINTH_API}/version/${versionId}`, { json: true });
  const file = version.files.find(f => f.primary) || version.files[0];
  if (!file) throw new Error('У версии нет файлов');
  return { version, file };
}

ipcMain.handle('mods:install', async (_e, { projectId, versionId, title, slug, type = 'mod' }) => {
  try {
    const { version, file } = await modFileForVersion(versionId);
    const p = paths();
    ensureDirs();
    await download(file.url, path.join(p.mods, file.filename), (received, total) => {
      send('mods:download-progress', { projectId, fileName: file.filename, pct: total ? Math.round(received / total * 100) : 0 });
    });
    const dependencies = (version.dependencies || []).filter(d => d.dependency_type === 'required' && d.project_id);
    const installedDeps = [];
    for (const dependency of dependencies) {
      try {
        const q = new URLSearchParams({ loaders: JSON.stringify(['fabric']), game_versions: JSON.stringify([MC_VERSION]) });
        const versions = await httpGet(`${MODRINTH_API}/project/${dependency.project_id}/version?${q}`, { json: true });
        if (!versions.length) continue;
        const depVersion = versions[0];
        const depFile = depVersion.files.find(f => f.primary) || depVersion.files[0];
        if (!depFile) continue;
        if (!fs.existsSync(path.join(p.mods, depFile.filename))) await download(depFile.url, path.join(p.mods, depFile.filename));
        installedDeps.push({ projectId: dependency.project_id, versionId: depVersion.id, slug: '', title: dependency.project_id, fileName: depFile.filename, type: 'dep' });
      } catch (_) {}
    }
    const cfg = readConfig();
    cfg.installedMods = (cfg.installedMods || []).filter(m => m.projectId !== projectId && m.fileName !== file.filename);
    cfg.installedMods.push({ projectId, versionId, slug, title, fileName: file.filename, type });
    for (const dep of installedDeps) if (!cfg.installedMods.some(m => m.fileName === dep.fileName)) cfg.installedMods.push(dep);
    writeConfig(cfg);
    send('mods:installed', { projectId, title, fileName: file.filename });
    return { ok: true, fileName: file.filename, deps: installedDeps.map(d => d.fileName) };
  } catch (err) {
    send('mods:error', { projectId, message: err.message });
    throw err;
  }
});

ipcMain.handle('mods:uninstall', async (_e, projectId) => {
  const cfg = readConfig();
  const p = paths();
  const removed = (cfg.installedMods || []).filter(m => m.projectId === projectId);
  cfg.installedMods = (cfg.installedMods || []).filter(m => m.projectId !== projectId);
  cfg.installedPacks = (cfg.installedPacks || []).filter(m => m.projectId !== projectId);
  writeConfig(cfg);
  const failed = [];
  for (const mod of removed) {
    if (!mod.fileName) continue;
    try { fs.unlinkSync(path.join(p.mods, mod.fileName)); }
    catch (err) { if (err.code !== 'ENOENT') failed.push(mod.fileName); }
  }
  if (failed.length) {
    cfg.pendingDelete = Array.from(new Set([...(cfg.pendingDelete || []), ...failed]));
    writeConfig(cfg);
    setTimeout(flushPendingDelete, 1500);
  }
  return { mods: cfg.installedMods, remainingFiles: failed };
});

function flushPendingDelete() {
  const cfg = readConfig();
  const p = paths();
  const left = [];
  for (const fileName of cfg.pendingDelete || []) {
    try { fs.unlinkSync(path.join(p.mods, fileName)); }
    catch (err) { if (err.code !== 'ENOENT') left.push(fileName); }
  }
  cfg.pendingDelete = left;
  writeConfig(cfg);
}

ipcMain.handle('mods:list-installed', async () => {
  const cfg = readConfig();
  const p = paths();
  const alive = (cfg.installedMods || []).filter(m => m.fileName && fs.existsSync(path.join(p.mods, m.fileName)));
  if (alive.length !== cfg.installedMods.length) {
    cfg.installedMods = alive;
    writeConfig(cfg);
  }
  return alive;
});

// ---------------------------------------------------------------------------
// Launch Minecraft
// ---------------------------------------------------------------------------
function libraryIdentity(lib) {
  const coordinates = String(lib.name || '').split('@')[0];
  const parts = coordinates.split(':');
  // Omit version so different versions of the same Maven artifact match.
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}:${parts[3] || ''}` : coordinates;
}

function buildClasspath(vanillaLibs, fabricLibs, libraryRoot) {
  const selected = new Map();
  // Keep the vanilla version unless Fabric explicitly supplies the same artifact.
  for (const lib of vanillaLibs) selected.set(libraryIdentity(lib), lib);
  for (const lib of fabricLibs) selected.set(libraryIdentity(lib), lib);

  const entries = [];
  const seenPaths = new Set();
  for (const lib of selected.values()) {
    const rel = libArtifactPath(lib);
    if (seenPaths.has(rel)) continue;
    seenPaths.add(rel);
    entries.push(path.join(libraryRoot, rel));
  }
  return entries;
}

ipcMain.handle('launch:start', async (_e, opts = {}) => {
  const cfg = readConfig();
  try {
    ensureDirs();
    flushPendingDelete();
    const progress = makeProgress(8, 'Подготовка');
    progress('Проверка версии');
    const versionJson = await getVersionJson(MC_VERSION);
    const javaPath = opts.javaPath || cfg.javaPath || await ensureJava(x => progress(x, 0.5));

    progress('Клиент Minecraft');
    const clientJar = await ensureClientJar(versionJson, (label, fraction) => progress(label, fraction));
    await ensureLibraries(versionJson, (label, fraction) => progress(label, fraction));
    await ensureAssets(versionJson, (label, fraction) => progress(label, fraction));

    const fabric = await ensureFabric((label, fraction) => progress(label, fraction));
    const fab = JSON.parse(fs.readFileSync(fabric.json, 'utf8'));
    const fabLibs = (fab.libraries || []).filter(lib => ruleAllows(lib.rules));
    let fabricDone = 0;
    await runPool(fabLibs, PARALLEL_LIBS, async lib => {
      const artifact = lib.downloads?.artifact;
      const dest = path.join(paths().libraries, libArtifactPath(lib));
      if (needsDownload(dest, artifact?.size)) await download(libUrl(lib), dest);
      fabricDone++;
      progress(`Fabric библиотеки ${fabricDone}/${fabLibs.length}`, fabricDone / Math.max(1, fabLibs.length));
    });

    progress('Формирование командной строки');
    const nickname = (opts.nickname || cfg.nickname || 'Player').trim() || 'Player';
    const ram = Math.max(1024, parseInt(opts.ram || cfg.ram, 10) || 4096);
    const uuid = offlineUuid(nickname);
    const gameDir = paths().game;
    const nativesDir = paths().natives;
    fs.mkdirSync(nativesDir, { recursive: true });

    const vanillaLibs = (versionJson.libraries || []).filter(lib => ruleAllows(lib.rules));
    const cp = [clientJar, ...buildClasspath(vanillaLibs, fabLibs, paths().libraries)];
    const args = [
      `-Xmx${ram}M`, '-Xms512M', '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200', '-XX:+UnlockExperimentalVMOptions', '-XX:+DisableExplicitGC',
      '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=8M',
      '-XX:G1ReservePercent=20', `-Djava.library.path=${nativesDir}`,
      '-Dminecraft.launcher.brand=BeeVisual', '-Dminecraft.launcher.version=1.0.0',
      '-cp', cp.join(';'), fab.mainClass,
      '--username', nickname, '--version', fabric.name, '--gameDir', gameDir,
      '--assetsDir', paths().assets, '--assetIndex', versionJson.assetIndex.id,
      '--uuid', uuid, '--accessToken', '0', '--clientId', 'beevisual-1.0',
      '--xuid', '0', '--userType', 'legacy', '--versionType', 'BeeVisual'
    ];

    progress('Запуск', 1);
    send('launch:status', { state: 'starting', javaPath, nickname });
    const child = spawn(javaPath, args, { cwd: gameDir, windowsHide: false });
    activeProcess = child;
    child.stdout.on('data', data => send('launch:log', { stream: 'out', text: data.toString() }));
    child.stderr.on('data', data => send('launch:log', { stream: 'err', text: data.toString() }));
    child.on('error', err => {
      activeProcess = null;
      send('launch:error', { message: err.message });
      send('launch:status', { state: 'error', message: err.message });
    });
    child.on('close', code => {
      activeProcess = null;
      send('launch:status', { state: 'exited', code });
    });
    send('launch:status', { state: 'running' });
    return { ok: true, pid: child.pid };
  } catch (err) {
    send('launch:error', { message: err.message });
    send('launch:status', { state: 'error', message: err.message });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('launch:stop', () => {
  if (!activeProcess || activeProcess.killed) return false;
  try { activeProcess.kill(); } catch (_) {}
  activeProcess = null;
  return true;
});
ipcMain.handle('launch:is-running', () => !!activeProcess && !activeProcess.killed);

function offlineUuid(name) {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

ipcMain.handle('app:info', () => ({
  version: app.getVersion(), platform: process.platform, paths: paths(),
  mcVersion: MC_VERSION, fabricLoader: FABRIC_LOADER,
  totalRam: Math.round(os.totalmem() / 1024 / 1024),
  freeRam: Math.round(os.freemem() / 1024 / 1024)
}));
ipcMain.handle('dialog:choose-java', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите java.exe', properties: ['openFile'],
    filters: [{ name: 'Java', extensions: ['exe'] }]
  });
  return result.canceled ? '' : result.filePaths[0];
});
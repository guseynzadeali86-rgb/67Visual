const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const toast = (text, error = false) => {
  const el = document.createElement('div');
  el.className = `toast${error ? ' err' : ''}`;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
};

// Управление окном
$('#btn-min').onclick = () => window.bee.minimize();
$('#btn-max').onclick = () => window.bee.toggleMaximize();
$('#btn-close').onclick = () => window.bee.close();

// Навигация
$$('.nav-item').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav-item').forEach(x => x.classList.toggle('active', x === btn));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${btn.dataset.page}`));
  if (btn.dataset.page === 'mods') loadInstalled();
}));

let config = {};
let searchOffset = 0;
let searchTimer = null;
let launchState = 'idle';

async function init() {
  try {
    config = await window.bee.configGet();
    $('#nick-input').value = config.nickname || '';
    $('#profile-nick').textContent = config.nickname || 'Steve_Bee';
    $('#ram-select').value = String(config.ram || 4096);
    $('#settings-ram').value = String(config.ram || 4096);
    if (config.javaPath) $('#java-path-text').textContent = config.javaPath;
    const info = await window.bee.appInfo();
    $('#game-path-text').textContent = info.paths.game;
    await loadInstalled();
  } catch (e) {
    toast(`Ошибка инициализации: ${e.message}`, true);
  }
}
init();

$('#nick-input').addEventListener('change', async e => {
  const nickname = e.target.value.trim();
  await window.bee.configSet({ nickname });
  $('#profile-nick').textContent = nickname || 'Steve_Bee';
});
$('#ram-select').addEventListener('change', async e => {
  $('#settings-ram').value = e.target.value;
  await window.bee.configSet({ ram: Number(e.target.value) });
});
$('#settings-ram').addEventListener('change', async e => {
  $('#ram-select').value = e.target.value;
  await window.bee.configSet({ ram: Number(e.target.value) });
});

// Запуск игры: не показываем «запущен», пока Java-процесс реально не стартовал.
$('#play-btn').addEventListener('click', async () => {
  if (launchState === 'starting' || launchState === 'running') return;
  const nickname = $('#nick-input').value.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nickname)) {
    toast('Введите ник из 3–16 латинских букв, цифр или _', true);
    return;
  }
  const ram = Number($('#ram-select').value) || 4096;
  await window.bee.configSet({ nickname, ram });
  launchState = 'starting';
  $('#play-btn').disabled = true;
  $('#play-label').textContent = 'ЗАПУСК…';
  $('#launch-bar').hidden = false;
  $('#launch-fill').style.width = '2%';
  $('#launch-label').textContent = 'Подготовка…';
  try {
    const result = await window.bee.launchStart({ nickname, ram });
    if (!result || !result.ok) resetLaunch(result?.error || 'Не удалось запустить игру');
  } catch (e) {
    resetLaunch(e.message);
  }
});
function resetLaunch(message) {
  launchState = 'idle';
  $('#play-btn').disabled = false;
  $('#play-label').textContent = 'ЗАПУСТИТЬ';
  $('#launch-label').textContent = message;
}
window.bee.onLaunchProgress(d => {
  $('#launch-fill').style.width = `${Math.max(2, d.pct || 0)}%`;
  $('#launch-label').textContent = d.label || 'Подготовка…';
});
window.bee.onLaunchStatus(d => {
  if (d.state === 'starting') {
    launchState = 'starting';
    $('#launch-label').textContent = 'Запускаем Java…';
  } else if (d.state === 'running') {
    // Состояние будет подтверждено по событию spawn; старый main.js может прислать
    // running сразу после spawn(), поэтому оставляем диагностическую формулировку.
    launchState = 'running';
    $('#launch-fill').style.width = '100%';
    $('#launch-label').textContent = 'Процесс Java запущен — ожидаем окно Minecraft…';
    $('#play-label').textContent = 'ИГРА ЗАПУЩЕНА';
  } else if (d.state === 'exited') {
    launchState = 'idle';
    $('#play-btn').disabled = false;
    $('#play-label').textContent = 'ЗАПУСТИТЬ';
    $('#launch-label').textContent = d.code === 0 ? 'Игра закрыта' : `Minecraft завершился с кодом ${d.code}`;
    setTimeout(() => { $('#launch-bar').hidden = true; }, 6000);
  } else if (d.state === 'error') {
    resetLaunch(d.message || 'Ошибка запуска');
  }
});
window.bee.onLaunchError(d => {
  toast(`Ошибка запуска: ${d.message}`, true);
  resetLaunch(d.message || 'Ошибка запуска');
});
window.bee.onLaunchLog(d => {
  const box = $('#log-box');
  const line = document.createElement('div');
  line.textContent = d.text;
  if (d.stream === 'err') line.style.color = '#FF887F';
  box.append(line);
  box.scrollTop = box.scrollHeight;
});

// Поиск/каталог Modrinth
function fmtDownloads(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} тыс.`;
  return String(n || 0);
}
function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function modCard(m) {
  const icon = m.icon
    ? `<img class="mod-icon" src="${esc(m.icon)}" alt="" onerror="this.style.visibility='hidden'">`
    : '<div class="mod-icon"></div>';
  return `<article class="mod-card" data-project="${esc(m.id)}">
    <div class="mod-top">${icon}<div><div class="mod-title">${esc(m.title)}</div><div class="mod-dl">↓ ${fmtDownloads(m.downloads)} загрузок</div></div></div>
    <p class="mod-desc">${esc(m.description)}</p>
    <div class="mod-actions">
      <button class="install-btn${m.installed ? ' installed' : ''}" data-install="${esc(m.id)}" data-slug="${esc(m.slug)}" data-title="${esc(m.title)}" ${m.installed ? 'disabled' : ''}>${m.installed ? 'Установлен' : 'Установить'}</button>
      <button class="ghost-btn" data-project-open="${esc(m.slug)}">Modrinth</button>
    </div>
  </article>`;
}
async function searchMods(reset = true) {
  const grid = $('#mod-grid');
  const query = $('#mod-search-input').value.trim();
  if (reset) {
    searchOffset = 0;
    grid.innerHTML = '<div class="empty-state">Ищем моды…</div>';
  }
  try {
    const result = await window.bee.modsSearch({
      query, offset: searchOffset, limit: 24, category: $('#mod-category').value
    });
    if (reset) grid.innerHTML = '';
    if (!result.hits.length && reset) {
      grid.innerHTML = '<div class="empty-state">Ничего не найдено. Попробуйте другой запрос.</div>';
    } else {
      grid.insertAdjacentHTML('beforeend', result.hits.map(modCard).join(''));
    }
    searchOffset += result.hits.length;
    $('#load-more').hidden = searchOffset >= result.total || result.hits.length === 0;
  } catch (e) {
    grid.innerHTML = `<div class="empty-state">Не удалось загрузить каталог: ${esc(e.message)}<br>Проверьте подключение к интернету.</div>`;
  }
}
$('#mod-search-input').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchMods(), 350);
});
$('#mod-category').addEventListener('change', () => searchMods());
$('#load-more').addEventListener('click', () => searchMods(false));

$('#mod-grid').addEventListener('click', async e => {
  const open = e.target.closest('[data-project-open]');
  if (open) {
    window.bee.openExternal(`https://modrinth.com/mod/${encodeURIComponent(open.dataset.projectOpen)}`);
    return;
  }
  const btn = e.target.closest('[data-install]');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.textContent = 'Загрузка…';
  try {
    const versions = await window.bee.modsVersions(btn.dataset.install);
    if (!versions.length) throw new Error('Нет версии для Minecraft 1.21.4 и Fabric');
    const result = await window.bee.modsInstall({
      projectId: btn.dataset.install,
      versionId: versions[0].id,
      title: btn.dataset.title,
      slug: btn.dataset.slug,
      type: 'mod'
    });
    btn.textContent = 'Установлен';
    btn.classList.add('installed');
    toast(`Установлен: ${btn.dataset.title}${result.deps?.length ? ` + ${result.deps.length} зависимостей` : ''}`);
    await loadInstalled();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Установить';
    toast(`Ошибка установки: ${err.message}`, true);
  }
});

// Вкладки каталога/установленных
$$('[data-mods-tab]').forEach(btn => btn.addEventListener('click', async () => {
  $$('[data-mods-tab]').forEach(x => x.classList.toggle('active', x === btn));
  const installed = btn.dataset.modsTab === 'installed';
  $('#mods-catalog').hidden = installed;
  $('#mods-installed').hidden = !installed;
  if (installed) await loadInstalled();
  else if (!$('#mod-grid').children.length) searchMods();
}));

async function loadInstalled() {
  try {
    const mods = await window.bee.modsListInstalled();
    $('#installed-count').textContent = mods.length;
    const list = $('#installed-list');
    if (!mods.length) {
      list.innerHTML = '<div class="empty-state">Пока нет установленных модов. Откройте каталог и выберите нужные.</div>';
      return;
    }
    list.innerHTML = mods.map(m => `<div class="inst-row">
      <div><div class="file">${esc(m.title || m.fileName)}</div><div class="sub">${esc(m.fileName)} · ${esc(m.projectId)}</div></div>
      <span class="spacer"></span><button class="remove-btn" data-remove="${esc(m.projectId)}">Удалить</button>
    </div>`).join('');
  } catch (e) {
    toast(`Ошибка списка модов: ${e.message}`, true);
  }
}

// Делегированный обработчик удаления: список перерисовывается из main process,
// карточка каталога сразу возвращается в состояние «Установить».
$('#installed-list').addEventListener('click', async e => {
  const btn = e.target.closest('[data-remove]');
  if (!btn) return;
  const projectId = btn.dataset.remove;
  btn.disabled = true;
  btn.textContent = 'Удаление…';
  try {
    const result = await window.bee.modsUninstall(projectId);
    await loadInstalled();
    const catalogBtn = $(`#mod-grid [data-install="${CSS.escape(projectId)}"]`);
    if (catalogBtn) {
      catalogBtn.disabled = false;
      catalogBtn.classList.remove('installed');
      catalogBtn.textContent = 'Установить';
    }
    if (result?.remainingFiles?.length) {
      toast(`Запись удалена, но файл занят: ${result.remainingFiles.join(', ')}. Закройте Minecraft и повторите.`, true);
    } else {
      toast('Мод удалён');
    }
    // Повторный запрос обновляет отметки каталога по реальному состоянию на диске.
    if (!$('#mods-catalog').hidden) await searchMods();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Удалить';
    toast(`Не удалось удалить мод: ${err.message}`, true);
  }
});
window.bee.onModsInstalled(() => loadInstalled());
window.bee.onModsError(d => toast(d.message, true));

$('#open-mods-folder').onclick = () => window.bee.openFolder('mods');
$('#open-game-folder').onclick = () => window.bee.openFolder('game');
$('#pick-java').onclick = async () => {
  const javaPath = await window.bee.chooseJava();
  if (!javaPath) return;
  await window.bee.configSet({ javaPath });
  $('#java-path-text').textContent = javaPath;
  toast('Путь к Java сохранён');
};
$('#toggle-log').onclick = () => {
  const box = $('#log-box');
  box.hidden = !box.hidden;
  $('#toggle-log').textContent = box.hidden ? 'Показать' : 'Скрыть';
};

// При первом открытии каталога загружаем популярные моды, без необходимости
// вручную запускать поиск.
let catalogLoaded = false;
$$('.nav-item').filter(btn => btn.dataset.page === 'mods').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!catalogLoaded) {
      catalogLoaded = true;
      searchMods();
    }
  });
});

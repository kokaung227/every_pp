// Every PP — file-explorer style browser
const API_BASE = 'https://exampastpaper.kok775082.workers.dev';

// Keep this in sync with MAX_FILES_PER_BATCH in worker.js.
// A "file" means one QP or one MS Telegram document.
const MAX_FILES_PER_BATCH = 10;

const tg = window.Telegram?.WebApp || null;
try {
  tg?.ready();
  tg?.expand();
  tg?.setHeaderColor('#f4f7fb');
  tg?.setBackgroundColor('#f4f7fb');
} catch (error) {
  console.warn('Telegram WebApp setup:', error);
}

const tgReady = Boolean(tg?.initData);
const $ = id => document.getElementById(id);
const firstName = tg?.initDataUnsafe?.user?.first_name || 'there';
$('welcome-name').textContent = firstName;
$('user-chip').textContent = (firstName[0] || 'E').toUpperCase();

const started = Date.now();
async function hideWelcome() {
  const wait = Math.max(0, 500 - (Date.now() - started));
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  $('welcome-screen').classList.add('is-hidden');
}

let tree = null;
let path = [];
let selected = new Map(); // JSON path -> { parts, detail }
let mode = 'library';
let sending = false;
let currentVisible = [];
let limitWarningText = '';
let previousTypeOptions = { qp: $('type-qp').checked, ms: $('type-ms').checked };

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const pathKey = parts => JSON.stringify(parts);
const isPaper = value => value && typeof value === 'object' &&
  ('has_qp' in value || 'has_ms' in value);

function getNode(parts = path) {
  let node = tree;
  for (const part of parts) {
    if (!node || !Object.prototype.hasOwnProperty.call(node, part)) return {};
    node = node[part];
  }
  return node || {};
}
function paperCount(node) {
  if (!node || typeof node !== 'object') return 0;
  if (isPaper(node)) return 1;
  return Object.values(node).reduce((total, child) => total + paperCount(child), 0);
}
function setStatus(message, kind = '') {
  const el = $('status');
  el.className = `status${kind ? ` ${kind}` : ''}`;
  el.textContent = message;
}
function folderIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
}
function fileIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v6h5M9 14h7M9 17h5"/></svg>';
}
function sortEntries(entries, depth = path.length) {
  return entries.sort((a, b) => {
    if (depth === 3) return String(b[0]).localeCompare(String(a[0]), undefined, { numeric: true });
    return String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true, sensitivity: 'base' });
  });
}
function allPaperEntries(node = tree, parts = [], output = []) {
  for (const [name, child] of Object.entries(node || {})) {
    const next = parts.concat(name);
    if (isPaper(child)) output.push({ parts: next, detail: child });
    else allPaperEntries(child, next, output);
  }
  return output;
}
function renderBreadcrumbs() {
  const crumbs = [{ label: 'My Drive', depth: 0 }]
    .concat(path.map((label, index) => ({ label, depth: index + 1 })));
  $('breadcrumbs').innerHTML = crumbs.map((crumb, index) =>
    `${index ? '<span class="crumb-sep">›</span>' : ''}<button class="crumb ${index === crumbs.length - 1 ? 'current' : ''}" data-depth="${crumb.depth}">${esc(crumb.label)}</button>`
  ).join('');
  $('breadcrumbs').querySelectorAll('[data-depth]').forEach(button => {
    button.addEventListener('click', () => {
      path = path.slice(0, Number(button.dataset.depth));
      mode = 'library';
      render();
    });
  });
  $('back-btn').disabled = path.length === 0 || mode === 'selected';
}
function availability(detail) {
  return `${detail.has_qp ? '<span class="type-dot">QP</span>' : ''}${detail.has_ms ? '<span class="type-dot ms">MS</span>' : ''}`;
}
function fileRow(item, selectedView = false) {
  const { parts, detail } = item;
  const key = pathKey(parts);
  const name = parts[parts.length - 1];
  const checked = selected.has(key);
  const location = parts.slice(0, -1).join(' / ');
  return `<div class="file-row ${checked ? 'selected' : ''}">
    <input class="file-check" type="checkbox" data-paper-key="${esc(key)}" ${checked ? 'checked' : ''} aria-label="Select ${esc(name)}">
    <span class="file-icon">${fileIcon()}</span>
    <span class="file-copy"><span class="file-name">${esc(name)}</span><span class="file-meta">${esc(location)}</span></span>
    <span class="availability">${availability(detail)}</span>
    ${selectedView ? `<button class="row-remove" data-remove="${esc(key)}" aria-label="Remove ${esc(name)}">×</button>` : ''}
  </div>`;
}
function folderRow(name, child) {
  const count = paperCount(child);
  return `<button class="folder" data-folder="${esc(name)}">
    <span class="folder-icon">${folderIcon()}</span>
    <span class="folder-copy"><span class="folder-name">${esc(name)}</span>
    <span class="folder-meta">${count.toLocaleString()} ${count === 1 ? 'paper' : 'papers'}</span></span>
    <span class="folder-arrow">›</span>
  </button>`;
}
function bindRows() {
  $('items').querySelectorAll('[data-folder]').forEach(button => {
    button.addEventListener('click', () => {
      path.push(button.dataset.folder);
      mode = 'library';
      $('search').value = '';
      render();
    });
  });
  $('items').querySelectorAll('[data-open-path]').forEach(button => {
    button.addEventListener('click', () => {
      path = JSON.parse(button.dataset.openPath);
      mode = 'library';
      $('search').value = '';
      render();
    });
  });
  $('items').querySelectorAll('[data-paper-key]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.paperKey;
      if (input.checked) {
        const item = allPaperEntries().find(entry => pathKey(entry.parts) === key);
        if (item && !trySelectPaper(item)) {
          input.checked = false;
          updateLimitWarning();
          return;
        }
      } else {
        selected.delete(key);
        limitWarningText = '';
      }
      render();
    });
  });
  $('items').querySelectorAll('[data-remove]').forEach(button => {
    button.addEventListener('click', () => {
      selected.delete(button.dataset.remove);
      limitWarningText = '';
      render();
    });
  });
  $('select-visible')?.addEventListener('change', event => {
    if (event.target.checked) {
      for (const item of currentVisible) {
        if (!trySelectPaper(item)) break;
      }
    } else {
      for (const item of currentVisible) selected.delete(pathKey(item.parts));
      limitWarningText = '';
    }
    render();
  });
}
function render() {
  if (!tree) return;
  renderBreadcrumbs();

  const query = $('search').value.trim().toLowerCase();
  let html = '';
  currentVisible = [];

  if (mode === 'selected') {
    currentVisible = [...selected.values()];
    $('view-title').textContent = 'Selected files';
    $('view-subtitle').textContent = 'Your selection stays here while you browse different folders.';
    $('item-count').textContent = `${selected.size} selected`;
    $('list-label').textContent = 'Files';
    $('sort-label').textContent = `${selected.size} selected`;
    html = currentVisible.length
      ? `<div class="file-list">${currentVisible.map(item => fileRow(item, true)).join('')}</div>`
      : '<div class="empty"><strong>No files selected</strong>Browse folders and tick the files you want to collect.</div>';
  } else if (query) {
    const matches = allPaperEntries().filter(item => {
      const fullName = item.parts.join(' ').toLowerCase();
      return fullName.includes(query);
    });
    currentVisible = matches;
    $('view-title').textContent = 'Search results';
    $('view-subtitle').textContent = `Matching files across your entire library for “${esc($('search').value.trim())}”.`;
    $('item-count').textContent = `${matches.length} files`;
    $('list-label').textContent = 'Files';
    $('sort-label').textContent = 'All folders';
    html = matches.length
      ? `<div class="file-list">${matches.map(item => `${fileRow(item)}<button class="open-location" data-open-path="${esc(JSON.stringify(item.parts.slice(0, -1)))}">Open folder</button>`).join('')}</div>`
      : '<div class="empty"><strong>No matches found</strong>Try a subject, year, session, or paper number.</div>';
  } else {
    const node = getNode();
    const entries = sortEntries(Object.entries(node));
    const folders = entries.filter(([, child]) => !isPaper(child));
    const files = entries.filter(([, child]) => isPaper(child))
      .map(([name, detail]) => ({ parts: path.concat(name), detail }));
    currentVisible = files;
    $('view-title').textContent = path.length ? path[path.length - 1] : 'My Drive';
    $('view-subtitle').textContent = path.length
      ? `Browsing ${path.join(' / ')}`
      : 'Browse your exam library like a normal file manager.';
    $('item-count').textContent = `${paperCount(node).toLocaleString()} papers`;
    $('list-label').textContent = path.length === 5 ? 'Papers' : 'Folders and files';
    $('sort-label').textContent = 'Name';
    html = folders.map(([name, child]) => folderRow(name, child)).join('');
    if (files.length) html += `<div class="file-list">${files.map(item => fileRow(item)).join('')}</div>`;
    if (!html) html = '<div class="empty"><strong>This folder is empty</strong>Go back to view another folder.</div>';
  }

  $('items').innerHTML = html;
  const selectAll = $('select-visible');
  if (selectAll) selectAll.checked = currentVisible.length > 0 &&
    currentVisible.every(item => selected.has(pathKey(item.parts)));
  bindRows();
  $('nav-selected-count').textContent = selected.size;
  $('nav-library').classList.toggle('active', mode === 'library');
  $('nav-selected').classList.toggle('active', mode === 'selected');
  $('nav-library').setAttribute('aria-current', mode === 'library' ? 'page' : 'false');
  $('nav-selected').setAttribute('aria-current', mode === 'selected' ? 'page' : 'false');
  updateDock();
}
function updateDock() {
  const paperCountSelected = selected.size;
  const fileCount = getJobs().length;
  $('dock-title').textContent = `${paperCountSelected} paper${paperCountSelected === 1 ? '' : 's'} selected`;
  $('dock-caption').textContent = paperCountSelected
    ? `${fileCount} of ${MAX_FILES_PER_BATCH} allowed files selected`
    : `Select up to ${MAX_FILES_PER_BATCH} files from any folders.`;
  $('send-button').disabled = !tgReady || sending || !fileCount || fileCount > MAX_FILES_PER_BATCH;
  updateLimitWarning();
  $('send-button').textContent = sending ? 'Sending…' : `Send ${fileCount || ''} file${fileCount === 1 ? '' : 's'}`.trim();
  $('telegram-note').classList.toggle('hidden', tgReady);
}
function getJobs() {
  const types = [
    $('type-qp').checked ? 'qp' : null,
    $('type-ms').checked ? 'ms' : null
  ].filter(Boolean);
  const jobs = [];
  for (const item of selected.values()) {
    for (const type of types) {
      if ((type === 'qp' && item.detail.has_qp) || (type === 'ms' && item.detail.has_ms)) {
        const [exam, board, subject, year, month, paper] = item.parts;
        jobs.push({ exam, board, subject, year, month, paper, file_type: type });
      }
    }
  }
  return jobs;
}

function getFileCountForItem(item) {
  let count = 0;
  if ($('type-qp').checked && item.detail.has_qp) count++;
  if ($('type-ms').checked && item.detail.has_ms) count++;
  return count;
}

function showLimitWarning(message) {
  limitWarningText = message;
  updateLimitWarning();
}

function updateLimitWarning() {
  const warning = $('limit-warning');
  if (!warning) return;
  const fileCount = getJobs().length;
  const reached = fileCount >= MAX_FILES_PER_BATCH;
  if (limitWarningText) {
    warning.textContent = limitWarningText;
    warning.classList.remove('hidden');
  } else if (reached) {
    warning.textContent = `Maximum reached: ${MAX_FILES_PER_BATCH} files. Remove a selected file before adding another.`;
    warning.classList.remove('hidden');
  } else {
    warning.textContent = '';
    warning.classList.add('hidden');
  }
}

function trySelectPaper(item) {
  const key = pathKey(item.parts);
  if (selected.has(key)) return true;
  const additional = getFileCountForItem(item);
  const currentCount = getJobs().length;
  if (currentCount + additional > MAX_FILES_PER_BATCH) {
    const remaining = Math.max(0, MAX_FILES_PER_BATCH - currentCount);
    showLimitWarning(remaining === 0
      ? `You've reached the ${MAX_FILES_PER_BATCH}-file limit. Remove a selected file before adding another.`
      : `This paper needs ${additional} files, but only ${remaining} slot${remaining === 1 ? '' : 's'} left. The maximum is ${MAX_FILES_PER_BATCH} files.`);
    try { tg?.HapticFeedback?.notificationOccurred('warning'); } catch (_) {}
    return false;
  }
  selected.set(key, item);
  limitWarningText = '';
  return true;
}

function handleTypeOptionChange(event) {
  const currentCount = getJobs().length;
  if (currentCount > MAX_FILES_PER_BATCH) {
    $('type-qp').checked = previousTypeOptions.qp;
    $('type-ms').checked = previousTypeOptions.ms;
    showLimitWarning(`Changing these options would exceed the ${MAX_FILES_PER_BATCH}-file limit. Remove some selections first.`);
    return;
  }
  previousTypeOptions = { qp: $('type-qp').checked, ms: $('type-ms').checked };
  limitWarningText = '';
  updateDock();
}
async function sendFiles() {
  if (sending || !tgReady) return;
  const jobs = getJobs();
  if (!jobs.length) {
    setStatus('No available files match the selected file types.', 'bad');
    return;
  }
  if (jobs.length > MAX_FILES_PER_BATCH) {
    showLimitWarning(`You selected ${jobs.length} files. The maximum is ${MAX_FILES_PER_BATCH}. Remove some files before sending.`);
    return;
  }

  sending = true;
  updateDock();
  setStatus(`Sending ${jobs.length} file${jobs.length === 1 ? '' : 's'}…`);
  try {
    const response = await fetch(`${API_BASE}/api/download-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': tg.initData
      },
      body: JSON.stringify({ files: jobs })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    const sent = Number(result.sent || 0);
    const failures = result.failures || [];
    if (failures.length) {
      setStatus(`${sent}/${jobs.length} files sent. ${failures.slice(0, 3).join(' · ')}`, 'bad');
    } else {
      setStatus(`All ${sent} files sent. Check your Telegram chat.`, 'good');
      try { tg.HapticFeedback?.notificationOccurred('success'); } catch (_) {}
    }
  } catch (error) {
    setStatus(error.message, 'bad');
  } finally {
    sending = false;
    updateDock();
  }
}
$('nav-library').addEventListener('click', () => { mode = 'library'; path = []; render(); });
$('nav-selected').addEventListener('click', () => { mode = 'selected'; render(); });
$('back-btn').addEventListener('click', () => {
  if (path.length && mode === 'library') { path.pop(); render(); }
});
$('search').addEventListener('input', () => { mode = 'library'; render(); });
$('clear-search').addEventListener('click', () => { $('search').value = ''; render(); });
$('type-qp').addEventListener('change', handleTypeOptionChange);
$('type-ms').addEventListener('change', handleTypeOptionChange);
$('send-button').addEventListener('click', sendFiles);

async function load() {
  try {
    const response = await fetch(`${API_BASE}/api/options?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Library request failed (${response.status})`);
    tree = await response.json();
    render();
    setStatus('Library ready. Select files from any folder.');
  } catch (error) {
    console.error('Library loading error:', error);
    $('item-count').textContent = 'Unavailable';
    setStatus(`${error.message}. Check your connection and try again.`, 'bad');
  } finally {
    await hideWelcome();
  }
}
load();

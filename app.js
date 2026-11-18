// Every PP — file-explorer style browser
const API_BASE = 'https://exampastpaper.kok775082.workers.dev'; // ✅ UPDATED TO YOUR NEW DOMAIN
const MAX_FILES_PER_BATCH = 10;

const tg = window.Telegram?.WebApp || null;
try {
  tg?.ready();
  tg?.expand();
  tg?.setHeaderColor('#121212');
  tg?.setBackgroundColor('#121212');
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
let selected = new Map(); // key -> { parts, detail, types: { qp: bool, ms: bool } }
let mode = 'library';
let sending = false;
let currentVisible = [];
let limitWarningText = '';

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
function isWildcardName(name) {
  return String(name ?? '').includes('*');
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
    if (isWildcardName(name)) continue;
    const next = parts.concat(name);
    if (isPaper(child)) output.push({ parts: next, detail: child });
    else allPaperEntries(child, next, output);
  }
  return output;
}
function wildcardMatches(value, pattern) {
  const marker = String(pattern ?? '').trim();
  if (!marker.endsWith('*')) return String(value ?? '').toUpperCase() === marker.toUpperCase();
  const exactValue = marker.slice(0, -1).trim().toUpperCase();
  return exactValue === '' || String(value ?? '').trim().toUpperCase() === exactValue;
}

function getWildcardItems(scope, pattern) {
  return allPaperEntries().filter(item => {
    if (item.parts.length <= scope.length) return false;
    for (let index = 0; index < scope.length; index++) {
      if (String(item.parts[index]) !== String(scope[index])) return false;
    }
    return wildcardMatches(item.parts[scope.length], pattern);
  });
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

// ✅ UPDATED: Checkbox is removed from here
function fileRow(item, selectedView = false) {
  const { parts, detail } = item;
  const key = pathKey(parts);
  const name = parts[parts.length - 1];
  const location = parts.slice(0, -1).join(' / ');
  
  const isSelected = selected.has(key);
  const selectedTypes = selected.get(key)?.types || {};
  
  let badges = '';
  if (detail.has_qp) {
    badges += `<button class="type-dot ${selectedTypes.qp ? 'active' : ''}" data-action="qp" data-parts="${esc(JSON.stringify(parts))}">QP</button>`;
  }
  if (detail.has_ms) {
    badges += `<button class="type-dot ms ${selectedTypes.ms ? 'active' : ''}" data-action="ms" data-parts="${esc(JSON.stringify(parts))}">MS</button>`;
  }

  return `<div class="file-row ${isSelected ? 'selected' : ''}">
    <span class="file-icon">${fileIcon()}</span>
    <span class="file-copy"><span class="file-name">${esc(name)}</span><span class="file-meta">${esc(location)}</span></span>
    <span class="availability">${badges}</span>
    ${selectedView ? `<button class="row-remove" data-remove="${esc(key)}" aria-label="Remove ${esc(name)}">×</button>` : ''}
  </div>`;
}

function folderRow(name, child) {
  return `<button class="folder" data-folder="${esc(name)}">
    <span class="folder-icon">${folderIcon()}</span>
    <span class="folder-copy"><span class="folder-name">${esc(name)}</span></span>
    <span class="folder-arrow">›</span>
  </button>`;
}

function wildcardFileRow(name, scopePath) {
  return `<button class="wildcard-file-row" type="button" data-wildcard-name="${esc(name)}" data-wildcard-scope="${esc(JSON.stringify(scopePath))}" ${sending ? 'disabled' : ''}>
    <span class="file-icon wildcard-file-icon">${fileIcon()}</span>
    <span class="file-copy"><span class="file-name">${esc(name)}</span><span class="file-meta">Sends matching Question Papers immediately</span></span>
    <span class="wildcard-open">Send QP →</span>
  </button>`;
}

const PAPER_FIELDS = ['exam', 'board', 'subject', 'year', 'month', 'paper'];
function makeWildcardCriteria(scopePath, marker) {
  const index = scopePath.length;
  if (index >= PAPER_FIELDS.length || !String(marker).endsWith('*')) return null;
  const criteria = {};
  scopePath.forEach((value, i) => { criteria[PAPER_FIELDS[i]] = value; });
  criteria[PAPER_FIELDS[index]] = marker;
  return criteria;
}

async function sendWildcardChoice(scopePath, marker, button) {
  if (sending) return;
  if (!tgReady) {
    setStatus('Open this page from your Telegram bot to send files.', 'bad');
    return;
  }

  const criteria = makeWildcardCriteria(scopePath, marker);
  if (!criteria) {
    setStatus('This wildcard entry is not at a valid exam-library level.', 'bad');
    return;
  }

  sending = true;
  if (button) button.disabled = true;
  updateDock();
  const location = [...scopePath, marker].join(' / ');
  setStatus(`Sending Question Papers for ${location}…`);

  try {
    const response = await fetch(`${API_BASE}/api/download-wildcard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData },
      body: JSON.stringify({ criteria })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 413) {
        showLimitWarning(result.error || `This wildcard exceeds the ${MAX_FILES_PER_BATCH}-file limit.`);
      }
      throw new Error(result.error || `Request failed (${response.status})`);
    }

    const sent = Number(result.sent || 0);
    const total = Number(result.total || 0);
    const failures = Array.isArray(result.failures) ? result.failures : [];
    if (failures.length) {
      setStatus(`Sent ${sent}/${total} Question Papers. ${failures.length} could not be sent.`, 'bad');
    } else {
      setStatus(`Sent ${sent} Question Paper${sent === 1 ? '' : 's'} for ${location}.`, 'good');
      try { tg.HapticFeedback?.notificationOccurred('success'); } catch (_) {}
    }
  } catch (error) {
    setStatus(error.message, 'bad');
  } finally {
    sending = false;
    render();
  }
}

function toggleBadge(parts, type) {
  const key = pathKey(parts);
  const item = allPaperEntries().find(entry => pathKey(entry.parts) === key);
  if (!item) return;

  let existing = selected.get(key);
  
  if (existing) {
    if (existing.types[type]) {
      existing.types[type] = false;
      if (!existing.types.qp && !existing.types.ms) {
        selected.delete(key);
      }
    } else {
      const currentCount = getJobs().length;
      if (currentCount + 1 > MAX_FILES_PER_BATCH) {
        showLimitWarning(`Limit reached. Max is ${MAX_FILES_PER_BATCH}.`);
        return;
      }
      existing.types[type] = true;
    }
  } else {
    const currentCount = getJobs().length;
    if (currentCount + 1 > MAX_FILES_PER_BATCH) {
      showLimitWarning(`Limit reached. Max is ${MAX_FILES_PER_BATCH}.`);
      return;
    }
    selected.set(key, {
      parts: item.parts,
      detail: item.detail,
      types: { qp: type === 'qp', ms: type === 'ms' }
    });
  }
  limitWarningText = '';
  render();
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
  $('items').querySelectorAll('[data-wildcard-name]').forEach(button => {
    button.addEventListener('click', () => {
      const scopePath = JSON.parse(button.dataset.wildcardScope || '[]');
      sendWildcardChoice(scopePath, button.dataset.wildcardName, button);
    });
  });
  
  // Bind the QP/MS badges
  $('items').querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation(); 
      const parts = JSON.parse(button.dataset.parts);
      toggleBadge(parts, button.dataset.action);
    });
  });

  // ✅ UPDATED: Removed the event listener for the checkboxes
  
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
    $('list-label').textContent = 'Files';
    $('sort-label').textContent = `${selected.size} selected`;
    html = currentVisible.length
      ? `<div class="file-list">${currentVisible.map(item => fileRow(item, true)).join('')}</div>`
      : '<div class="empty"><strong>No files selected</strong>Browse folders and click QP or MS to select files.</div>';
  } else if (query) {
    const matches = allPaperEntries().filter(item => {
      const fullName = item.parts.join(' ').toLowerCase();
      return fullName.includes(query);
    });
    currentVisible = matches;
    $('view-title').textContent = 'Search results';
    $('view-subtitle').textContent = `Matching files across your entire library for “${esc($('search').value.trim())}”.`;
    $('list-label').textContent = 'Files';
    $('sort-label').textContent = 'All folders';
    html = matches.length
      ? `<div class="file-list">${matches.map(item => `${fileRow(item)}<button class="open-location" data-open-path="${esc(JSON.stringify(item.parts.slice(0, -1)))}">Open folder</button>`).join('')}</div>`
      : '<div class="empty"><strong>No matches found</strong>Try a subject, year, session, or paper number.</div>';
  } else {
    const node = getNode();
    const entries = sortEntries(Object.entries(node));
    const wildcardEntries = entries.filter(([name]) => isWildcardName(name));
    const folders = entries.filter(([name, child]) => !isWildcardName(name) && !isPaper(child));
    const files = entries.filter(([name, child]) => !isWildcardName(name) && isPaper(child))
      .map(([name, detail]) => ({ parts: path.concat(name), detail }));
    currentVisible = files;
    $('view-title').textContent = path.length ? path[path.length - 1] : 'My Drive';
    $('view-subtitle').textContent = path.length
      ? `Browsing ${path.join(' / ')}`
      : 'Browse your exam resources like a normal file manager.';
    $('list-label').textContent = path.length === 5 ? 'Papers' : 'Folders and files';
    $('sort-label').textContent = 'Name';
    html = folders.map(([name, child]) => folderRow(name, child)).join('');
    if (wildcardEntries.length) {
      html += wildcardEntries.map(([name]) => wildcardFileRow(name, path)).join('');
    }
    if (files.length) html += `<div class="file-list">${files.map(item => fileRow(item)).join('')}</div>`;
    if (!html) html = '<div class="empty"><strong>This folder is empty</strong>Go back to view another folder.</div>';
  }

  $('items').innerHTML = html;
  const selectAll = $('select-visible');
  if (selectAll) {
    selectAll.checked = currentVisible.length > 0 &&
      currentVisible.every(item => selected.has(pathKey(item.parts)));
  }
  
  bindRows();
  $('nav-selected-count').textContent = selected.size;
  $('nav-library').classList.toggle('active', mode !== 'selected');
  $('nav-selected').classList.toggle('active', mode === 'selected');
  $('nav-library').setAttribute('aria-current', mode !== 'selected' ? 'page' : 'false');
  $('nav-selected').setAttribute('aria-current', mode === 'selected' ? 'page' : 'false');
  updateDock();
}

function getJobs() {
  const jobs = [];
  for (const item of selected.values()) {
    const [exam, board, subject, year, month, paper] = item.parts;
    if (item.types.qp) jobs.push({ exam, board, subject, year, month, paper, file_type: 'qp' });
    if (item.types.ms) jobs.push({ exam, board, subject, year, month, paper, file_type: 'ms' });
  }
  return jobs;
}

function updateDock() {
  const paperCountSelected = selected.size;
  const fileCount = getJobs().length;
  
  $('dock-title').textContent = `${paperCountSelected} paper${paperCountSelected === 1 ? '' : 's'} selected`;
  $('dock-caption').textContent = paperCountSelected
    ? `${fileCount} file${fileCount === 1 ? '' : 's'} selected to send`
    : `Select up to ${MAX_FILES_PER_BATCH} files from any folders.`;
    
  $('send-button').disabled = !tgReady || sending || !fileCount;
  updateLimitWarning();
  $('send-button').textContent = sending ? 'Sending…' : `Send ${fileCount || ''} file${fileCount === 1 ? '' : 's'}`.trim();
  $('telegram-note').classList.toggle('hidden', tgReady);
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
  const needed = (item.detail.has_qp ? 1 : 0) + (item.detail.has_ms ? 1 : 0);
  if (needed === 0) return true;
  const currentCount = getJobs().length;
  if (currentCount + needed > MAX_FILES_PER_BATCH) {
    showLimitWarning(`Cannot select all. Limit is ${MAX_FILES_PER_BATCH} files.`);
    return false;
  }
  selected.set(key, {
    parts: item.parts,
    detail: item.detail,
    types: { qp: item.detail.has_qp, ms: item.detail.has_ms }
  });
  return true;
}

async function sendJobs(jobs, description) {
  if (sending || !tgReady) return;
  if (!jobs.length) {
    setStatus('No available files match the selected file types.', 'bad');
    return;
  }
  if (jobs.length > MAX_FILES_PER_BATCH) {
    showLimitWarning(`This selection contains ${jobs.length} files. The maximum is ${MAX_FILES_PER_BATCH}. Open a more specific folder.`);
    return;
  }

  sending = true;
  updateDock();
  setStatus(`Sending ${jobs.length} file${jobs.length === 1 ? '' : 's'} from ${description}…`);
  try {
    const response = await fetch(`${API_BASE}/api/download-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData },
      body: JSON.stringify({ files: jobs })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 413) {
        showLimitWarning(result.error || `The maximum is ${MAX_FILES_PER_BATCH} files. Open a more specific folder.`);
      }
      throw new Error(result.error || `Request failed (${response.status})`);
    }
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

async function sendFiles() {
  await sendJobs(getJobs(), 'your selected papers');
}

$('nav-library').addEventListener('click', () => { mode = 'library'; path = []; $('search').value = ''; render(); });
$('nav-selected').addEventListener('click', () => { mode = 'selected'; render(); });
$('back-btn').addEventListener('click', () => {
  if (path.length && mode === 'library') { path.pop(); render(); }
});
$('search').addEventListener('input', () => { mode = 'library'; render(); });
$('clear-search').addEventListener('click', () => { $('search').value = ''; mode = 'library'; render(); });
$('send-button').addEventListener('click', sendFiles);

async function load() {
  try {
    const response = await fetch(`${API_BASE}/api/options?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Library request failed (${response.status})`);
    tree = await response.json();
    render();
    setStatus('Library ready. Click QP or MS to select files.');
  } catch (error) {
    console.error('Library loading error:', error);
    setStatus(`${error.message}. Check your connection and try again.`, 'bad');
  } finally {
    await hideWelcome();
  }
}
load();

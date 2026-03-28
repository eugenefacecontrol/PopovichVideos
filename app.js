const SESSION_KEY = 'video-library-user';
const state = {
  catalog: null,
  filters: {
    search: '',
    folder: '',
    type: '',
    month: '',
    dateStart: '',
    dateEnd: '',
  },
};

const el = {
  loginSection: document.getElementById('loginSection'),
  appSection: document.getElementById('appSection'),
  sessionBar: document.getElementById('sessionBar'),
  currentUserLabel: document.getElementById('currentUserLabel'),
  loginForm: document.getElementById('loginForm'),
  loginError: document.getElementById('loginError'),
  logoutBtn: document.getElementById('logoutBtn'),
  searchInput: document.getElementById('searchInput'),
  folderFilter: document.getElementById('folderFilter'),
  typeFilter: document.getElementById('typeFilter'),
  monthFilter: document.getElementById('monthFilter'),
  dateStartFilter: document.getElementById('dateStartFilter'),
  dateEndFilter: document.getElementById('dateEndFilter'),
  content: document.getElementById('content'),
  stats: document.getElementById('stats'),
};

function getCurrentUser() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setCurrentUser(user) {
  if (!user) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    username: user.username,
    displayName: user.displayName || user.username,
  }));
}

function setLoginError(message = '') {
  el.loginError.textContent = message;
  el.loginError.classList.toggle('hidden', !message);
}

function updateAuthUi() {
  const user = getCurrentUser();
  const isLoggedIn = Boolean(user);
  el.loginSection.classList.toggle('hidden', isLoggedIn);
  el.appSection.classList.toggle('hidden', !isLoggedIn);
  el.sessionBar.classList.toggle('hidden', !isLoggedIn);
  el.currentUserLabel.textContent = isLoggedIn ? `Signed in as ${user.displayName}` : '';
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
}

function fillSelect(select, values, label) {
  const current = select.value;
  select.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = label;
  select.appendChild(allOption);
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  select.value = values.includes(current) ? current : '';
}

function buildFilters(catalog) {
  fillSelect(el.folderFilter, uniqueSorted(catalog.items.map((item) => item.folder)), 'All folders');
  fillSelect(el.typeFilter, uniqueSorted(catalog.items.map((item) => item.type)), 'All types');
  fillSelect(el.monthFilter, uniqueSorted(catalog.items.map((item) => item.month)), 'All months');
}

function parseRussianDate(date, month) {
  if (!date || !month) return null;
  const monthMap = {
    'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3,
    'мая': 4, 'июня': 5, 'июля': 6, 'августа': 7,
    'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
  };
  const monthNum = monthMap[month.toLowerCase()];
  if (monthNum === undefined) return null;
  const year = 2025;
  return new Date(year, monthNum, parseInt(date));
}

function normalizeString(value) {
  return (value || '').toString().trim().toLowerCase();
}

function matchesFilters(item) {
  const q = normalizeString(state.filters.search);
  const haystack = normalizeString([
    item.title,
    item.folder,
    item.subfolder,
    item.type,
    item.week,
    item.dateLabel,
    item.inventory,
    ...(item.tags || []),
  ].join(' | '));

  if (q && !haystack.includes(q)) return false;
  if (state.filters.folder && item.folder !== state.filters.folder) return false;
  if (state.filters.type && item.type !== state.filters.type) return false;
  if (state.filters.month && item.month !== state.filters.month) return false;

  if (state.filters.dateStart || state.filters.dateEnd) {
    const itemDate = parseRussianDate(item.date, item.month);
    if (itemDate) {
      const startDate = state.filters.dateStart ? new Date(state.filters.dateStart) : null;
      const endDate = state.filters.dateEnd ? new Date(state.filters.dateEnd) : null;
      if (startDate && itemDate < startDate) return false;
      if (endDate && itemDate > endDate) return false;
    } else if (state.filters.dateStart || state.filters.dateEnd) {
      return false;
    }
  }

  return true;
}

function createVideoCard(item) {
  const wrapper = document.createElement('article');
  wrapper.className = 'video-card';

  const meta = [item.week, item.dateLabel, item.type].filter(Boolean).join(' • ');
  const tags = (item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  const inventory = item.inventory ? `<p><strong>Inventory:</strong> ${escapeHtml(item.inventory)}</p>` : '';
  const complexity = item.complexity ? `<p><strong>Complexity:</strong> ${item.complexity}</p>` : '';

  wrapper.innerHTML = `
    <div class="video-info">
      <div class="video-header">
        <h3>${escapeHtml(item.title)}</h3>
        <a class="secondary-btn" href="${item.iframeSrc}" target="_blank" rel="noreferrer">Open video</a>
      </div>
      <p class="muted">${escapeHtml(meta || item.folder)}</p>
      <p><strong>Folder:</strong> ${escapeHtml(item.folder)}${item.subfolder ? ` / ${escapeHtml(item.subfolder)}` : ''}</p>
      <p><strong>Duration:</strong> ${item.time || '?'} min</p>
      ${inventory}
      ${complexity}
      ${tags ? `<div class="tags">${tags}</div>` : ''}
    </div>
    <div class="video-frame">
      <iframe
        src="${item.iframeSrc}"
        title="${escapeHtml(item.title)}"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowfullscreen
        frameborder="0"
      ></iframe>
    </div>
  `;

  return wrapper;
}

function render() {
  const filtered = state.catalog.items.filter(matchesFilters);
  el.stats.textContent = `Showing ${filtered.length} of ${state.catalog.totalVideos} videos`;

  const grouped = new Map();
  for (const item of filtered) {
    const folderKey = item.folder || 'Other';
    const subfolderKey = item.subfolder || '__root__';
    if (!grouped.has(folderKey)) grouped.set(folderKey, new Map());
    const subMap = grouped.get(folderKey);
    if (!subMap.has(subfolderKey)) subMap.set(subfolderKey, []);
    subMap.get(subfolderKey).push(item);
  }

  el.content.innerHTML = '';

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = '<p>No videos found for current filters.</p>';
    el.content.appendChild(empty);
    return;
  }

  for (const [folder, subMap] of grouped.entries()) {
    const section = document.createElement('section');
    section.className = 'folder-section';

    const title = document.createElement('h2');
    title.textContent = folder;
    section.appendChild(title);

    for (const [subfolder, items] of subMap.entries()) {
      if (subfolder !== '__root__') {
        const subtitle = document.createElement('h3');
        subtitle.className = 'subfolder-title';
        subtitle.textContent = subfolder;
        section.appendChild(subtitle);
      }
      items.forEach((item) => section.appendChild(createVideoCard(item)));
    }
    el.content.appendChild(section);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadCatalog() {
  const response = await fetch('./data/catalog.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load catalog.json: ${response.status}`);
  state.catalog = await response.json();
  buildFilters(state.catalog);
  // Default to show trainings
  if (!state.filters.folder) {
    state.filters.folder = 'Тренировки';
    el.folderFilter.value = 'Тренировки';
  }
  render();
}

function bindEvents() {
  el.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(el.loginForm);
    const username = String(form.get('username') || '').trim();
    const password = String(form.get('password') || '');
    const user = (window.APP_USERS || []).find(
      (entry) => entry.username === username && entry.password === password,
    );

    if (!user) {
      setLoginError('Invalid username or password');
      return;
    }

    setLoginError('');
    setCurrentUser(user);
    updateAuthUi();

    if (!state.catalog) {
      try {
        await loadCatalog();
      } catch (error) {
        setLoginError(error.message);
      }
    }
  });

  el.logoutBtn.addEventListener('click', () => {
    setCurrentUser(null);
    updateAuthUi();
  });

  el.searchInput.addEventListener('input', (event) => {
    state.filters.search = event.target.value;
    render();
  });

  el.folderFilter.addEventListener('change', (event) => {
    state.filters.folder = event.target.value;
    render();
  });

  el.typeFilter.addEventListener('change', (event) => {
    state.filters.type = event.target.value;
    render();
  });

  el.monthFilter.addEventListener('change', (event) => {
    state.filters.month = event.target.value;
    render();
  });

  el.dateStartFilter.addEventListener('change', (event) => {
    state.filters.dateStart = event.target.value;
    render();
  });

  el.dateEndFilter.addEventListener('change', (event) => {
    state.filters.dateEnd = event.target.value;
    render();
  });
}

async function init() {
  bindEvents();
  updateAuthUi();
  if (getCurrentUser()) {
    try {
      await loadCatalog();
    } catch (error) {
      el.content.innerHTML = `<div class="card error-box">${escapeHtml(error.message)}</div>`;
    }
  }
}

init();

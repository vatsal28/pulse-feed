/**
 * Content Radar — Pulse SPA
 * Vanilla JS, no framework, no build step.
 * Hash routing: /#/YYYY-MM-DD  +  optional  /#/YYYY-MM-DD/section
 */

'use strict';

/* ================================================================
   CONSTANTS
================================================================ */

/** Section metadata — maps section IDs to display info */
const SECTIONS = {
  hackernews:  { label: 'HN',          color: '#FF6B35', sources: ['hackernews'] },
  github:      { label: 'GitHub',      color: '#00FFB2', sources: ['github'] },
  reddit:      { label: 'Reddit',      color: '#7B61FF', sources: ['reddit'] },
  rss:         { label: 'RSS',         color: '#3DD6F5', sources: ['techcrunch','arxiv','inc42','techmeme','hfblog','openai','googleblog','deepmind','mittr'] },
  newsletters: { label: 'Newsletters', color: '#FFD166', sources: ['rundownai','bensbites','importai','aheadofai','interconnects','lastweekinai'] },
};

/** Reverse map: source → section key */
const SOURCE_TO_SECTION = {};
for (const [sectionKey, meta] of Object.entries(SECTIONS)) {
  for (const src of meta.sources) SOURCE_TO_SECTION[src] = sectionKey;
}

/** Nav button active-color CSS variable per section */
const NAV_COLORS = {
  hackernews:  '#FF6B35',
  github:      '#00FFB2',
  reddit:      '#7B61FF',
  rss:         '#3DD6F5',
  newsletters: '#FFD166',
};

/* ================================================================
   STATE
================================================================ */
const state = {
  days:           [],     // [{date, total_items}] from index.json
  currentDate:    null,   // 'YYYY-MM-DD'
  currentSection: 'hackernews',
  feedData:       null,   // full day JSON
  allItems:       [],     // all items for current day
  visibleItems:   [],     // items after section filter
  isFirstLoad:    true,
  prevDate:       null,   // for slide direction detection
  rssSourceFilter: 'all', // 'all' or specific source like 'techcrunch'
};

/** Readable source names for RSS filter dropdown */
const RSS_SOURCE_LABELS = {
  techcrunch: 'TechCrunch',
  arxiv: 'arXiv',
  inc42: 'Inc42',
  techmeme: 'Techmeme',
  hfblog: 'Hugging Face',
  openai: 'OpenAI',
  googleblog: 'Google AI',
  deepmind: 'DeepMind',
  mittr: 'MIT Tech Review',
};

const NEWSLETTER_SOURCE_LABELS = {
  rundownai: 'Rundown AI',
  bensbites: "Ben's Bites",
  importai: 'Import AI',
  aheadofai: 'Ahead of AI',
  interconnects: 'Interconnects',
  lastweekinai: 'Last Week in AI',
};

/* ================================================================
   DOM REFS
================================================================ */
const $ = id => document.getElementById(id);
const dom = {
  dateRibbon:  $('date-ribbon'),
  feed:        $('feed'),
  feedStatus:  $('feed-status'),
  statsBar:    $('stats-bar'),
  radarLine:   $('radar-line'),
  sectionNav:  $('section-nav'),
};

/* ================================================================
   UTILS
================================================================ */

/** Format ISO date string → "Mar 15" */
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format ISO date → "Mon" */
function formatDayName(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'short' });
}

/** Today's date as "YYYY-MM-DD" (local time) */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** Relative time from ISO string → "2h ago", "just now", etc. */
function relativeTime(isoStr) {
  if (!isoStr) return '';
  try {
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000; // seconds
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  } catch { return ''; }
}

/** Compare two "YYYY-MM-DD" strings */
function compareDates(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/* ================================================================
   ROUTING
================================================================ */

/**
 * Parse the URL hash into { date, section }.
 * Supports: /#/2026-03-15   or   /#/2026-03-15/hackernews
 */
function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  const date    = /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) ? parts[0] : null;
  const section = parts[1] && SECTIONS[parts[1]] ? parts[1] : null;
  return { date, section };
}

/** Update the URL hash without triggering a hashchange event loop */
function setHash(date, section, skipEvent = false) {
  const newHash = section
    ? `#/${date}/${section}`
    : `#/${date}`;
  if (window.location.hash !== newHash) {
    window._internalHashChange = skipEvent;
    window.location.hash = newHash;
  }
}

/* ================================================================
   FETCH HELPERS
================================================================ */

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

/* ================================================================
   INIT
================================================================ */

async function init() {
  setupPullToRefresh();
  setupNavButtons();
  setupDockIndicator();
  setupGyroParallax();
  setupTouchRipple();

  window.addEventListener('hashchange', onHashChange);

  try {
    await loadManifest();
  } catch (err) {
    showFeedStatus(`<div class="state-error"><h2>⚠ Could not load manifest</h2><p>${escHtml(err.message)}</p></div>`);
    return;
  }

  // Determine initial date & section from hash, or default to most recent day
  const { date: hashDate, section: hashSection } = parseHash();
  const initialDate = (hashDate && state.days.find(d => d.date === hashDate))
    ? hashDate
    : state.days[0]?.date;

  if (!initialDate) {
    showFeedStatus('<div class="state-empty"><h2>No data yet</h2><p>Run generate-manifest.sh to build the index.</p></div>');
    return;
  }

  if (hashSection) state.currentSection = hashSection;
  state.currentDate = initialDate;

  renderDateRibbon();
  updateNavButtons();
  await loadDay(initialDate, 'none');
}

/* ================================================================
   MANIFEST
================================================================ */

async function loadManifest() {
  const data = await fetchJSON('index.json');
  // Sort descending (most recent first)
  state.days = (data.days || []).sort((a, b) => compareDates(b.date, a.date));
}

/* ================================================================
   DATE RIBBON
================================================================ */

function renderDateRibbon() {
  dom.dateRibbon.innerHTML = '';
  const today = todayStr();

  // Pills in reverse order so today is DOM-last → CSS flex-direction:row-reverse puts it visually right
  for (const day of state.days) {
    const pill = document.createElement('button');
    pill.className = 'day-pill' + (day.date === state.currentDate ? ' active' : '');
    pill.dataset.date = day.date;
    pill.setAttribute('aria-label', `${formatDayName(day.date)} ${formatDate(day.date)} — ${day.total_items} items`);
    pill.setAttribute('aria-pressed', day.date === state.currentDate ? 'true' : 'false');

    const isToday = day.date === today;
    pill.innerHTML = `<span class="pill-day">${formatDayName(day.date)}</span> <span class="pill-date">${formatDate(day.date)}</span>${isToday ? ' ●' : ''}`;

    pill.addEventListener('click', () => onDateSelect(day.date));
    dom.dateRibbon.appendChild(pill);
  }

  // First-open pulse on active pill
  if (state.isFirstLoad) {
    const activePill = dom.dateRibbon.querySelector('.day-pill.active');
    if (activePill) {
      activePill.classList.add('pulse-once');
      activePill.addEventListener('animationend', () => activePill.classList.remove('pulse-once'), { once: true });
    }
  }

  // Scroll active pill into view (today = rightmost, already visible by default)
  requestAnimationFrame(() => {
    const activePill = dom.dateRibbon.querySelector('.day-pill.active');
    activePill?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
}

function updateActivePill(date) {
  dom.dateRibbon.querySelectorAll('.day-pill').forEach(p => {
    const isActive = p.dataset.date === date;
    p.classList.toggle('active', isActive);
    p.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

/* ================================================================
   SECTION NAV
================================================================ */

function setupNavButtons() {
  dom.sectionNav.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      if (section !== state.currentSection) {
        state.currentSection = section;
        state.rssSourceFilter = 'all'; // reset filter on section switch
        setHash(state.currentDate, section);
        updateNavButtons();
        moveDockIndicator();
        renderSectionFeed(true);
      }
    });
  });
}

function updateNavButtons() {
  dom.sectionNav.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.section === state.currentSection;
    btn.classList.toggle('active', isActive);
    // Set CSS variable for active indicator color
    btn.style.setProperty('--nav-active-color', NAV_COLORS[btn.dataset.section] || '#00FFB2');
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  // Move dock indicator after updating active state
  requestAnimationFrame(() => moveDockIndicator());
}

/* ================================================================
   LOAD DAY
================================================================ */

/**
 * Load a day's feed JSON and render.
 * direction: 'left' | 'right' | 'none'  (for slide animation)
 */
async function loadDay(date, direction = 'none') {
  showFeedStatus('');
  dom.statsBar.textContent = '';
  showSkeletonTiles(7);

  setHash(date, state.currentSection, true);
  updateActivePill(date);

  try {
    const data = await fetchJSON(`raw-feed-${date}.json`);
    state.feedData   = data;
    state.allItems   = data.items || [];
    state.currentDate = date;

    // Stats bar
    const sourcesCount = Object.keys(data.stats?.by_source || {}).length;
    dom.statsBar.textContent =
      `${data.stats?.total_items ?? state.allItems.length} items · ${sourcesCount} sources · ${formatDate(date)}`;

    showFeedStatus('');
    renderSectionFeed(false, direction);

  } catch (err) {
    showFeedStatus(`<div class="state-empty"><h2>No data for ${formatDate(date)}</h2><p>The feed file for this day is not available.</p></div>`);
  }
}

/* ================================================================
   RENDER FEED
================================================================ */

/**
 * Filter by current section and render tiles.
 * animate: whether to do the cascade-fade (section switch).
 * direction: slide direction for date switch.
 */
function renderSourceFilter() {
  // Remove existing filter if any
  const existing = document.getElementById('source-filter');
  if (existing) existing.remove();

  // Only show for RSS and Newsletters sections
  const isRSS = state.currentSection === 'rss';
  const isNews = state.currentSection === 'newsletters';
  if (!isRSS && !isNews) return;

  const labels = isRSS ? RSS_SOURCE_LABELS : NEWSLETTER_SOURCE_LABELS;
  const sectionMeta = SECTIONS[state.currentSection];

  // Count items per source for this section
  const sourceCounts = {};
  state.allItems.forEach(item => {
    if (SOURCE_TO_SECTION[item.source] === state.currentSection) {
      sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
    }
  });

  const totalCount = Object.values(sourceCounts).reduce((a, b) => a + b, 0);

  const filter = document.createElement('div');
  filter.id = 'source-filter';

  let options = `<option value="all">All sources (${totalCount})</option>`;
  for (const [src, label] of Object.entries(labels)) {
    const count = sourceCounts[src] || 0;
    if (count > 0) {
      options += `<option value="${src}" ${state.rssSourceFilter === src ? 'selected' : ''}>${label} (${count})</option>`;
    }
  }

  filter.innerHTML = `<select id="source-select">${options}</select>`;
  dom.feed.parentNode.insertBefore(filter, dom.feed);

  document.getElementById('source-select').addEventListener('change', (e) => {
    state.rssSourceFilter = e.target.value;
    // Bypass renderSectionFeed (and its cascade animation + dropdown recreation)
    // to avoid timing issues — just filter and build tiles directly.
    const sectionMeta = SECTIONS[state.currentSection];
    let filtered = state.allItems.filter(item =>
      SOURCE_TO_SECTION[item.source] === state.currentSection
    );
    if (state.rssSourceFilter !== 'all') {
      filtered = filtered.filter(item => item.source === state.rssSourceFilter);
    }
    state.visibleItems = filtered;
    buildTiles(filtered, sectionMeta, true, 'none');
  });
}

function renderSectionFeed(animate = false, direction = 'none') {
  const sectionMeta = SECTIONS[state.currentSection];
  let items = state.allItems.filter(item =>
    SOURCE_TO_SECTION[item.source] === state.currentSection
  );

  // Apply source sub-filter for RSS/Newsletters
  if ((state.currentSection === 'rss' || state.currentSection === 'newsletters') && state.rssSourceFilter !== 'all') {
    items = items.filter(item => item.source === state.rssSourceFilter);
  }

  state.visibleItems = items;

  // Render the source filter dropdown
  renderSourceFilter();

  // Section switch: fade out then show skeletons while transitioning
  if (animate && dom.feed.children.length > 0) {
    const existing = Array.from(dom.feed.children);
    existing.forEach((tile, i) => {
      tile.style.transition = `opacity 0.15s ease ${i * 20}ms, transform 0.15s ease ${i * 20}ms`;
      tile.style.opacity = '0';
      tile.style.transform = 'translateY(-8px)';
    });
    const fadeDelay = existing.length * 20 + 150;
    setTimeout(() => {
      showSkeletonTiles(6);
      setTimeout(() => buildTiles(items, sectionMeta, true, direction), 200);
    }, fadeDelay);
    return;
  }

  buildTiles(items, sectionMeta, animate, direction);
}

function buildTiles(items, sectionMeta, cascade, direction) {
  dom.feed.innerHTML = '';

  // Slide animation class for date switch
  if (direction === 'left') {
    dom.feed.classList.add('slide-left');
    dom.feed.addEventListener('animationend', () => dom.feed.classList.remove('slide-left'), { once: true });
  } else if (direction === 'right') {
    dom.feed.classList.add('slide-right');
    dom.feed.addEventListener('animationend', () => dom.feed.classList.remove('slide-right'), { once: true });
  }

  if (items.length === 0) {
    dom.feed.innerHTML = `
      <div class="state-empty">
        <h2>No ${sectionMeta.label} items</h2>
        <p>Nothing was fetched from this source on this day.</p>
      </div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item, index) => {
    const tile = createTile(item, sectionMeta, cascade, index);
    fragment.appendChild(tile);
  });
  dom.feed.appendChild(fragment);

  state.isFirstLoad = false;
}

/* ================================================================
   TILE CREATION
================================================================ */

function createTile(item, sectionMeta, cascade, index) {
  const tile = document.createElement('article');
  tile.className = 'tile';
  tile.setAttribute('role', 'listitem');
  tile.setAttribute('aria-label', item.title);
  tile.style.setProperty('--tile-color', sectionMeta.color);

  // Staggered entrance animation (Upgrade 2 — works on all devices)
  tile.classList.add('tile-enter');
  tile.style.animationDelay = `${index * 50}ms`;
  tile.addEventListener('animationend', () => {
    tile.classList.remove('tile-enter');
    tile.style.animationDelay = '';
  }, { once: true });

  // Legacy cascade-in for border-pulse compat (cascade flag used for border-pulse timing)
  if (cascade || state.isFirstLoad) {
    // border-pulse handles separately below
  }

  // Border pulse on first load
  tile.classList.add('border-pulse');
  tile.addEventListener('animationend', () => tile.classList.remove('border-pulse'), { once: true });

  // Source label
  const sourceLabel = item.subreddit
    ? `r/${item.subreddit}`
    : (item.source || sectionMeta.label);

  // Time display: prefer published_at, fall back to scraped_at
  const timeDisplay = relativeTime(item.published_at || item.scraped_at);

  // Score display
  const scoreDisplay = buildScoreDisplay(item, sectionMeta);

  // Summary blurb (only if present)
  const summaryHtml = item.summary
    ? `<p class="tile-summary">${escHtml(item.summary)}</p>`
    : '';

  // GitHub extra: language
  const langHtml = (item.source === 'github' && item.language)
    ? `<span class="tile-language">${escHtml(item.language)}</span>`
    : '';

  const tutorialBadge = item.type === 'tutorial'
    ? `<span class="tile-tutorial-badge">📚 Tutorial</span>`
    : '';

  tile.innerHTML = `
    <div class="tile-meta">
      <span class="tile-source">${escHtml(sourceLabel.toUpperCase())}</span>
      ${tutorialBadge}
      ${item.subreddit ? '' : ''}
      <span class="tile-time">${escHtml(timeDisplay)}</span>
    </div>
    <h2 class="tile-title">${escHtml(item.title)}</h2>
    ${summaryHtml}
    <div class="tile-footer">
      ${langHtml}
      ${scoreDisplay}
    </div>
  `;

  // Click → open URL
  tile.addEventListener('click', (e) => {
    // Don't open if user was swiping
    if (tile._wasSwiping) { tile._wasSwiping = false; return; }
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  });

  // Touch gestures (swipe left/right)
  attachSwipeHandlers(tile);

  return tile;
}

function buildScoreDisplay(item, sectionMeta) {
  if (item.source === 'github') {
    return item.score != null
      ? `<span class="tile-score">⭐ ${formatNumber(item.score)}</span>`
      : '';
  }
  if (item.source === 'hackernews') {
    const pts = item.score != null ? `▲ ${formatNumber(item.score)}` : '';
    const cmts = item.comments != null ? `💬 ${formatNumber(item.comments)}` : '';
    return `<span class="tile-score">${[pts, cmts].filter(Boolean).join('  ')}</span>`;
  }
  if (item.source === 'reddit') {
    const ups = item.score != null ? `▲ ${formatNumber(item.score)}` : '';
    const cmts = item.comments != null ? `💬 ${formatNumber(item.comments)}` : '';
    return `<span class="tile-score">${[ups, cmts].filter(Boolean).join('  ')}</span>`;
  }
  // RSS / newsletters: no reliable score field
  return '';
}

function formatNumber(n) {
  if (n == null) return '';
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`;
  return String(n);
}

/** HTML-escape a string to prevent XSS */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ================================================================
   SWIPE GESTURES (vanilla touch)
================================================================ */

const SWIPE_THRESHOLD = 60; // px to qualify as a swipe

function attachSwipeHandlers(tile) {
  let startX = 0;
  let startY = 0;
  let isSwiping = false;

  tile.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isSwiping = false;
  }, { passive: true });

  tile.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    // Only intercept horizontal swipes (more horizontal than vertical)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      isSwiping = true;
    }
  }, { passive: true });

  tile.addEventListener('touchend', (e) => {
    if (!isSwiping) return;
    const dx = e.changedTouches[0].clientX - startX;

    if (dx > SWIPE_THRESHOLD) {
      // Swipe RIGHT → save (cosmetic ripple)
      tile._wasSwiping = true;
      tile.classList.add('swipe-save');
      setTimeout(() => tile.classList.remove('swipe-save'), 600);

    } else if (dx < -SWIPE_THRESHOLD) {
      // Swipe LEFT → dismiss
      tile._wasSwiping = true;
      dismissTile(tile);
    }
  }, { passive: true });
}

function dismissTile(tile) {
  // Add dismiss class for animation
  tile.classList.add('swipe-dismiss');
  tile.style.maxHeight = tile.offsetHeight + 'px';

  // After animation completes, remove from DOM
  tile.addEventListener('transitionend', () => {
    // Only trigger once all transitions end (max-height is last)
    tile.remove();
  }, { once: true });
}

/* ================================================================
   PULL TO REFRESH (Upgrade 5: Radar Ping)
================================================================ */

function setupPullToRefresh() {
  // Only on touch devices
  if (!('ontouchstart' in window)) return;

  let startY = 0;
  let pulling = false;
  let pullIndicator = null;
  const PULL_THRESHOLD = 72;
  const SHOW_THRESHOLD = 20;

  function getPullIndicator() {
    if (!pullIndicator) {
      pullIndicator = document.createElement('div');
      pullIndicator.className = 'pull-indicator';
      pullIndicator.textContent = '↓';
      document.body.appendChild(pullIndicator);
    }
    return pullIndicator;
  }

  document.addEventListener('touchstart', (e) => {
    // Only activate when scrolled to very top
    if (window.scrollY === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;

    if (dy > SHOW_THRESHOLD && window.scrollY === 0) {
      const indicator = getPullIndicator();
      indicator.classList.add('visible');
      if (dy > PULL_THRESHOLD) {
        indicator.classList.add('ready');
        indicator.textContent = '↺';
      } else {
        indicator.classList.remove('ready');
        indicator.textContent = '↓';
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!pulling) return;
    const dy = e.changedTouches[0].clientY - startY;
    pulling = false;

    // Hide indicator
    if (pullIndicator) {
      pullIndicator.classList.remove('visible', 'ready');
      pullIndicator.textContent = '↓';
    }

    if (dy > PULL_THRESHOLD && window.scrollY === 0) {
      spawnRadarPing();
      triggerRadarRefresh();
    }
  }, { passive: true });
}

function spawnRadarPing() {
  const ping = document.createElement('div');
  ping.className = 'radar-ping';
  document.body.appendChild(ping);
  ping.addEventListener('animationend', () => ping.remove(), { once: true });
}

function triggerRadarRefresh() {
  dom.radarLine.classList.add('scanning');
  dom.radarLine.addEventListener('animationend', async () => {
    dom.radarLine.classList.remove('scanning');
    // Reload current day
    if (state.currentDate) {
      await loadDay(state.currentDate, 'none');
    }
  }, { once: true });
}

/* ================================================================
   DATE SELECTION
================================================================ */

function onDateSelect(date) {
  if (date === state.currentDate) return;

  const direction = compareDates(date, state.currentDate) < 0 ? 'right' : 'left';
  state.prevDate = state.currentDate;

  loadDay(date, direction);
}

/* ================================================================
   HASH CHANGE ROUTING
================================================================ */

function onHashChange() {
  if (window._internalHashChange) {
    window._internalHashChange = false;
    return;
  }
  const { date, section } = parseHash();

  let needsDateLoad = false;
  let needsSectionRender = false;

  if (section && section !== state.currentSection) {
    state.currentSection = section;
    updateNavButtons();
    needsSectionRender = true;
  }

  if (date && date !== state.currentDate) {
    const direction = compareDates(date, state.currentDate) < 0 ? 'right' : 'left';
    loadDay(date, direction);
    return; // loadDay handles everything
  }

  if (needsSectionRender) {
    renderSectionFeed(true);
  }
}

/* ================================================================
   FEED STATUS HELPER
================================================================ */

function showFeedStatus(html) {
  dom.feedStatus.innerHTML = html;
  const hasContent = html.trim().length > 0;
  dom.feedStatus.className = hasContent ? '' : '';
  // Add loading class for spinner
  if (html.includes('class="loading"')) {
    dom.feedStatus.querySelector('.loading')?.classList.add('loading');
    dom.feedStatus.classList.add('loading');
  } else {
    dom.feedStatus.classList.remove('loading');
  }
}

/* ================================================================
   THEME TOGGLE (light / dark)
================================================================ */

function initTheme() {
  const saved = localStorage.getItem('pulse-theme') || 'dark';
  applyTheme(saved);

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('pulse-theme', next);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  // Update meta theme-color
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'light' ? '#F5F6FA' : '#0A0C12');
  }

  // Update toggle button icon
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

/* ================================================================
   UPGRADE 2: CURSOR-TRACKED SPOTLIGHT
   Uses event delegation on #feed to handle dynamically created tiles.
================================================================ */

function initSpotlightEffect() {
  // Only apply on non-touch devices
  if (!window.matchMedia('(hover: hover)').matches) return;

  dom.feed.addEventListener('mousemove', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    const rect = tile.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    tile.style.setProperty('--mouse-x', `${x}%`);
    tile.style.setProperty('--mouse-y', `${y}%`);
  });
}

/* ================================================================
   UPGRADE 3: SKELETON LOADERS
================================================================ */

function showSkeletonTiles(count = 7) {
  dom.feed.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'tile-skeleton';
    s.innerHTML = `
      <div class="skeleton-line skeleton-meta"></div>
      <div class="skeleton-line skeleton-title"></div>
      <div class="skeleton-line skeleton-title2"></div>
      <div class="skeleton-line skeleton-body"></div>
      <div class="skeleton-line skeleton-body short"></div>
      <div class="skeleton-line skeleton-score"></div>
    `;
    fragment.appendChild(s);
  }
  dom.feed.appendChild(fragment);
}

/* ================================================================
   UPGRADE 1: TOUCH RIPPLE EFFECT
================================================================ */

function setupTouchRipple() {
  // Only activate on touch devices
  if (!('ontouchstart' in window)) return;

  dom.feed.addEventListener('touchstart', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;

    const touch = e.touches[0];
    const rect = tile.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = touch.clientX - rect.left - size / 2;
    const y = touch.clientY - rect.top - size / 2;

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
    `;
    tile.appendChild(ripple);

    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  }, { passive: true });
}

/* ================================================================
   UPGRADE 3: GYROSCOPE PARALLAX ON BACKGROUND ORBS
================================================================ */

function setupGyroParallax() {
  if (!window.DeviceOrientationEvent || !('ontouchstart' in window)) return;

  // Create the gyro orbs layer
  const orbs = document.createElement('div');
  orbs.id = 'gyro-orbs';
  document.body.insertBefore(orbs, document.body.firstChild);

  function startListening() {
    window.addEventListener('deviceorientation', (e) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const x = ((e.gamma || 0) / 90) * 15; // ±15px
      const y = ((e.beta  || 0) / 180) * 15;

      requestAnimationFrame(() => {
        orbs.style.setProperty('--tilt-x', `${x}px`);
        orbs.style.setProperty('--tilt-y', `${y}px`);
      });
    }, { passive: true });
  }

  // iOS 13+ requires explicit permission
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    // Request permission on first user interaction
    const requestOnce = () => {
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') startListening();
        })
        .catch(() => {/* silently ignore denial */});
      document.removeEventListener('touchstart', requestOnce);
    };
    document.addEventListener('touchstart', requestOnce, { once: true, passive: true });
  } else {
    startListening();
  }
}

/* ================================================================
   UPGRADE 4: SLIDING DOCK INDICATOR
================================================================ */

function setupDockIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'dock-indicator';
  dom.sectionNav.style.position = 'fixed'; // ensure relative positioning context
  dom.sectionNav.appendChild(indicator);

  // Wait for layout then position
  requestAnimationFrame(() => {
    requestAnimationFrame(() => moveDockIndicator(false));
  });
}

function moveDockIndicator(animate = true) {
  const indicator = dom.sectionNav.querySelector('.dock-indicator');
  if (!indicator) return;

  const activeBtn = dom.sectionNav.querySelector('.nav-btn.active');
  if (!activeBtn) return;

  const navRect = dom.sectionNav.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();

  const btnWidth = btnRect.width;
  const indicatorWidth = Math.min(btnWidth * 0.8, 80);
  const x = btnRect.left - navRect.left + (btnWidth - indicatorWidth) / 2;

  if (!animate) {
    indicator.style.transition = 'none';
  } else {
    indicator.style.transition = '';
  }

  indicator.style.setProperty('--dock-indicator-x', `${x}px`);
  indicator.style.setProperty('--dock-indicator-width', `${indicatorWidth}px`);
  indicator.style.width = `${indicatorWidth}px`;
  indicator.style.transform = `translateX(${x}px)`;
  indicator.style.opacity = '1';
}

/* ================================================================
   KICK OFF
================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  init();
  initSpotlightEffect();

  // Reposition dock indicator on resize (handles orientation changes too)
  window.addEventListener('resize', () => {
    requestAnimationFrame(() => moveDockIndicator(false));
  });
});

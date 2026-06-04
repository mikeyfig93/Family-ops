/* ============================================================
   FAMILY OPERATIONS CENTER — app.js
   Main application logic — all screens, modals, routing
   ============================================================ */

'use strict';

// ── CONSTANTS ────────────────────────────────────────────
const EVENT_STATUSES = ['Interested','Maybe','Registered','Attending','Attended','Missed','Cancelled'];
const EVENT_CATEGORIES_DEFAULT = ['Sports','Arts','Music','Academic','Community','Medical','Government','Other'];
const SPENDING_CATEGORIES = ['Registration Fees','Tickets','Food','Parking','Equipment','Miscellaneous'];
const MILESTONE_CATEGORIES = ['Education','Medical','Government','Driving','College','Military Family'];
const MILESTONE_STATUSES = ['Not Started','In Progress','Completed','Cancelled'];
const INBOX_TYPES = ['Note','Photo','Screenshot','PDF','Link'];

const STATUS_BADGE_CLASS = {
  'Interested':  'badge-interested',
  'Maybe':       'badge-maybe',
  'Registered':  'badge-registered',
  'Attending':   'badge-attending',
  'Attended':    'badge-attended',
  'Missed':      'badge-missed',
  'Cancelled':   'badge-cancelled',
  'Not Started': 'badge-not-started',
  'In Progress': 'badge-in-progress',
  'Completed':   'badge-completed',
};

const INBOX_ICONS = {
  Note: '📝', Photo: '📷', Screenshot: '🖼️', PDF: '📄', Link: '🔗',
};

// ── STATE ────────────────────────────────────────────────
const State = {
  currentScreen: 'today',
  events: [],
  inboxItems: [],
  memories: [],
  milestones: [],
  people: [],
  spendingEntries: [],
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  eventsFilter: 'All',
  eventsSearch: '',
  eventsSortBy: 'date',
  customCategories: [],
};

// ── UTILITIES ────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDateTime(dateStr, timeStr) {
  let out = fmtDate(dateStr);
  if (timeStr) out += ' · ' + fmtTime(timeStr);
  return out;
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function fmtCurrency(n) {
  return '$' + (Number(n) || 0).toFixed(2);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function statusBadge(status) {
  const cls = STATUS_BADGE_CLASS[status] || 'badge-interested';
  return `<span class="badge ${cls}">${status}</span>`;
}

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function showToast(msg, isError = false) {
  const container = $('toastContainer');
  const toast = el('div', 'toast' + (isError ? ' toast-error' : ''), escHtml(msg));
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── MODAL ────────────────────────────────────────────────
const Modal = {
  open(title, bodyHtml, footerHtml = '') {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = bodyHtml;
    $('modalFooter').innerHTML = footerHtml;
    $('modalOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  },
  close() {
    $('modalOverlay').hidden = true;
    $('modalBody').innerHTML = '';
    $('modalFooter').innerHTML = '';
    document.body.style.overflow = '';
  },
};

// ── NAVIGATION ───────────────────────────────────────────
function navigate(screen) {
  State.currentScreen = screen;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === screen);
  });
  renderScreen(screen);
}

function renderScreen(screen) {
  const main = $('mainContent');
  main.innerHTML = '';

  // Remove old FAB if any
  const oldFab = document.querySelector('.fab');
  if (oldFab) oldFab.remove();

  switch (screen) {
    case 'today':    renderToday(main); break;
    case 'inbox':    renderInbox(main); break;
    case 'events':   renderEvents(main); break;
    case 'calendar': renderCalendar(main); break;
    case 'memories': renderMemories(main); break;
    case 'settings': renderSettings(main); break;
  }
}

// ── LOAD ALL DATA ────────────────────────────────────────
async function loadAllData() {
  [
    State.events,
    State.inboxItems,
    State.memories,
    State.milestones,
    State.people,
    State.spendingEntries,
  ] = await Promise.all([
    DB.getAll('events'),
    DB.getAll('inboxItems'),
    DB.getAll('memories'),
    DB.getAll('milestones'),
    DB.getAll('people'),
    DB.getAll('spendingEntries'),
  ]);
  // custom categories from settings
  const cats = await DB.getSetting('customCategories');
  State.customCategories = cats || [];
}

function allCategories() {
  return [...EVENT_CATEGORIES_DEFAULT, ...State.customCategories];
}

// ── INBOX BADGE ──────────────────────────────────────────
function updateInboxBadge() {
  const badge = $('inboxBadge');
  const count = State.inboxItems.length;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

// ════════════════════════════════════════════════════════
//  TODAY SCREEN
// ════════════════════════════════════════════════════════
function renderToday(container) {
  const screen = el('div', 'screen active');

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const greetDiv = el('div', 'today-greeting');
  greetDiv.innerHTML = `
    <div class="greeting-label">${escHtml(dateLabel)}</div>
    <div class="greeting-text">${escHtml(greeting)},<br>Family Ops</div>
  `;
  screen.appendChild(greetDiv);

  // Quick actions
  screen.appendChild(buildQuickActions());

  // Upcoming events (next 7 days)
  screen.appendChild(buildTodaySection(
    'Upcoming — Next 7 Days',
    buildUpcomingEvents()
  ));

  // Deadlines (events needing registration)
  screen.appendChild(buildTodaySection(
    'Needs Registration',
    buildDeadlineEvents()
  ));

  // Unread Inbox
  screen.appendChild(buildTodaySection(
    `Inbox (${State.inboxItems.length})`,
    buildInboxPreview()
  ));

  // Recent Memories
  screen.appendChild(buildTodaySection(
    'Recent Memories',
    buildRecentMemories()
  ));

  // Upcoming Milestones
  screen.appendChild(buildTodaySection(
    'Upcoming Milestones',
    buildUpcomingMilestones()
  ));

  container.appendChild(screen);
}

function buildQuickActions() {
  const wrap = el('div', '');
  wrap.innerHTML = `<div class="section-heading">Quick Actions</div>`;
  const grid = el('div', 'quick-actions');

  const actions = [
    { icon: '📅', label: 'Add Event',    sub: 'Create new event',    fn: () => openEventForm() },
    { icon: '🪄', label: 'Scan Flyer',   sub: 'AI photo → event',   fn: () => ScanFlyer.openScanModal(prefillEventForm) },
    { icon: '📝', label: 'Capture Note', sub: 'Quick inbox note',    fn: () => openInboxForm('Note') },
    { icon: '🏆', label: 'Add Milestone',sub: 'Track a milestone',   fn: () => openMilestoneForm() },
  ];

  actions.forEach(a => {
    const btn = el('button', 'quick-action-btn');
    btn.innerHTML = `
      <span class="qa-icon">${a.icon}</span>
      <span class="qa-label">${escHtml(a.label)}</span>
      <span class="qa-sub">${escHtml(a.sub)}</span>
    `;
    btn.addEventListener('click', a.fn);
    grid.appendChild(btn);
  });

  wrap.appendChild(grid);
  return wrap;
}

function buildTodaySection(title, content) {
  const sec = el('div', 'screen-section');
  sec.innerHTML = `<div class="section-heading">${escHtml(title)}</div>`;
  sec.appendChild(content);
  return sec;
}

function buildUpcomingEvents() {
  const today = todayStr();
  const end = daysFromNow(7);
  const upcoming = State.events
    .filter(e => e.date >= today && e.date <= end && e.status !== 'Cancelled' && e.status !== 'Missed')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  if (!upcoming.length) return emptyCard('No upcoming events', 'Add events on the Events tab');

  const wrap = el('div', '');
  upcoming.forEach(evt => wrap.appendChild(buildEventCard(evt, true)));
  return wrap;
}

function buildDeadlineEvents() {
  const deadline = State.events.filter(e =>
    (e.status === 'Interested' || e.status === 'Maybe') &&
    e.registrationInfo && e.registrationInfo.trim()
  );

  if (!deadline.length) return emptyCard('No pending registrations', 'Events marked Interested/Maybe with registration info appear here');

  const wrap = el('div', '');
  deadline.slice(0, 3).forEach(evt => wrap.appendChild(buildEventCard(evt, true)));
  return wrap;
}

function buildInboxPreview() {
  if (!State.inboxItems.length) return emptyCard('Inbox is empty', 'Capture notes, photos, and links quickly');

  const wrap = el('div', '');
  State.inboxItems.slice(-3).reverse().forEach(item => {
    wrap.appendChild(buildInboxCard(item));
  });
  return wrap;
}

function buildRecentMemories() {
  const attended = State.events.filter(e => e.status === 'Attended');
  const memoryMap = {};
  State.memories.forEach(m => { memoryMap[m.eventId] = m; });

  const recent = attended
    .filter(e => memoryMap[e.id])
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5);

  if (!recent.length) return emptyCard('No memories yet', 'Memories appear for events marked Attended');

  const wrap = el('div', '');
  recent.forEach(evt => {
    const mem = memoryMap[evt.id];
    const card = el('div', 'card');
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div style="font-family:var(--font-display);font-size:14px;font-weight:700;margin-bottom:4px;">${escHtml(evt.title)}</div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--slate-300);">${fmtDate(evt.date)}</div>
      ${mem.notes ? `<div style="font-size:13px;color:var(--slate-200);margin-top:8px;line-height:1.5;">${escHtml(mem.notes.slice(0,100))}${mem.notes.length>100?'…':''}</div>` : ''}
    `;
    card.addEventListener('click', () => openMemoryDetail(evt, mem));
    wrap.appendChild(card);
  });
  return wrap;
}

function buildUpcomingMilestones() {
  const today = todayStr();
  const upcoming = State.milestones
    .filter(m => m.status !== 'Completed' && m.status !== 'Cancelled' && m.targetDate >= today)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .slice(0, 3);

  if (!upcoming.length) return emptyCard('No upcoming milestones', 'Track important family milestones');

  const wrap = el('div', '');
  upcoming.forEach(m => wrap.appendChild(buildMilestoneCard(m)));
  return wrap;
}

function emptyCard(text, sub = '') {
  const c = el('div', 'card card-empty');
  c.innerHTML = `
    <div class="card-empty-text">${escHtml(text)}</div>
    ${sub ? `<div class="card-empty-sub">${escHtml(sub)}</div>` : ''}
  `;
  return c;
}

// ════════════════════════════════════════════════════════
//  INBOX SCREEN
// ════════════════════════════════════════════════════════
function renderInbox(container) {
  const screen = el('div', 'screen active');

  const heading = el('div', 'section-heading');
  heading.innerHTML = `Inbox <span style="color:var(--green-400)">(${State.inboxItems.length})</span>`;
  screen.appendChild(heading);

  if (!State.inboxItems.length) {
    screen.appendChild(emptyCard('Inbox is empty', 'Capture notes, photos, links and more'));
  } else {
    const wrap = el('div', '');
    [...State.inboxItems].reverse().forEach(item => {
      wrap.appendChild(buildInboxCard(item));
    });
    screen.appendChild(wrap);
  }

  container.appendChild(screen);

  // FAB
  addFab('+', () => openInboxForm());
}

function buildInboxCard(item) {
  const card = el('div', 'inbox-card');
  const icon = INBOX_ICONS[item.type] || '📄';
  card.innerHTML = `
    <div class="inbox-type-icon">${icon}</div>
    <div class="inbox-card-body">
      <div class="inbox-card-title">${escHtml(item.title || 'Untitled')}</div>
      <div class="inbox-card-meta">
        <span>${escHtml(item.type)}</span>
        <span>${fmtDate(item.createdDate)}</span>
      </div>
    </div>
  `;
  card.addEventListener('click', () => openInboxDetail(item));
  return card;
}

function openInboxForm(presetType) {
  const types = INBOX_TYPES.map(t =>
    `<option value="${t}" ${t === (presetType||'Note') ? 'selected' : ''}>${t}</option>`
  ).join('');

  Modal.open('Capture to Inbox', `
    <div class="form-group">
      <label class="form-label" for="inboxTitle">Title</label>
      <input class="form-input" id="inboxTitle" type="text" placeholder="What is this?" autocomplete="off" />
    </div>
    <div class="form-group">
      <label class="form-label" for="inboxType">Type</label>
      <select class="form-select" id="inboxType">${types}</select>
    </div>
    <div class="form-group">
      <label class="form-label" for="inboxNotes">Notes</label>
      <textarea class="form-textarea" id="inboxNotes" placeholder="Details, links, context…"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Attachment</label>
      <div class="file-input-wrap">
        <input type="file" id="inboxFile" accept="image/*,.pdf" />
        <div class="file-input-label">📎 Tap to attach file</div>
      </div>
      <div id="inboxFilePreview"></div>
    </div>
  `, `
    <button class="btn btn-secondary" id="inboxCancel">Cancel</button>
    <button class="btn btn-primary" id="inboxSave" style="flex:1">Save</button>
  `);

  $('inboxCancel').addEventListener('click', Modal.close);

  // File preview
  $('inboxFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        $('inboxFilePreview').innerHTML = `<div class="attachment-preview"><img src="${ev.target.result}" alt="preview"/></div>`;
      };
      reader.readAsDataURL(file);
    } else {
      $('inboxFilePreview').innerHTML = `<div style="margin-top:8px;font-family:var(--font-mono);font-size:11px;color:var(--slate-300);">📄 ${escHtml(file.name)}</div>`;
    }
    // Auto-fill title if empty
    if (!$('inboxTitle').value) {
      $('inboxTitle').value = file.name.replace(/\.[^.]+$/, '');
    }
  });

  $('inboxSave').addEventListener('click', async () => {
    const title = $('inboxTitle').value.trim();
    if (!title) { showToast('Please enter a title', true); return; }

    const fileInput = $('inboxFile');
    let attachmentData = null;

    if (fileInput.files[0]) {
      attachmentData = await fileToBase64(fileInput.files[0]);
    }

    const record = {
      title,
      type: $('inboxType').value,
      notes: $('inboxNotes').value.trim(),
      attachment: attachmentData,
      attachmentName: fileInput.files[0] ? fileInput.files[0].name : null,
      attachmentType: fileInput.files[0] ? fileInput.files[0].type : null,
      createdDate: todayStr(),
    };

    await DB.add('inboxItems', record);
    State.inboxItems = await DB.getAll('inboxItems');
    updateInboxBadge();
    Modal.close();
    showToast('Saved to Inbox');
    if (State.currentScreen === 'inbox') renderScreen('inbox');
    if (State.currentScreen === 'today') renderScreen('today');
  });
}

function openInboxDetail(item) {
  const icon = INBOX_ICONS[item.type] || '📄';
  let attachHtml = '';
  if (item.attachment) {
    if (item.attachmentType && item.attachmentType.startsWith('image/')) {
      attachHtml = `<div class="attachment-preview"><img src="${item.attachment}" alt="attachment"/></div>`;
    } else {
      attachHtml = `<div style="margin-top:8px;font-family:var(--font-mono);font-size:11px;color:var(--slate-300);">📄 ${escHtml(item.attachmentName || 'Attachment')}</div>`;
    }
  }

  Modal.open(`${icon} ${item.title || 'Untitled'}`, `
    <div class="detail-section">
      <div class="detail-label">Type</div>
      <div class="detail-value">${escHtml(item.type)}</div>
    </div>
    <div class="detail-section">
      <div class="detail-label">Created</div>
      <div class="detail-value">${fmtDate(item.createdDate)}</div>
    </div>
    ${item.notes ? `
    <div class="detail-section">
      <div class="detail-label">Notes</div>
      <div class="detail-value" style="white-space:pre-wrap;">${escHtml(item.notes)}</div>
    </div>` : ''}
    ${attachHtml}
  `, `
    <button class="btn btn-danger" id="inboxDelete">Delete</button>
    <button class="btn btn-secondary" style="flex:1" id="inboxDetailClose">Close</button>
  `);

  $('inboxDetailClose').addEventListener('click', Modal.close);
  $('inboxDelete').addEventListener('click', async () => {
    if (!confirm('Delete this inbox item?')) return;
    await DB.remove('inboxItems', item.id);
    State.inboxItems = await DB.getAll('inboxItems');
    updateInboxBadge();
    Modal.close();
    showToast('Deleted');
    if (State.currentScreen === 'inbox') renderScreen('inbox');
    if (State.currentScreen === 'today') renderScreen('today');
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ════════════════════════════════════════════════════════
//  EVENTS SCREEN
// ════════════════════════════════════════════════════════
function renderEvents(container) {
  const screen = el('div', 'screen active');

  // Search bar
  const searchBar = el('div', 'search-bar');
  searchBar.innerHTML = `
    <span class="search-icon">⌕</span>
    <input type="search" id="eventsSearch" placeholder="Search events…" value="${escHtml(State.eventsSearch)}" autocomplete="off" />
  `;
  screen.appendChild(searchBar);

  // Filter pills — status
  const filterRow = el('div', 'filter-row');
  const filters = ['All', ...EVENT_STATUSES];
  filters.forEach(f => {
    const pill = el('button', 'filter-pill' + (State.eventsFilter === f ? ' active' : ''), escHtml(f));
    pill.addEventListener('click', () => {
      State.eventsFilter = f;
      renderScreen('events');
    });
    filterRow.appendChild(pill);
  });
  screen.appendChild(filterRow);

  // Sort row
  const sortRow = el('div', '');
  sortRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:16px;';
  sortRow.innerHTML = `
    <span style="font-family:var(--font-mono);font-size:10px;color:var(--slate-400);text-transform:uppercase;letter-spacing:.06em;flex-shrink:0;">Sort</span>
    <select class="form-select" id="eventsSort" style="min-height:36px;font-size:13px;padding:6px 32px 6px 10px;">
      <option value="date" ${State.eventsSortBy==='date'?'selected':''}>Date</option>
      <option value="title" ${State.eventsSortBy==='title'?'selected':''}>Title</option>
      <option value="status" ${State.eventsSortBy==='status'?'selected':''}>Status</option>
    </select>
    <span style="font-family:var(--font-mono);font-size:10px;color:var(--slate-400);">${filteredEvents().length} events</span>
  `;
  screen.appendChild(sortRow);

  // Event list
  const list = el('div', '');
  const evts = filteredEvents();
  if (!evts.length) {
    list.appendChild(emptyCard('No events found', 'Try changing the filter or search term'));
  } else {
    evts.forEach(evt => list.appendChild(buildEventCard(evt)));
  }
  screen.appendChild(list);
  container.appendChild(screen);

  // Wire search
  $('eventsSearch').addEventListener('input', (e) => {
    State.eventsSearch = e.target.value;
    const list2 = screen.querySelector('.screen > div:last-child') || list;
    const evts2 = filteredEvents();
    list.innerHTML = '';
    if (!evts2.length) {
      list.appendChild(emptyCard('No events found', 'Try changing the filter or search term'));
    } else {
      evts2.forEach(evt => list.appendChild(buildEventCard(evt)));
    }
  });

  // Wire sort
  $('eventsSort').addEventListener('change', (e) => {
    State.eventsSortBy = e.target.value;
    list.innerHTML = '';
    const evts2 = filteredEvents();
    if (!evts2.length) {
      list.appendChild(emptyCard('No events found', 'Try a different sort'));
    } else {
      evts2.forEach(evt => list.appendChild(buildEventCard(evt)));
    }
  });

  // FAB
  addFab('+', () => openEventForm());
}

function filteredEvents() {
  let evts = [...State.events];

  if (State.eventsFilter !== 'All') {
    evts = evts.filter(e => e.status === State.eventsFilter);
  }

  if (State.eventsSearch.trim()) {
    const q = State.eventsSearch.toLowerCase();
    evts = evts.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.location || '').toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q)
    );
  }

  evts.sort((a, b) => {
    if (State.eventsSortBy === 'date')   return (a.date || '').localeCompare(b.date || '');
    if (State.eventsSortBy === 'title')  return (a.title || '').localeCompare(b.title || '');
    if (State.eventsSortBy === 'status') return (a.status || '').localeCompare(b.status || '');
    return 0;
  });

  return evts;
}

function buildEventCard(evt, compact = false) {
  const card = el('div', 'event-card');
  // Color left border by status
  const borderColors = {
    Interested: '#2575c8', Maybe: '#e88c00', Registered: '#22a05a',
    Attending: '#2dcc74', Attended: '#6b7f96', Missed: '#c0392b', Cancelled: '#2a4d73',
  };
  card.style.borderLeftColor = borderColors[evt.status] || 'var(--green-500)';

  card.innerHTML = `
    <div class="event-card-title">${escHtml(evt.title || 'Untitled Event')}</div>
    <div class="event-card-meta">
      ${statusBadge(evt.status)}
      <span class="event-card-date">${fmtDateShort(evt.date)}${evt.startTime ? ' · ' + fmtTime(evt.startTime) : ''}</span>
      ${evt.location ? `<span class="event-card-location">📍 ${escHtml(evt.location)}</span>` : ''}
      ${evt.category ? `<span class="badge" style="color:var(--slate-200);border-color:var(--navy-600);background:transparent;">${escHtml(evt.category)}</span>` : ''}
    </div>
  `;
  card.addEventListener('click', () => openEventDetail(evt));
  return card;
}

// ── EVENT FORM ───────────────────────────────────────────
function openEventForm(existing) {
  const cats = allCategories();
  const catOptions = cats.map(c => `<option value="${c}" ${existing && existing.category===c?'selected':''}>${escHtml(c)}</option>`).join('');
  const statusOptions = EVENT_STATUSES.map(s => `<option value="${s}" ${(existing ? existing.status===s : s==='Interested')?'selected':''}>${s}</option>`).join('');

  const v = existing || {};
  const isNew = !existing || !existing.id; // true for new events (including prefilled)

  Modal.open(existing && existing.id ? 'Edit Event' : 'New Event', `
    ${isNew ? `
    <div style="margin-bottom:16px;">
      <button class="btn btn-secondary btn-full" id="evtScanFlyerBtn" type="button" style="border-style:dashed;gap:8px;">
        <span style="font-size:16px;">🪄</span>
        <span>Scan a flyer to auto-fill this form</span>
      </button>
    </div>
    <div class="divider"></div>
    ` : ''}
    <div class="form-group">
      <label class="form-label" for="evtTitle">Title *</label>
      <input class="form-input" id="evtTitle" type="text" placeholder="Event name" value="${escHtml(v.title||'')}" autocomplete="off"/>
    </div>
    <div class="form-group">
      <label class="form-label" for="evtDesc">Description</label>
      <textarea class="form-textarea" id="evtDesc" placeholder="What is this event about?">${escHtml(v.description||'')}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="evtCategory">Category</label>
        <select class="form-select" id="evtCategory">${catOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label" for="evtStatus">Status</label>
        <select class="form-select" id="evtStatus">${statusOptions}</select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="evtDate">Date</label>
      <input class="form-input" id="evtDate" type="date" value="${escHtml(v.date||'')}"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="evtStart">Start Time</label>
        <input class="form-input" id="evtStart" type="time" value="${escHtml(v.startTime||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label" for="evtEnd">End Time</label>
        <input class="form-input" id="evtEnd" type="time" value="${escHtml(v.endTime||'')}"/>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="evtLocation">Location</label>
      <input class="form-input" id="evtLocation" type="text" placeholder="Venue or address" value="${escHtml(v.location||'')}" autocomplete="off"/>
    </div>
    <div class="form-group">
      <label class="form-label" for="evtCost">Cost Estimate ($)</label>
      <input class="form-input" id="evtCost" type="number" min="0" step="0.01" placeholder="0.00" value="${escHtml(v.costEstimate != null && v.costEstimate !== '' ? v.costEstimate : '')}"/>
    </div>
    <div class="form-group">
      <label class="form-label" for="evtAge">Age Restrictions</label>
      <input class="form-input" id="evtAge" type="text" placeholder="e.g. All ages, 18+" value="${escHtml(v.ageRestrictions||'')}" autocomplete="off"/>
    </div>
    <div class="form-group">
      <label class="form-label" for="evtReg">Registration Information</label>
      <textarea class="form-textarea" id="evtReg" placeholder="Deadline, URL, confirmation number…">${escHtml(v.registrationInfo||'')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label" for="evtNotes">Notes</label>
      <textarea class="form-textarea" id="evtNotes" placeholder="Anything else to remember…">${escHtml(v.notes||'')}</textarea>
    </div>
  `, `
    ${existing && existing.id ? `<button class="btn btn-danger" id="evtDelete">Delete</button>` : ''}
    <button class="btn btn-secondary" id="evtCancel">Cancel</button>
    <button class="btn btn-primary" id="evtSave" style="flex:1">Save</button>
  `);

  // Wire scan flyer button inside form
  if ($('evtScanFlyerBtn')) {
    $('evtScanFlyerBtn').addEventListener('click', () => {
      Modal.close();
      setTimeout(() => ScanFlyer.openScanModal(prefillEventForm), 120);
    });
  }

  $('evtCancel').addEventListener('click', Modal.close);

  if (existing) {
    $('evtDelete').addEventListener('click', async () => {
      if (!confirm('Delete this event? This will also remove associated spending entries and memories.')) return;
      await DB.remove('events', existing.id);
      // cascade
      const spending = await DB.getByIndex('spendingEntries', 'eventId', existing.id);
      for (const s of spending) await DB.remove('spendingEntries', s.id);
      const mems = await DB.getByIndex('memories', 'eventId', existing.id);
      for (const m of mems) await DB.remove('memories', m.id);
      await reloadAndRefresh();
      Modal.close();
      showToast('Event deleted');
    });
  }

  $('evtSave').addEventListener('click', async () => {
    const title = $('evtTitle').value.trim();
    if (!title) { showToast('Title is required', true); return; }

    const record = {
      ...(existing || {}),
      title,
      description: $('evtDesc').value.trim(),
      category: $('evtCategory').value,
      status: $('evtStatus').value,
      date: $('evtDate').value,
      startTime: $('evtStart').value,
      endTime: $('evtEnd').value,
      location: $('evtLocation').value.trim(),
      costEstimate: parseFloat($('evtCost').value) || 0,
      ageRestrictions: $('evtAge').value.trim(),
      registrationInfo: $('evtReg').value.trim(),
      notes: $('evtNotes').value.trim(),
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      await DB.put('events', record);
      showToast('Event updated');
    } else {
      record.createdAt = new Date().toISOString();
      await DB.add('events', record);
      showToast('Event created');
    }
    await reloadAndRefresh();
    Modal.close();
  });
}

// ── PREFILL EVENT FORM FROM SCAN ─────────────────────────
// Called by ScanFlyer after successful extraction.
// Maps extracted fields onto a fresh openEventForm call.
function prefillEventForm(data) {
  // Normalise category — match to known list or fall back to Other
  const cats = allCategories();
  let category = 'Other';
  if (data.category) {
    const match = cats.find(c => c.toLowerCase() === (data.category || '').toLowerCase());
    category = match || 'Other';
  }

  // Build a pseudo-existing object (no .id so form treats it as new)
  const prefilled = {
    title:            data.title            || '',
    description:      data.description      || '',
    category:         category,
    status:           'Interested',
    date:             data.date             || '',
    startTime:        data.startTime        || '',
    endTime:          data.endTime          || '',
    location:         data.location         || '',
    costEstimate:     data.costEstimate     != null ? data.costEstimate : '',
    ageRestrictions:  data.ageRestrictions  || '',
    registrationInfo: data.registrationInfo || '',
    notes:            data.notes            || '',
  };

  showToast('✓ Form pre-filled from flyer');
  openEventForm(prefilled);
}

// ── EVENT DETAIL ─────────────────────────────────────────
function openEventDetail(evt) {
  const spending = State.spendingEntries.filter(s => s.eventId === evt.id);
  const totalSpent = spending.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const memory = State.memories.find(m => m.eventId === evt.id);

  const spendingHtml = spending.length ? `
    <div class="detail-section">
      <div class="detail-label">Spending (${spending.length} entries)</div>
      ${spending.map(s => `
        <div class="spending-entry">
          <span class="spending-entry-cat">${escHtml(s.category)} · ${fmtDate(s.date)}</span>
          <span class="spending-entry-amt">${fmtCurrency(s.amount)}</span>
        </div>
      `).join('')}
      <div class="cost-total">
        <span class="cost-total-label">Event Total</span>
        <span class="cost-total-amt">${fmtCurrency(totalSpent)}</span>
      </div>
    </div>
  ` : '';

  Modal.open(escHtml(evt.title), `
    <div style="margin-bottom:12px;">${statusBadge(evt.status)} ${evt.category ? `<span class="badge" style="color:var(--slate-200);border-color:var(--navy-600);background:transparent;">${escHtml(evt.category)}</span>` : ''}</div>
    <div class="detail-grid" style="margin-bottom:16px;">
      <div>
        <div class="detail-label">Date</div>
        <div class="detail-value">${fmtDate(evt.date)}</div>
      </div>
      <div>
        <div class="detail-label">Time</div>
        <div class="detail-value">${evt.startTime ? fmtTime(evt.startTime) + (evt.endTime ? ' – ' + fmtTime(evt.endTime) : '') : '—'}</div>
      </div>
      ${evt.location ? `<div style="grid-column:1/-1;">
        <div class="detail-label">Location</div>
        <div class="detail-value">📍 ${escHtml(evt.location)}</div>
      </div>` : ''}
      ${evt.costEstimate ? `<div>
        <div class="detail-label">Cost Estimate</div>
        <div class="detail-value">${fmtCurrency(evt.costEstimate)}</div>
      </div>` : ''}
      ${evt.ageRestrictions ? `<div>
        <div class="detail-label">Age</div>
        <div class="detail-value">${escHtml(evt.ageRestrictions)}</div>
      </div>` : ''}
    </div>
    ${evt.description ? `<div class="detail-section"><div class="detail-label">Description</div><div class="detail-value" style="white-space:pre-wrap;">${escHtml(evt.description)}</div></div>` : ''}
    ${evt.registrationInfo ? `<div class="detail-section"><div class="detail-label">Registration</div><div class="detail-value" style="white-space:pre-wrap;">${escHtml(evt.registrationInfo)}</div></div>` : ''}
    ${evt.notes ? `<div class="detail-section"><div class="detail-label">Notes</div><div class="detail-value" style="white-space:pre-wrap;">${escHtml(evt.notes)}</div></div>` : ''}
    ${spendingHtml}
    ${memory ? `<div class="detail-section"><div class="detail-label">Memory</div><div class="detail-value" style="color:var(--green-400);cursor:pointer;" id="viewMemoryBtn">View Memory →</div></div>` : ''}
  `, `
    <button class="btn btn-ghost btn-sm" id="evtAddSpend">+ Spending</button>
    ${evt.status === 'Attended' ? `<button class="btn btn-ghost btn-sm" id="evtAddMemory">${memory ? '✦ Memory' : '+ Memory'}</button>` : ''}
    <button class="btn btn-secondary btn-sm" id="evtEditBtn">Edit</button>
  `);

  if ($('viewMemoryBtn')) {
    $('viewMemoryBtn').addEventListener('click', () => { Modal.close(); openMemoryDetail(evt, memory); });
  }
  $('evtEditBtn').addEventListener('click', () => { Modal.close(); openEventForm(evt); });
  $('evtAddSpend').addEventListener('click', () => { Modal.close(); openSpendingForm(evt); });
  if ($('evtAddMemory')) {
    $('evtAddMemory').addEventListener('click', () => { Modal.close(); openMemoryForm(evt, memory); });
  }
}

// ════════════════════════════════════════════════════════
//  SPENDING FORM
// ════════════════════════════════════════════════════════
function openSpendingForm(evt) {
  const catOptions = SPENDING_CATEGORIES.map(c => `<option value="${c}">${escHtml(c)}</option>`).join('');

  Modal.open(`Add Spending — ${escHtml(evt.title)}`, `
    <div class="form-group">
      <label class="form-label" for="spendDate">Date</label>
      <input class="form-input" id="spendDate" type="date" value="${todayStr()}"/>
    </div>
    <div class="form-group">
      <label class="form-label" for="spendAmt">Amount ($) *</label>
      <input class="form-input" id="spendAmt" type="number" min="0" step="0.01" placeholder="0.00"/>
    </div>
    <div class="form-group">
      <label class="form-label" for="spendCat">Category</label>
      <select class="form-select" id="spendCat">${catOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label" for="spendNotes">Notes</label>
      <textarea class="form-textarea" id="spendNotes" placeholder="Optional notes…"></textarea>
    </div>
  `, `
    <button class="btn btn-secondary" id="spendCancel">Cancel</button>
    <button class="btn btn-primary" id="spendSave" style="flex:1">Save</button>
  `);

  $('spendCancel').addEventListener('click', Modal.close);
  $('spendSave').addEventListener('click', async () => {
    const amt = parseFloat($('spendAmt').value);
    if (!amt || amt <= 0) { showToast('Enter a valid amount', true); return; }
    await DB.add('spendingEntries', {
      eventId: evt.id,
      date: $('spendDate').value,
      amount: amt,
      category: $('spendCat').value,
      notes: $('spendNotes').value.trim(),
    });
    await reloadAndRefresh();
    Modal.close();
    showToast('Spending added');
  });
}

// ════════════════════════════════════════════════════════
//  CALENDAR SCREEN
// ════════════════════════════════════════════════════════
function renderCalendar(container) {
  const screen = el('div', 'screen active');

  // Header with month nav
  const calHeader = el('div', 'calendar-header');
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const y = State.calendarYear;
  const m = State.calendarMonth;

  calHeader.innerHTML = `
    <button class="icon-btn" id="calPrev" aria-label="Previous month">‹</button>
    <div class="calendar-month">${monthNames[m]} ${y}</div>
    <button class="icon-btn" id="calNext" aria-label="Next month">›</button>
  `;
  screen.appendChild(calHeader);

  // Build grid
  const grid = el('div', 'calendar-grid');

  // Day labels
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
    const lbl = el('div', 'cal-day-label', d);
    grid.appendChild(lbl);
  });

  const today = todayStr();

  // Event dates set for fast lookup
  const eventDates = new Set(State.events.map(e => e.date));

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrev  = new Date(y, m, 0).getDate();

  // Prev month fill
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const dayEl = el('div', 'cal-day other-month', d);
    grid.appendChild(dayEl);
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let cls = 'cal-day';
    if (dateStr === today) cls += ' today';
    if (eventDates.has(dateStr)) cls += ' has-events';

    const dayEl = el('div', cls, d);
    dayEl.dataset.date = dateStr;
    dayEl.addEventListener('click', () => openCalendarDayModal(dateStr));
    grid.appendChild(dayEl);
  }

  // Next month fill
  const total = firstDay + daysInMonth;
  const remaining = (7 - (total % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const dayEl = el('div', 'cal-day other-month', d);
    grid.appendChild(dayEl);
  }

  screen.appendChild(grid);

  // Upcoming events list under calendar
  const sec = el('div', 'screen-section');
  sec.style.marginTop = '24px';
  sec.innerHTML = `<div class="section-heading">This Month</div>`;
  const monthEvts = State.events
    .filter(e => e.date && e.date.startsWith(`${y}-${String(m+1).padStart(2,'0')}`))
    .sort((a,b) => a.date.localeCompare(b.date));

  if (!monthEvts.length) {
    sec.appendChild(emptyCard('No events this month'));
  } else {
    monthEvts.forEach(evt => sec.appendChild(buildEventCard(evt)));
  }
  screen.appendChild(sec);
  container.appendChild(screen);

  // Nav
  $('calPrev').addEventListener('click', () => {
    State.calendarMonth--;
    if (State.calendarMonth < 0) { State.calendarMonth = 11; State.calendarYear--; }
    renderScreen('calendar');
  });
  $('calNext').addEventListener('click', () => {
    State.calendarMonth++;
    if (State.calendarMonth > 11) { State.calendarMonth = 0; State.calendarYear++; }
    renderScreen('calendar');
  });
}

function openCalendarDayModal(dateStr) {
  const dayEvts = State.events
    .filter(e => e.date === dateStr)
    .sort((a,b) => (a.startTime||'').localeCompare(b.startTime||''));

  const body = dayEvts.length
    ? dayEvts.map(evt => `
        <div class="event-card" style="cursor:pointer;" data-id="${evt.id}">
          <div class="event-card-title">${escHtml(evt.title)}</div>
          <div class="event-card-meta">
            ${statusBadge(evt.status)}
            ${evt.startTime ? `<span class="event-card-date">${fmtTime(evt.startTime)}</span>` : ''}
          </div>
        </div>
      `).join('')
    : '<div class="card card-empty"><div class="card-empty-text">No events this day</div></div>';

  Modal.open(fmtDate(dateStr), `
    ${body}
    <div style="margin-top:12px;">
      <button class="btn btn-primary btn-full" id="calAddEvt">+ Add Event on This Day</button>
    </div>
  `, '');

  // Wire event card clicks
  $('modalBody').querySelectorAll('.event-card[data-id]').forEach(card => {
    card.addEventListener('click', () => {
      const evt = State.events.find(e => e.id === Number(card.dataset.id));
      if (evt) { Modal.close(); openEventDetail(evt); }
    });
  });

  $('calAddEvt').addEventListener('click', () => {
    Modal.close();
    openEventForm({ date: dateStr });
  });
}

// ════════════════════════════════════════════════════════
//  MEMORIES SCREEN
// ════════════════════════════════════════════════════════
function renderMemories(container) {
  const screen = el('div', 'screen active');

  const attendedEvents = State.events
    .filter(e => e.status === 'Attended')
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const heading = el('div', 'section-heading');
  heading.innerHTML = `Memories <span style="color:var(--slate-400);font-size:10px;">(Attended events only)</span>`;
  screen.appendChild(heading);

  if (!attendedEvents.length) {
    screen.appendChild(emptyCard('No attended events yet', 'Mark events as "Attended" to create memories'));
    container.appendChild(screen);
    return;
  }

  const memoryMap = {};
  State.memories.forEach(m => { memoryMap[m.eventId] = m; });

  attendedEvents.forEach(evt => {
    const mem = memoryMap[evt.id];
    const card = el('div', 'card');
    card.style.cursor = 'pointer';

    const spending = State.spendingEntries.filter(s => s.eventId === evt.id);
    const totalSpent = spending.reduce((sum,s) => sum + (Number(s.amount)||0), 0);

    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <div>
          <div style="font-family:var(--font-display);font-size:15px;font-weight:700;color:var(--white);line-height:1.3;">${escHtml(evt.title)}</div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--slate-300);margin-top:2px;">${fmtDate(evt.date)}${evt.location ? ' · ' + escHtml(evt.location) : ''}</div>
        </div>
        <span class="badge badge-attended">Attended</span>
      </div>
      ${totalSpent > 0 ? `<div style="font-family:var(--font-mono);font-size:11px;color:var(--green-400);margin-bottom:6px;">💳 ${fmtCurrency(totalSpent)} total spent</div>` : ''}
      ${mem && mem.notes ? `<div style="font-size:13px;color:var(--slate-200);line-height:1.5;margin-bottom:8px;">${escHtml(mem.notes.slice(0,120))}${mem.notes.length>120?'…':''}</div>` : ''}
      <div style="font-family:var(--font-mono);font-size:11px;color:${mem?'var(--green-400)':'var(--slate-400)'};">${mem ? '✦ Memory added — tap to view' : '+ Tap to add memory'}</div>
    `;
    card.addEventListener('click', () => openMemoryDetail(evt, mem));
    screen.appendChild(card);
  });

  container.appendChild(screen);
}

// ── MEMORY DETAIL / FORM ─────────────────────────────────
async function openMemoryDetail(evt, mem) {
  const spending = State.spendingEntries.filter(s => s.eventId === evt.id);
  const totalSpent = spending.reduce((sum,s) => sum + (Number(s.amount)||0), 0);

  // Load attachments for this memory
  let attachments = [];
  if (mem) {
    attachments = await DB.getByIndex('attachments', 'parentId', mem.id);
  }

  const photoHtml = attachments.filter(a => a.mimeType && a.mimeType.startsWith('image/')).length
    ? `<div class="memory-gallery">${
        attachments
          .filter(a => a.mimeType && a.mimeType.startsWith('image/'))
          .map(a => `<div class="gallery-thumb"><img src="${a.data}" alt="memory photo" loading="lazy"/></div>`)
          .join('')
      }</div>`
    : '';

  const spendHtml = spending.length ? `
    <div class="detail-section">
      <div class="detail-label">Cost Summary</div>
      ${spending.map(s => `
        <div class="spending-entry">
          <span class="spending-entry-cat">${escHtml(s.category)}</span>
          <span class="spending-entry-amt">${fmtCurrency(s.amount)}</span>
        </div>
      `).join('')}
      <div class="cost-total">
        <span class="cost-total-label">Total</span>
        <span class="cost-total-amt">${fmtCurrency(totalSpent)}</span>
      </div>
    </div>
  ` : '';

  Modal.open(escHtml(evt.title), `
    <div class="detail-section">
      <div class="detail-label">Date</div>
      <div class="detail-value">${fmtDate(evt.date)}${evt.location ? ' · 📍 ' + escHtml(evt.location) : ''}</div>
    </div>
    ${photoHtml}
    ${mem && mem.notes ? `
      <div class="detail-section">
        <div class="detail-label">Notes</div>
        <div class="detail-value" style="white-space:pre-wrap;">${escHtml(mem.notes)}</div>
      </div>
    ` : '<div style="color:var(--slate-400);font-size:13px;margin-bottom:16px;">No memory notes yet.</div>'}
    ${spendHtml}
  `, `
    <button class="btn btn-secondary" id="memClose">Close</button>
    <button class="btn btn-primary" id="memEdit" style="flex:1">${mem ? 'Edit Memory' : '+ Add Memory'}</button>
  `);

  $('memClose').addEventListener('click', Modal.close);
  $('memEdit').addEventListener('click', () => { Modal.close(); openMemoryForm(evt, mem); });
}

function openMemoryForm(evt, existing) {
  Modal.open(existing ? 'Edit Memory' : 'Add Memory', `
    <div style="font-family:var(--font-mono);font-size:11px;color:var(--slate-300);margin-bottom:16px;">For: ${escHtml(evt.title)} · ${fmtDate(evt.date)}</div>
    <div class="form-group">
      <label class="form-label" for="memNotes">Memory Notes</label>
      <textarea class="form-textarea" id="memNotes" style="min-height:120px;" placeholder="What happened? What was memorable?">${escHtml(existing && existing.notes ? existing.notes : '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Add Photos</label>
      <div class="file-input-wrap">
        <input type="file" id="memPhotos" accept="image/*" multiple />
        <div class="file-input-label">📷 Tap to add photos</div>
      </div>
      <div id="memPhotoPreview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;"></div>
    </div>
  `, `
    <button class="btn btn-secondary" id="memFormCancel">Cancel</button>
    <button class="btn btn-primary" id="memFormSave" style="flex:1">Save Memory</button>
  `);

  $('memFormCancel').addEventListener('click', Modal.close);

  $('memPhotos').addEventListener('change', (e) => {
    const preview = $('memPhotoPreview');
    Array.from(e.target.files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = document.createElement('img');
        img.src = ev.target.result;
        img.style.cssText = 'width:72px;height:72px;object-fit:cover;border-radius:6px;';
        preview.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  });

  $('memFormSave').addEventListener('click', async () => {
    const notes = $('memNotes').value.trim();
    let memRecord;

    if (existing) {
      memRecord = { ...existing, notes, updatedAt: new Date().toISOString() };
      await DB.put('memories', memRecord);
    } else {
      memRecord = await DB.add('memories', {
        eventId: evt.id,
        notes,
        createdDate: todayStr(),
      });
    }

    // Save photos as attachments
    const files = $('memPhotos').files;
    if (files && files.length) {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const data = await fileToBase64(file);
        await DB.add('attachments', {
          parentId: memRecord.id,
          parentType: 'memory',
          mimeType: file.type,
          name: file.name,
          data,
          createdAt: new Date().toISOString(),
        });
      }
    }

    await reloadAndRefresh();
    Modal.close();
    showToast('Memory saved');
  });
}

// ════════════════════════════════════════════════════════
//  MILESTONE SCREEN (inside Settings sub-nav or standalone)
//  Rendered as a card list in Settings > Milestones tab
// ════════════════════════════════════════════════════════
function buildMilestoneCard(m) {
  const card = el('div', 'milestone-card');
  card.style.cursor = 'pointer';
  card.innerHTML = `
    <div class="milestone-header">
      <div>
        <div class="milestone-title">${escHtml(m.title)}</div>
        <div class="milestone-meta">${escHtml(m.category)} · Target: ${fmtDate(m.targetDate)}</div>
      </div>
      ${statusBadge(m.status)}
    </div>
    ${m.notes ? `<div style="font-size:13px;color:var(--slate-300);line-height:1.5;margin-top:4px;">${escHtml(m.notes.slice(0,80))}${m.notes.length>80?'…':''}</div>` : ''}
  `;
  card.addEventListener('click', () => openMilestoneForm(m));
  return card;
}

function openMilestoneForm(existing) {
  const catOptions = MILESTONE_CATEGORIES.map(c => `<option value="${c}" ${existing && existing.category===c?'selected':''}>${escHtml(c)}</option>`).join('');
  const statusOptions = MILESTONE_STATUSES.map(s => `<option value="${s}" ${(existing ? existing.status===s : s==='Not Started')?'selected':''}>${s}</option>`).join('');
  const v = existing || {};

  Modal.open(existing ? 'Edit Milestone' : 'New Milestone', `
    <div class="form-group">
      <label class="form-label" for="msTitle">Title *</label>
      <input class="form-input" id="msTitle" type="text" placeholder="Milestone name" value="${escHtml(v.title||'')}" autocomplete="off"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="msCat">Category</label>
        <select class="form-select" id="msCat">${catOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label" for="msStatus">Status</label>
        <select class="form-select" id="msStatus">${statusOptions}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="msTarget">Target Date</label>
        <input class="form-input" id="msTarget" type="date" value="${escHtml(v.targetDate||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label" for="msActual">Actual Date</label>
        <input class="form-input" id="msActual" type="date" value="${escHtml(v.actualDate||'')}"/>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="msNotes">Notes</label>
      <textarea class="form-textarea" id="msNotes" placeholder="Details, contacts, requirements…">${escHtml(v.notes||'')}</textarea>
    </div>
  `, `
    ${existing ? `<button class="btn btn-danger" id="msDelete">Delete</button>` : ''}
    <button class="btn btn-secondary" id="msCancel">Cancel</button>
    <button class="btn btn-primary" id="msSave" style="flex:1">Save</button>
  `);

  $('msCancel').addEventListener('click', Modal.close);
  if (existing) {
    $('msDelete').addEventListener('click', async () => {
      if (!confirm('Delete this milestone?')) return;
      await DB.remove('milestones', existing.id);
      await reloadAndRefresh();
      Modal.close();
      showToast('Milestone deleted');
    });
  }
  $('msSave').addEventListener('click', async () => {
    const title = $('msTitle').value.trim();
    if (!title) { showToast('Title is required', true); return; }
    const record = {
      ...(existing||{}),
      title,
      category: $('msCat').value,
      status: $('msStatus').value,
      targetDate: $('msTarget').value,
      actualDate: $('msActual').value,
      notes: $('msNotes').value.trim(),
    };
    if (existing) {
      await DB.put('milestones', record);
      showToast('Milestone updated');
    } else {
      await DB.add('milestones', record);
      showToast('Milestone created');
    }
    await reloadAndRefresh();
    Modal.close();
    if (State.currentScreen === 'settings') renderScreen('settings');
  });
}

// ════════════════════════════════════════════════════════
//  SETTINGS SCREEN
// ════════════════════════════════════════════════════════
function renderSettings(container) {
  const screen = el('div', 'screen active');

  // Inner tabs
  const tabBar = el('div', 'inner-tabs');
  const tabs = [
    { id: 'tab-family',     label: 'Family' },
    { id: 'tab-milestones', label: 'Milestones' },
    { id: 'tab-spending',   label: 'Spending' },
    { id: 'tab-backup',     label: 'Backup' },
    { id: 'tab-info',       label: 'Info' },
  ];

  let activeTab = State._settingsTab || 'tab-family';

  tabs.forEach(t => {
    const btn = el('button', 'inner-tab' + (t.id === activeTab ? ' active' : ''), t.label);
    btn.addEventListener('click', () => {
      State._settingsTab = t.id;
      renderScreen('settings');
    });
    tabBar.appendChild(btn);
  });
  screen.appendChild(tabBar);

  const body = el('div', '');
  switch (activeTab) {
    case 'tab-family':     renderFamilyTab(body);     break;
    case 'tab-milestones': renderMilestonesTab(body); break;
    case 'tab-spending':   renderSpendingTab(body);   break;
    case 'tab-backup':     renderBackupTab(body);     break;
    case 'tab-info':       renderInfoTab(body);       break;
  }
  screen.appendChild(body);
  container.appendChild(screen);
}

// ── FAMILY TAB ───────────────────────────────────────────
function renderFamilyTab(container) {
  // People
  const sec1 = el('div', 'settings-section');
  sec1.innerHTML = `<div class="settings-section-title">Family Members</div>`;

  if (State.people.length) {
    State.people.forEach(p => {
      const item = el('div', 'settings-item');
      item.innerHTML = `
        <div class="person-avatar">${(p.name||'?')[0].toUpperCase()}</div>
        <div style="flex:1;">
          <div class="settings-item-label">${escHtml(p.name)}</div>
          <div class="settings-item-sub">${escHtml(p.role||'')}</div>
        </div>
        <span class="settings-item-action">›</span>
      `;
      item.addEventListener('click', () => openPersonForm(p));
      sec1.appendChild(item);
    });
  } else {
    sec1.appendChild(emptyCard('No family members added'));
  }

  const addPersonBtn = el('button', 'btn btn-secondary btn-full', '+ Add Family Member');
  addPersonBtn.style.marginTop = '12px';
  addPersonBtn.addEventListener('click', () => openPersonForm());
  sec1.appendChild(addPersonBtn);
  container.appendChild(sec1);

  // Categories
  const sec2 = el('div', 'settings-section');
  sec2.innerHTML = `<div class="settings-section-title">Event Categories</div>`;

  const allCats = allCategories();
  allCats.forEach(cat => {
    const isCustom = State.customCategories.includes(cat);
    const item = el('div', 'settings-item');
    item.style.cursor = isCustom ? 'pointer' : 'default';
    item.innerHTML = `
      <div class="settings-item-label">${escHtml(cat)}</div>
      ${isCustom ? '<button class="btn btn-danger btn-sm" style="min-height:32px;">Remove</button>' : '<span class="settings-item-sub">Default</span>'}
    `;
    if (isCustom) {
      item.querySelector('button').addEventListener('click', async (e) => {
        e.stopPropagation();
        State.customCategories = State.customCategories.filter(c => c !== cat);
        await DB.setSetting('customCategories', State.customCategories);
        renderScreen('settings');
      });
    }
    sec2.appendChild(item);
  });

  const addCatBtn = el('button', 'btn btn-secondary btn-full', '+ Add Category');
  addCatBtn.style.marginTop = '12px';
  addCatBtn.addEventListener('click', () => {
    const name = prompt('New category name:');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (allCategories().includes(trimmed)) { showToast('Category already exists', true); return; }
    State.customCategories.push(trimmed);
    DB.setSetting('customCategories', State.customCategories).then(() => renderScreen('settings'));
  });
  sec2.appendChild(addCatBtn);
  container.appendChild(sec2);
}

function openPersonForm(existing) {
  const v = existing || {};
  Modal.open(existing ? 'Edit Family Member' : 'Add Family Member', `
    <div class="form-group">
      <label class="form-label" for="personName">Name *</label>
      <input class="form-input" id="personName" type="text" placeholder="Full name" value="${escHtml(v.name||'')}" autocomplete="off"/>
    </div>
    <div class="form-group">
      <label class="form-label" for="personRole">Role</label>
      <input class="form-input" id="personRole" type="text" placeholder="e.g. Parent, Child, Guardian" value="${escHtml(v.role||'')}" autocomplete="off"/>
    </div>
    <div class="form-group">
      <label class="form-label" for="personDob">Date of Birth</label>
      <input class="form-input" id="personDob" type="date" value="${escHtml(v.dob||'')}"/>
    </div>
    <div class="form-group">
      <label class="form-label" for="personNotes">Notes</label>
      <textarea class="form-textarea" id="personNotes" placeholder="Allergies, preferences, important info…">${escHtml(v.notes||'')}</textarea>
    </div>
  `, `
    ${existing ? `<button class="btn btn-danger" id="personDelete">Delete</button>` : ''}
    <button class="btn btn-secondary" id="personCancel">Cancel</button>
    <button class="btn btn-primary" id="personSave" style="flex:1">Save</button>
  `);

  $('personCancel').addEventListener('click', Modal.close);
  if (existing) {
    $('personDelete').addEventListener('click', async () => {
      if (!confirm('Remove this family member?')) return;
      await DB.remove('people', existing.id);
      State.people = await DB.getAll('people');
      Modal.close();
      renderScreen('settings');
      showToast('Removed');
    });
  }
  $('personSave').addEventListener('click', async () => {
    const name = $('personName').value.trim();
    if (!name) { showToast('Name is required', true); return; }
    const record = { ...(existing||{}), name, role: $('personRole').value.trim(), dob: $('personDob').value, notes: $('personNotes').value.trim() };
    if (existing) { await DB.put('people', record); showToast('Updated'); }
    else { await DB.add('people', record); showToast('Added'); }
    State.people = await DB.getAll('people');
    Modal.close();
    renderScreen('settings');
  });
}

// ── MILESTONES TAB ───────────────────────────────────────
function renderMilestonesTab(container) {
  const sec = el('div', 'settings-section');
  sec.innerHTML = `<div class="settings-section-title">Milestone Tracker</div>`;

  if (!State.milestones.length) {
    sec.appendChild(emptyCard('No milestones yet', 'Track education, medical, government deadlines and more'));
  } else {
    const sorted = [...State.milestones].sort((a,b) => (a.targetDate||'').localeCompare(b.targetDate||''));
    sorted.forEach(m => sec.appendChild(buildMilestoneCard(m)));
  }

  const addBtn = el('button', 'btn btn-secondary btn-full', '+ Add Milestone');
  addBtn.style.marginTop = '12px';
  addBtn.addEventListener('click', () => openMilestoneForm());
  sec.appendChild(addBtn);
  container.appendChild(sec);
}

// ── SPENDING TAB ─────────────────────────────────────────
function renderSpendingTab(container) {
  const sec = el('div', 'settings-section');
  sec.innerHTML = `<div class="settings-section-title">Spending Overview</div>`;

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const yearPrefix  = `${now.getFullYear()}`;

  const monthTotal = State.spendingEntries
    .filter(s => s.date && s.date.startsWith(monthPrefix))
    .reduce((sum,s) => sum + (Number(s.amount)||0), 0);

  const yearTotal  = State.spendingEntries
    .filter(s => s.date && s.date.startsWith(yearPrefix))
    .reduce((sum,s) => sum + (Number(s.amount)||0), 0);

  const allTotal = State.spendingEntries.reduce((sum,s) => sum + (Number(s.amount)||0), 0);

  const summaryCard = el('div', 'card');
  summaryCard.innerHTML = `
    <div class="spending-row">
      <span class="spending-label">This Month</span>
      <span class="spending-amount">${fmtCurrency(monthTotal)}</span>
    </div>
    <div class="spending-row">
      <span class="spending-label">This Year</span>
      <span class="spending-amount">${fmtCurrency(yearTotal)}</span>
    </div>
    <div class="spending-row">
      <span class="spending-label">All Time</span>
      <span class="spending-amount">${fmtCurrency(allTotal)}</span>
    </div>
  `;
  sec.appendChild(summaryCard);

  // Spending by category chart
  if (State.spendingEntries.length) {
    const byCategory = {};
    SPENDING_CATEGORIES.forEach(c => { byCategory[c] = 0; });
    State.spendingEntries.forEach(s => {
      if (byCategory[s.category] !== undefined) byCategory[s.category] += Number(s.amount)||0;
      else byCategory['Miscellaneous'] = (byCategory['Miscellaneous']||0) + (Number(s.amount)||0);
    });

    const maxVal = Math.max(...Object.values(byCategory), 1);

    const chartSec = el('div', 'settings-section');
    chartSec.innerHTML = `<div class="settings-section-title">By Category</div>`;

    const chartCard = el('div', 'card');
    const barChart = el('div', 'bar-chart');
    Object.entries(byCategory).forEach(([cat, val]) => {
      if (!val) return;
      const pct = Math.round((val / maxVal) * 100);
      const wrap = el('div', 'bar-wrap');
      wrap.innerHTML = `
        <div class="bar" style="height:${pct}%;"></div>
        <div class="bar-label">${cat.split(' ')[0]}</div>
      `;
      barChart.appendChild(wrap);
    });
    chartCard.appendChild(barChart);

    // Legend
    const legend = el('div', '');
    legend.style.marginTop = '12px';
    Object.entries(byCategory).forEach(([cat, val]) => {
      if (!val) return;
      const row = el('div', 'spending-row');
      row.innerHTML = `
        <span class="spending-label">${escHtml(cat)}</span>
        <span class="spending-amount">${fmtCurrency(val)}</span>
      `;
      legend.appendChild(row);
    });
    chartCard.appendChild(legend);
    chartSec.appendChild(chartCard);
    sec.appendChild(chartSec);

    // Per-event spending
    const evtSec = el('div', 'settings-section');
    evtSec.innerHTML = `<div class="settings-section-title">By Event</div>`;

    const byEvent = {};
    State.spendingEntries.forEach(s => {
      byEvent[s.eventId] = (byEvent[s.eventId]||0) + (Number(s.amount)||0);
    });

    const eventEntries = Object.entries(byEvent)
      .map(([id, total]) => ({ evt: State.events.find(e => e.id === Number(id)), total }))
      .filter(x => x.evt)
      .sort((a,b) => b.total - a.total);

    if (eventEntries.length) {
      const evtCard = el('div', 'card');
      eventEntries.forEach(({ evt, total }) => {
        const row = el('div', 'spending-row');
        row.innerHTML = `
          <span class="spending-label" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(evt.title)}</span>
          <span class="spending-amount">${fmtCurrency(total)}</span>
        `;
        evtCard.appendChild(row);
      });
      evtSec.appendChild(evtCard);
      sec.appendChild(evtSec);
    }
  }

  container.appendChild(sec);
}

// ── BACKUP TAB ───────────────────────────────────────────
function renderBackupTab(container) {
  const sec = el('div', 'settings-section');
  sec.innerHTML = `<div class="settings-section-title">Backup &amp; Restore</div>`;

  // Warning
  const warn = el('div', 'warning-box');
  warn.innerHTML = `<strong>⚠ Important</strong>This app stores data locally in your browser's IndexedDB. If you clear browser data, ALL family records will be permanently lost. Export a backup regularly.`;
  sec.appendChild(warn);

  sec.appendChild(el('div', 'divider'));

  // Export
  const exportCard = el('div', 'card');
  exportCard.innerHTML = `
    <div style="font-family:var(--font-display);font-size:14px;font-weight:700;margin-bottom:4px;">Export Backup</div>
    <div style="font-family:var(--font-mono);font-size:11px;color:var(--slate-300);margin-bottom:12px;">Downloads a complete JSON backup of all your data.</div>
  `;
  const exportBtn = el('button', 'btn btn-primary btn-full', '⬇ Export JSON Backup');
  exportBtn.addEventListener('click', async () => {
    exportBtn.textContent = 'Exporting…';
    exportBtn.disabled = true;
    const result = await Backup.exportBackup();
    exportBtn.textContent = '⬇ Export JSON Backup';
    exportBtn.disabled = false;
    if (result.success) showToast(`Saved: ${result.filename}`);
    else showToast('Export failed: ' + result.error, true);
  });
  exportCard.appendChild(exportBtn);
  sec.appendChild(exportCard);

  // Import
  const importCard = el('div', 'card');
  importCard.style.marginTop = '12px';
  importCard.innerHTML = `
    <div style="font-family:var(--font-display);font-size:14px;font-weight:700;margin-bottom:4px;">Restore from Backup</div>
    <div style="font-family:var(--font-mono);font-size:11px;color:var(--amber-200);margin-bottom:12px;">⚠ This will overwrite all existing data.</div>
    <div class="file-input-wrap" id="importWrap">
      <input type="file" id="importFile" accept=".json"/>
      <div class="file-input-label">📂 Select backup .json file</div>
    </div>
    <div id="importFileName" style="margin-top:8px;font-family:var(--font-mono);font-size:11px;color:var(--slate-300);"></div>
  `;
  const importBtn = el('button', 'btn btn-secondary btn-full', '⬆ Restore Backup');
  importBtn.style.marginTop = '12px';
  importCard.appendChild(importBtn);
  sec.appendChild(importCard);

  container.appendChild(sec);

  // Wire import
  setTimeout(() => {
    const fileInput = $('importFile');
    if (!fileInput) return;

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) $('importFileName').textContent = `Selected: ${file.name}`;
    });

    importBtn.addEventListener('click', async () => {
      const file = $('importFile').files[0];
      if (!file) { showToast('Please select a backup file first', true); return; }
      if (!confirm('This will overwrite ALL existing family data with the backup. Are you sure?')) return;

      importBtn.textContent = 'Restoring…';
      importBtn.disabled = true;
      try {
        await Backup.importBackup(file);
        await reloadAndRefresh();
        showToast('Backup restored successfully');
      } catch (err) {
        showToast('Restore failed: ' + err.message, true);
      }
      importBtn.textContent = '⬆ Restore Backup';
      importBtn.disabled = false;
    });
  }, 50);
}

// ── INFO TAB ─────────────────────────────────────────────
function renderInfoTab(container) {
  const sec = el('div', 'settings-section');
  sec.innerHTML = `<div class="settings-section-title">Storage Information</div>`;

  // Storage info (async load)
  const infoCard = el('div', 'storage-info');
  infoCard.innerHTML = '<div class="spinner"></div>';
  sec.appendChild(infoCard);

  Backup.getStorageInfo().then(info => {
    const rows = [
      ['Events',          info.counts.events],
      ['Inbox Items',     info.counts.inboxItems],
      ['Memories',        info.counts.memories],
      ['Spending Entries',info.counts.spendingEntries],
      ['Milestones',      info.counts.milestones],
      ['People',          info.counts.people],
      ['Attachments',     info.counts.attachments],
      ['Est. Size',       info.estimatedKB + ' KB'],
    ];
    infoCard.innerHTML = rows.map(([k,v]) => `
      <div class="storage-row">
        <span class="storage-key">${escHtml(k)}</span>
        <span class="storage-val">${escHtml(String(v))}</span>
      </div>
    `).join('');
  });

  // Offline notice
  const noticeSec = el('div', 'settings-section');
  noticeSec.innerHTML = `<div class="settings-section-title">Offline Status</div>`;
  const noticeCard = el('div', 'warning-box');
  noticeCard.innerHTML = `
    <strong>LOCAL ONLY — NO CLOUD SYNC</strong>
    • All data is stored on this device only<br>
    • No internet connection required after first load<br>
    • Data may be lost if browser storage is cleared<br>
    • Export a backup regularly to keep your data safe
  `;
  noticeSec.appendChild(noticeCard);

  // App info
  const appSec = el('div', 'settings-section');
  appSec.innerHTML = `<div class="settings-section-title">Application</div>`;
  const appCard = el('div', 'storage-info');
  appCard.innerHTML = `
    <div class="storage-row"><span class="storage-key">App</span><span class="storage-val">Family Operations Center</span></div>
    <div class="storage-row"><span class="storage-key">Version</span><span class="storage-val">1.0.0</span></div>
    <div class="storage-row"><span class="storage-key">Database</span><span class="storage-val">FamilyOperationsDB v1</span></div>
    <div class="storage-row"><span class="storage-key">Storage</span><span class="storage-val">IndexedDB (Local)</span></div>
    <div class="storage-row"><span class="storage-key">PWA</span><span class="storage-val">Offline-capable</span></div>
  `;
  appSec.appendChild(appCard);

  // Seed data
  const seedSec = el('div', 'settings-section');
  seedSec.innerHTML = `<div class="settings-section-title">Developer</div>`;
  const seedBtn = el('button', 'btn btn-secondary btn-full', '🌱 Load Sample Data');
  seedBtn.addEventListener('click', async () => {
    if (!confirm('Load sample family members, events, and milestones? This will ADD records to your existing data.')) return;
    await seedData();
    await reloadAndRefresh();
    showToast('Sample data loaded');
    renderScreen('settings');
  });
  seedSec.appendChild(seedBtn);

  // AI / Flyer Scanner section
  const aiSec = el('div', 'settings-section');
  aiSec.innerHTML = `<div class="settings-section-title">AI — Flyer Scanner</div>`;

  const hasKey = !!(localStorage.getItem('foc_api_key'));
  const aiCard = el('div', 'card');
  aiCard.innerHTML = `
    <div style="font-family:var(--font-display);font-size:14px;font-weight:700;margin-bottom:4px;">Anthropic API Key</div>
    <div style="font-family:var(--font-mono);font-size:11px;color:var(--slate-300);margin-bottom:12px;line-height:1.6;">
      Required for the 🪄 Scan Flyer feature. Stored only on this device.
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="font-family:var(--font-mono);font-size:11px;color:${hasKey ? 'var(--green-400)' : 'var(--amber-200)'};">
        ${hasKey ? '✓ API key saved' : '⚠ No API key set'}
      </span>
    </div>
  `;

  const keyBtnRow = el('div', '');
  keyBtnRow.style.cssText = 'display:flex;gap:8px;';

  const setKeyBtn = el('button', 'btn btn-primary', hasKey ? '🔑 Update Key' : '🔑 Set API Key');
  setKeyBtn.style.flex = '1';
  setKeyBtn.addEventListener('click', () => {
    ScanFlyer.openApiKeySetup(() => renderScreen('settings'));
  });
  keyBtnRow.appendChild(setKeyBtn);

  if (hasKey) {
    const clearKeyBtn = el('button', 'btn btn-danger btn-sm', 'Remove');
    clearKeyBtn.addEventListener('click', () => {
      if (!confirm('Remove your saved API key?')) return;
      localStorage.removeItem('foc_api_key');
      showToast('API key removed');
      renderScreen('settings');
    });
    keyBtnRow.appendChild(clearKeyBtn);
  }

  aiCard.appendChild(keyBtnRow);
  aiSec.appendChild(aiCard);

  container.appendChild(sec);
  container.appendChild(aiSec);
  container.appendChild(noticeSec);
  container.appendChild(appSec);
  container.appendChild(seedSec);
}

// ════════════════════════════════════════════════════════
//  FAB HELPER
// ════════════════════════════════════════════════════════
function addFab(label, onClick) {
  const fab = el('button', 'fab', label);
  fab.setAttribute('aria-label', 'Add new');
  fab.addEventListener('click', onClick);
  document.getElementById('app').appendChild(fab);
}

// ════════════════════════════════════════════════════════
//  RELOAD & REFRESH
// ════════════════════════════════════════════════════════
async function reloadAndRefresh() {
  await loadAllData();
  updateInboxBadge();
  renderScreen(State.currentScreen);
}

// ════════════════════════════════════════════════════════
//  SEED DATA
// ════════════════════════════════════════════════════════
async function seedData() {
  // 3 family members
  await DB.add('people', { name: 'Alex Johnson', role: 'Parent', dob: '1985-03-14', notes: 'Primary account holder' });
  await DB.add('people', { name: 'Jordan Johnson', role: 'Parent', dob: '1987-07-22', notes: '' });
  await DB.add('people', { name: 'Riley Johnson', role: 'Child', dob: '2014-11-05', notes: 'Peanut allergy' });

  const today = todayStr();
  const future1 = daysFromNow(4);
  const future2 = daysFromNow(12);
  const future3 = daysFromNow(25);
  const past1   = daysFromNow(-10);
  const past2   = daysFromNow(-30);

  // 5 events
  const e1 = await DB.add('events', {
    title: 'Riley\'s Soccer Tournament', category: 'Sports', status: 'Registered',
    date: future1, startTime: '09:00', endTime: '17:00',
    location: 'Riverside Sports Complex', costEstimate: 75,
    ageRestrictions: 'Under 12', registrationInfo: 'Registered online — confirm. #2847',
    description: 'Regional youth soccer tournament, 4 games.', notes: 'Bring sunscreen and extra water.',
    createdAt: new Date().toISOString(),
  });
  const e2 = await DB.add('events', {
    title: 'School Spring Concert', category: 'Music', status: 'Attending',
    date: future2, startTime: '18:30', endTime: '20:00',
    location: 'Lincoln Middle School Auditorium', costEstimate: 0,
    description: 'Annual spring music concert — Riley has a solo piece.',
    createdAt: new Date().toISOString(),
  });
  const e3 = await DB.add('events', {
    title: 'Community Fun Run 5K', category: 'Community', status: 'Interested',
    date: future3, startTime: '08:00',
    location: 'Elmwood Park', costEstimate: 35,
    registrationInfo: 'Registration closes May 20 — cityrun.org',
    createdAt: new Date().toISOString(),
  });
  const e4 = await DB.add('events', {
    title: 'Science Museum Trip', category: 'Academic', status: 'Attended',
    date: past1, startTime: '10:00', endTime: '16:00',
    location: 'Natural History Science Museum', costEstimate: 90,
    description: 'Family day at the science museum.',
    createdAt: new Date().toISOString(),
  });
  const e5 = await DB.add('events', {
    title: 'Holiday Craft Fair', category: 'Community', status: 'Attended',
    date: past2, startTime: '11:00',
    location: 'Downtown Convention Center', costEstimate: 40,
    createdAt: new Date().toISOString(),
  });

  // Spending for attended events
  await DB.add('spendingEntries', { eventId: e4.id, date: past1, amount: 45, category: 'Tickets', notes: 'Adult x2' });
  await DB.add('spendingEntries', { eventId: e4.id, date: past1, amount: 22, category: 'Food', notes: 'Café lunch' });
  await DB.add('spendingEntries', { eventId: e4.id, date: past1, amount: 12, category: 'Parking', notes: 'Garage' });
  await DB.add('spendingEntries', { eventId: e5.id, date: past2, amount: 18, category: 'Miscellaneous', notes: 'Craft kits' });
  await DB.add('spendingEntries', { eventId: e5.id, date: past2, amount: 14, category: 'Food', notes: 'Snacks' });

  // 2 memories
  await DB.add('memories', {
    eventId: e4.id, notes: 'Riley was fascinated by the space exhibit. She spent 45 minutes at the planetarium dome. Definitely coming back next year.',
    createdDate: past1,
  });
  await DB.add('memories', {
    eventId: e5.id, notes: 'Great afternoon. Picked up a handmade wreath and some local honey. Riley loved the ornament-making station.',
    createdDate: past2,
  });

  // 3 milestones
  await DB.add('milestones', {
    title: 'Riley\'s Annual Physical', category: 'Medical', status: 'Not Started',
    targetDate: daysFromNow(45), notes: 'Due by end of school year. Call Dr. Patel\'s office.',
  });
  await DB.add('milestones', {
    title: 'Passport Renewal — Alex', category: 'Government', status: 'In Progress',
    targetDate: daysFromNow(60), actualDate: '', notes: 'Application submitted. Awaiting processing.',
  });
  await DB.add('milestones', {
    title: 'Middle School Enrollment', category: 'Education', status: 'Not Started',
    targetDate: daysFromNow(90), notes: 'Open enrollment window: Aug 1–15. Research charter options.',
  });
}

// ════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════
async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  }

  // Open DB
  await DB.open();

  // Load all data
  await loadAllData();

  // Update badge
  updateInboxBadge();

  // Bottom nav delegation
  document.querySelector('.bottom-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (btn && btn.dataset.screen) navigate(btn.dataset.screen);
  });

  // Modal close
  $('modalClose').addEventListener('click', Modal.close);
  $('modalOverlay').addEventListener('click', (e) => {
    if (e.target === $('modalOverlay')) Modal.close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') Modal.close();
  });

  // Render initial screen
  navigate('today');
}

// ── BOOT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);


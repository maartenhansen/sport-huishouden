'use strict';

/* ============================================================
   Sport & Huishouden: alle logica van de app.
   Gegevens worden lokaal op het toestel bewaard (localStorage).
   ============================================================ */

const STORAGE_KEY = 'sport-huishouden-v1';

const CATS = [
  { name: 'Padel',          icon: '🏓', color: '#0ea5e9' },
  { name: 'Tennis',         icon: '🎾', color: '#84cc16' },
  { name: 'Squash',         icon: '🏸', color: '#f59e0b' },
  { name: 'Joggen',         icon: '🏃', color: '#ef4444' },
  { name: 'Yoga',           icon: '🧘', color: '#a855f7' },
  { name: 'Pilates',        icon: '🤸', color: '#ec4899' },
  { name: 'Krachttraining', icon: '🏋️', color: '#64748b' },
];
// Icoontjes voor huishoudtaken (het emoji-teken wordt bij de taak bewaard)
const TASK_ICONS = [
  { icon: '🪴', name: 'Planten',       color: '#16a34a' },
  { icon: '🐱', name: 'Kat',           color: '#f59e0b' },
  { icon: '🍽️', name: 'Afwas',         color: '#0ea5e9' },
  { icon: '🍳', name: 'Koken',         color: '#ef4444' },
  { icon: '🧹', name: 'Vegen',         color: '#a16207' },
  { icon: '🧽', name: 'Poetsen',       color: '#06b6d4' },
  { icon: '🛁', name: 'Badkamer',      color: '#3b82f6' },
  { icon: '🚽', name: 'Toilet',        color: '#64748b' },
  { icon: '🧺', name: 'Was',           color: '#8b5cf6' },
  { icon: '👕', name: 'Strijken',      color: '#ec4899' },
  { icon: '🛏️', name: 'Bed',           color: '#6366f1' },
  { icon: '🪟', name: 'Ramen',         color: '#0891b2' },
  { icon: '🗑️', name: 'Vuilnis',       color: '#78716c' },
  { icon: '🛒', name: 'Boodschappen',  color: '#f97316' },
  { icon: '🌿', name: 'Tuin',          color: '#65a30d' },
  { icon: '📬', name: 'Administratie', color: '#d97706' },
  { icon: '🔧', name: 'Klusje',        color: '#475569' },
  { icon: '📋', name: 'Overig',        color: '#0f766e' },
];
const DEFAULT_TASK_ICON = '📋';
const taskIcon = icon => TASK_ICONS.find(x => x.icon === icon) || TASK_ICONS[TASK_ICONS.length - 1];

// Intensiteit wordt opgeslagen als getal 1–5
const INTENSITY = ['Heel licht', 'Licht', 'Gemiddeld', 'Zwaar', 'Maximaal'];

const cat = name => CATS.find(c => c.name === name) || { name, icon: '•', color: '#888' };

/* ---------- Datum-hulpjes (datums als 'YYYY-MM-DD') ---------- */
const pad = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => fmtDate(new Date());
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

function addInterval(s, every, unit) {
  const d = parseDate(s);
  if (unit === 'dagen') d.setDate(d.getDate() + every);
  else if (unit === 'weken') d.setDate(d.getDate() + 7 * every);
  else if (unit === 'maanden') {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + every);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return fmtDate(d);
}

function weekStart(s) {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // maandag
  return fmtDate(d);
}

function niceDate(s) {
  const diff = daysBetween(today(), s);
  if (diff === 0) return 'Vandaag';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gisteren';
  return parseDate(s).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' });
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byWhen = (a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99'));
const byNext = (a, b) => a.nextDate.localeCompare(b.nextDate);

/* ---------- Opslag ---------- */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (d) return { activities: d.activities || [], tasks: d.tasks || [], taskLog: d.taskLog || [] };
  } catch (e) { /* lege start */ }
  return { activities: [], tasks: [], taskLog: [] };
}
// Lokaal bewaren en (als de cloud gekoppeld is) een synchronisatie inplannen
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  Cloud.schedule();
}

let db = load();
let view = 'vandaag';
let historyDays = 30;
let statsRange = 30; // aantal dagen, of 'all'

// Een herhalende taak bestaat maar één keer: zodra de volgende herhaling
// eraan komt, wordt de vorige als 'gemist' gelogd en vervangen.
function rollOverTasks() {
  const t = today();
  let changed = false;
  for (const x of db.tasks) {
    if (x.unit === 'eenmalig') continue;
    let next = addInterval(x.nextDate, x.every, x.unit);
    let guard = 0;
    while (next <= t && guard++ < 1000) {
      // Vaste id: als twee toestellen dezelfde gemiste keer registreren, blijft het één rij
      const missId = `${x.id}-${x.nextDate}-gemist`;
      if (!db.taskLog.some(l => l.id === missId)) {
        db.taskLog.push({ id: missId, taskId: x.id, name: x.name, icon: x.icon, date: x.nextDate, status: 'gemist' });
      }
      x.nextDate = next;
      next = addInterval(next, x.every, x.unit);
      changed = true;
    }
  }
  if (changed) save();
}
// "Niet afgewerkt" = automatisch gemist of zelf overgeslagen
const isMissed = l => l.status === 'gemist' || l.status === 'overgeslagen';

// Wijziging uitvoeren met de optie om ze ongedaan te maken
function withUndo(message, change) {
  const before = JSON.stringify(db);
  change();
  save();
  render();
  toast(message, () => { db = JSON.parse(before); save(); render(); });
}

/* ---------- Kaartjes ---------- */
function activityCard(a) {
  const c = cat(a.category);
  const planned = a.status === 'gepland';
  const done = a.status === 'gedaan';
  const skipped = a.status === 'overgeslagen';
  const late = planned && a.date < today();
  const state = late ? ' is-late' : skipped ? ' is-skipped' : (done && a.date === today() ? ' done-today' : '');
  const bits = [niceDate(a.date)];
  if (a.time) bits.push(a.time);
  if (a.duration) bits.push(a.duration + ' min');
  if (done && a.hr) bits.push('❤ ' + a.hr + ' bpm');
  if (done && a.intensity) bits.push(INTENSITY[a.intensity - 1]);
  if (skipped) bits.push('Overgeslagen');
  return `
    <div class="card${state}" style="--c:${c.color}">
      <div class="icon">${c.icon}</div>
      <div class="body">
        <div class="title">${esc(a.category)}</div>
        <div class="meta${late ? ' late' : ''}">${bits.map(esc).join(' · ')}</div>
        ${a.note ? `<div class="note">${esc(a.note)}</div>` : ''}
      </div>
      <button class="icon-btn" data-action="edit-activity" data-id="${a.id}" aria-label="Bewerken">✎</button>
      ${planned ? `
        <div class="card-actions">
          <button class="btn small primary" data-action="complete-activity" data-id="${a.id}">Gedaan</button>
          <button class="btn small" data-action="skip-activity" data-id="${a.id}">Overgeslagen</button>
        </div>` : ''}
    </div>`;
}

function repeatText(t) {
  if (t.unit === 'eenmalig') return 'Eenmalig';
  if (t.every === 1) return { dagen: 'Elke dag', weken: 'Elke week', maanden: 'Elke maand' }[t.unit];
  return `Elke ${t.every} ${t.unit}`;
}

function taskCard(t) {
  const diff = daysBetween(today(), t.nextDate);
  const when = diff < 0 ? `${-diff} ${diff === -1 ? 'dag' : 'dagen'} te laat` : niceDate(t.nextDate);
  const ic = taskIcon(t.icon);
  return `
    <div class="card${diff < 0 ? ' is-late' : ''}" style="--c:${ic.color}">
      <div class="icon">${ic.icon}</div>
      <div class="body">
        <div class="title">${esc(t.name)}</div>
        <div class="meta${diff < 0 ? ' late' : ''}">${esc(when)} · ${esc(repeatText(t))}</div>
      </div>
      <button class="icon-btn" data-action="edit-task" data-id="${t.id}" aria-label="Bewerken">✎</button>
      <div class="card-actions">
        <button class="btn small primary" data-action="complete-task" data-id="${t.id}">Gedaan</button>
        <button class="btn small" data-action="skip-task" data-id="${t.id}">Overgeslagen</button>
      </div>
    </div>`;
}

// Een regel uit het takenlogboek: gedaan, overgeslagen of automatisch gemist
function logCard(l) {
  const task = db.tasks.find(x => x.id === l.taskId);
  const ic = taskIcon(l.icon || (task && task.icon));
  const missed = l.status === 'gemist';
  const skipped = l.status === 'overgeslagen';
  const state = missed ? ' is-late' : skipped ? ' is-skipped' : (l.date === today() ? ' done-today' : '');
  const label = missed ? 'Niet gedaan' : skipped ? 'Overgeslagen' : 'Gedaan';
  return `
    <div class="card${state}" style="--c:${ic.color}">
      <div class="icon">${ic.icon}</div>
      <div class="body">
        <div class="title">${esc(l.name)}</div>
        <div class="meta${missed ? ' late' : ''}">${label}</div>
      </div>
    </div>`;
}

const list = (items, render, emptyText) =>
  items.length ? items.map(render).join('') : `<p class="empty">${emptyText}</p>`;

/* ---------- Schermen ---------- */
function viewToday() {
  const t = today();
  const yesterday = addInterval(t, -1, 'dagen');
  const planned = db.activities.filter(a => a.status === 'gepland' && a.date === t).sort(byWhen);
  const upcoming = db.activities.filter(a => a.status === 'gepland' && a.date > t).sort(byWhen).slice(0, 3);
  const dueTasks = db.tasks.filter(x => x.nextDate === t);
  // Te laat: sport enkel van gisteren; taken ongeacht hoe lang geleden.
  // Een herhalende taak heeft altijd maar één volgende datum, dus staat ze er maximaal één keer.
  const lateSport = db.activities.filter(a => a.status === 'gepland' && a.date === yesterday).sort(byWhen);
  const lateTasks = db.tasks.filter(x => x.nextDate < t).sort(byNext);
  const doneSport = db.activities.filter(a => a.status === 'gedaan' && a.date === t);
  const doneTasks = db.taskLog.filter(l => l.date === t && !isMissed(l));
  const hasLate = lateSport.length || lateTasks.length;

  return `
    <div class="btn-row">
      <button class="btn" data-action="log-activity">+ Sport loggen</button>
      <button class="btn" data-action="plan-activity">+ Sport plannen</button>
    </div>
    ${hasLate ? `
      <section>
        <h2 class="section-title late">Te laat</h2>
        ${lateSport.map(activityCard).join('')}${lateTasks.map(taskCard).join('')}
      </section>` : ''}
    <section>
      <h2 class="section-title">Sport</h2>
      ${list(planned, activityCard, 'Niets gepland voor vandaag.')}
    </section>
    <section>
      <h2 class="section-title">Huishouden</h2>
      ${list(dueTasks, taskCard, !db.tasks.length ? 'Nog geen taken. Voeg ze toe via Huishouden.'
        : lateTasks.length ? 'Niets meer gepland voor vandaag.' : 'Alles gedaan voor vandaag 🎉')}
    </section>
    ${upcoming.length ? `<section><h2 class="section-title">Binnenkort</h2>${upcoming.map(activityCard).join('')}</section>` : ''}
    ${doneSport.length || doneTasks.length ? `
      <section>
        <h2 class="section-title">Vandaag gedaan</h2>
        ${doneSport.map(activityCard).join('')}${doneTasks.map(logCard).join('')}
      </section>` : ''}`;
}

function viewSport() {
  const planned = db.activities.filter(a => a.status === 'gepland').sort(byWhen);
  const done = db.activities.filter(a => a.status === 'gedaan').sort((a, b) => byWhen(b, a)).slice(0, 10);
  return `
    <div class="btn-row">
      <button class="btn primary" data-action="plan-activity">+ Plannen</button>
      <button class="btn primary" data-action="log-activity">+ Loggen</button>
    </div>
    <section>
      <h2 class="section-title">Gepland</h2>
      ${list(planned, activityCard, 'Je hebt niets gepland.')}
    </section>
    <section>
      <h2 class="section-title">Laatst gedaan</h2>
      ${list(done, activityCard, 'Nog geen activiteiten gelogd.')}
    </section>`;
}

function viewTasks() {
  const t = today();
  const week = addInterval(t, 7, 'dagen');
  const sorted = [...db.tasks].sort(byNext);
  const groups = [
    ['Te laat', sorted.filter(x => x.nextDate < t)],
    ['Vandaag', sorted.filter(x => x.nextDate === t)],
    ['Komende 7 dagen', sorted.filter(x => x.nextDate > t && x.nextDate <= week)],
    ['Later', sorted.filter(x => x.nextDate > week)],
  ].filter(([, items]) => items.length);

  return `
    <div class="btn-row"><button class="btn primary" data-action="new-task">+ Nieuwe taak</button></div>
    ${db.tasks.length
      ? groups.map(([name, items]) => `<section><h2 class="section-title${name === 'Te laat' ? ' late' : ''}">${name}</h2>${items.map(taskCard).join('')}</section>`).join('')
      : '<p class="empty" style="margin-top:16px">Nog geen taken. Voeg bijvoorbeeld "Stofzuigen, elke week" toe.</p>'}`;
}

/* ---------- Grafieken ---------- */
const pct = (n, total) => Math.round((n / total) * 100);

// Verhouding afgewerkt / niet afgewerkt als één gestapelde balk
function splitChart(title, done, notDone) {
  const total = done + notDone;
  if (!total) {
    return `<div class="chart-card"><div class="chart-title">${title}</div><p class="empty">Nog geen gegevens in deze periode.</p></div>`;
  }
  const pd = pct(done, total);
  const pn = 100 - pd;
  return `
    <div class="chart-card">
      <div class="chart-title">${title}</div>
      <div class="hero">${pd}%<span>afgewerkt</span></div>
      <div class="split-bar" role="img" aria-label="${done} afgewerkt (${pd}%), ${notDone} niet afgewerkt (${pn}%)">
        ${done ? `<i class="seg good" style="flex:${done}" data-tip="Afgewerkt: ${done} (${pd}%)"></i>` : ''}
        ${notDone ? `<i class="seg bad" style="flex:${notDone}" data-tip="Niet afgewerkt: ${notDone} (${pn}%)"></i>` : ''}
      </div>
      <div class="legend">
        <span><i class="sw good"></i>✓ Afgewerkt · ${done}</span>
        <span><i class="sw bad"></i>✕ Niet afgewerkt · ${notDone}</span>
      </div>
    </div>`;
}

function intensityChart(acts) {
  const rated = acts.filter(a => a.intensity);
  const unrated = acts.length - rated.length;
  if (!rated.length) {
    return `<div class="chart-card"><div class="chart-title">Sport: intensiteit</div><p class="empty">Nog geen activiteiten met intensiteit in deze periode.</p></div>`;
  }
  const counts = INTENSITY.map((_, i) => rated.filter(a => a.intensity === i + 1).length);
  const max = Math.max(...counts);
  return `
    <div class="chart-card">
      <div class="chart-title">Sport: intensiteit</div>
      ${INTENSITY.map((name, i) => `
        <div class="bar-row series" data-tip="${name}: ${counts[i]} ${counts[i] === 1 ? 'activiteit' : 'activiteiten'}">
          <span>${name}</span>
          <div class="bar"><i style="width:${max ? (counts[i] / max) * 100 : 0}%"></i></div>
          <span class="num-r">${pct(counts[i], rated.length)}%</span>
        </div>`).join('')}
      ${unrated ? `<p class="hint small">${unrated} ${unrated === 1 ? 'activiteit' : 'activiteiten'} zonder intensiteit niet meegeteld.</p>` : ''}
    </div>`;
}

function weeklyMinutesChart() {
  const t = today();
  const thisWeek = weekStart(t);
  const weeks = [];
  for (let i = 7; i >= 0; i--) weeks.push(addInterval(thisWeek, -7 * i, 'dagen'));
  const done = db.activities.filter(a => a.status === 'gedaan');
  const mins = weeks.map(w => {
    const end = addInterval(w, 7, 'dagen');
    return done.filter(a => a.date >= w && a.date < end).reduce((s, a) => s + (a.duration || 0), 0);
  });
  const top = Math.max(60, Math.ceil(Math.max(...mins) / 60) * 60); // afgerond op een heel uur
  const short = s => { const d = parseDate(s); return `${d.getDate()}/${d.getMonth() + 1}`; };
  return `
    <div class="chart-card">
      <div class="chart-title">Sport: minuten per week</div>
      <div class="chart-sub">Laatste 8 weken · deze week: <b>${mins[7]} min</b></div>
      <div class="cols-wrap">
        <div class="gridline" style="bottom:100%"><span>${top}</span></div>
        <div class="gridline" style="bottom:50%"><span>${top / 2}</span></div>
        <div class="cols" role="img" aria-label="Minuten per week: ${weeks.map((w, i) => `week van ${short(w)} ${mins[i]} minuten`).join(', ')}">
          ${weeks.map((w, i) => `
            <div class="col" data-tip="Week van ${short(w)}: ${mins[i]} min">
              <i style="height:${(mins[i] / top) * 100}%"></i>
            </div>`).join('')}
        </div>
      </div>
      <div class="col-labels">${weeks.map(w => `<span>${short(w)}</span>`).join('')}</div>
    </div>`;
}

function viewStats() {
  const t = today();
  const yesterday = addInterval(t, -1, 'dagen');
  const from = statsRange === 'all' ? '0000-00-00' : addInterval(t, -statsRange, 'dagen');
  const inRange = x => x.date >= from && x.date <= t;

  // Sport: afgewerkt = gedaan; niet afgewerkt = overgeslagen, of gepland en niet meer bij "Te laat"
  const sportDone = db.activities.filter(a => a.status === 'gedaan' && inRange(a));
  const sportNot = db.activities.filter(a => inRange(a) &&
    (a.status === 'overgeslagen' || (a.status === 'gepland' && a.date < yesterday))).length;

  const tasksDone = db.taskLog.filter(l => inRange(l) && !isMissed(l)).length;
  const tasksNot = db.taskLog.filter(l => inRange(l) && isMissed(l)).length;

  const ranges = [['30', '30 dagen'], ['90', '90 dagen'], ['all', 'Alles']];
  return `
    <section>
      <h2 class="section-title">Statistieken</h2>
      <div class="range">
        ${ranges.map(([val, txt]) => `<button class="${String(statsRange) === val ? 'active' : ''}" data-action="stats-range" data-id="${val}">${txt}</button>`).join('')}
      </div>
      ${splitChart('Sport: afgewerkt', sportDone.length, sportNot)}
      ${intensityChart(sportDone)}
      ${weeklyMinutesChart()}
      ${splitChart('Huishouden: afgewerkt', tasksDone, tasksNot)}
    </section>`;
}

function viewHistory() {
  const t = today();
  const ws = weekStart(t);
  const done = db.activities.filter(a => a.status === 'gedaan');

  // Statistieken deze week
  const week = done.filter(a => a.date >= ws && a.date <= t);
  const minutes = week.reduce((s, a) => s + (a.duration || 0), 0);
  const withHr = week.filter(a => a.hr);
  const avgHr = withHr.length ? Math.round(withHr.reduce((s, a) => s + a.hr, 0) / withHr.length) : '–';
  const perCat = CATS
    .map(c => ({ c, min: week.filter(a => a.category === c.name).reduce((s, a) => s + (a.duration || 0), 0) }))
    .filter(x => x.min > 0)
    .sort((a, b) => b.min - a.min);
  const maxMin = Math.max(1, ...perCat.map(x => x.min));

  // Logboek, gegroepeerd per dag (gedane én overgeslagen activiteiten)
  const logged = db.activities.filter(a => a.status !== 'gepland');
  const from = addInterval(t, -historyDays, 'dagen');
  const items = [
    ...logged.filter(a => a.date >= from).map(a => ({ date: a.date, html: activityCard(a) })),
    ...db.taskLog.filter(l => l.date >= from).map(l => ({ date: l.date, html: logCard(l) })),
  ];
  const days = [...new Set(items.map(i => i.date))].sort().reverse();
  const hasOlder = logged.some(a => a.date < from) || db.taskLog.some(l => l.date < from);

  return `
    <section>
      <h2 class="section-title">Deze week</h2>
      <div class="stats">
        <div class="stat"><div class="num">${week.length}</div><div class="lbl">activiteiten</div></div>
        <div class="stat"><div class="num">${minutes}</div><div class="lbl">minuten</div></div>
        <div class="stat"><div class="num">${avgHr}</div><div class="lbl">gem. hartslag</div></div>
      </div>
      ${perCat.map(x => `
        <div class="bar-row" style="--c:${x.c.color}">
          <span>${x.c.icon} ${x.c.name}</span>
          <div class="bar"><i style="width:${(x.min / maxMin) * 100}%"></i></div>
          <span class="num-r">${x.min} min</span>
        </div>`).join('')}
    </section>
    ${viewStats()}
    ${Cloud.enabled ? pushSection() : ''}
    <section>
      <h2 class="section-title">Laatste ${historyDays} dagen</h2>
      ${days.length
        ? days.map(d => `<div class="day-head">${esc(niceDate(d))}</div>${items.filter(i => i.date === d).map(i => i.html).join('')}`).join('')
        : '<p class="empty">Nog niets gelogd in deze periode.</p>'}
      ${hasOlder ? '<button class="btn" data-action="more-history" style="margin-top:8px">Toon oudere</button>' : ''}
    </section>
    <section>
      <h2 class="section-title">Gegevens</h2>
      ${Cloud.enabled ? `
        <p class="hint">Ingelogd als <b>${esc(Cloud.email())}</b>. Je gegevens worden bewaard in je Supabase-database.
          ${Cloud.status().state === 'error' ? `<br><span class="late">Laatste fout: ${esc(Cloud.status().lastError)}</span>` : ''}</p>
        <div class="btn-row" style="margin-bottom:8px">
          <button class="btn" data-action="sync-now">Nu synchroniseren</button>
          <button class="btn danger" data-action="sign-out">Uitloggen</button>
        </div>`
      : '<p class="hint">Je gegevens staan alleen op dit toestel. Maak af en toe een back-up.</p>'}
      <div class="btn-row">
        <button class="btn" data-action="export-sport">Sport (CSV)</button>
        <button class="btn" data-action="export-tasks">Taken (CSV)</button>
      </div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn" data-action="backup">Back-up maken</button>
        <button class="btn" data-action="restore">Back-up terugzetten</button>
      </div>
      <p class="hint small" style="text-align:center;margin-top:16px">Versie ${esc(window.APP_VERSION || '?')}</p>
    </section>`;
}

const VIEWS = {
  vandaag:      { title: 'Vandaag',      render: viewToday },
  sport:        { title: 'Sport',        render: viewSport },
  huishouden:   { title: 'Huishouden',   render: viewTasks },
  geschiedenis: { title: 'Geschiedenis', render: viewHistory },
};

function viewLogin() {
  return `
    <div class="login">
      <p class="hint">Log in om je gegevens veilig in de cloud te bewaren. Zo ben je niets kwijt als je je browsergegevens wist.</p>
      <form id="loginForm" class="chart-card">
        <label class="field">E-mail<input type="email" name="email" autocomplete="username" required></label>
        <label class="field">Wachtwoord<input type="password" name="password" autocomplete="current-password" required></label>
        <p id="loginError" class="login-error" role="alert"></p>
        <button class="btn primary" type="submit" style="width:100%">Inloggen</button>
      </form>
    </div>`;
}

// Klein label rechtsboven: is alles veilig in de cloud?
function renderSyncBadge() {
  const el = document.getElementById('syncBadge');
  if (!Cloud.enabled || Cloud.needsLogin()) { el.hidden = true; return; }
  const { state, pending } = Cloud.status();
  const map = {
    syncing: ['Synchroniseren…', ''],
    offline: [`Offline${pending ? ` · ${pending} wachten` : ''}`, 'warn'],
    error:   ['Sync-fout', 'bad'],
  };
  const [text, cls] = map[state] || (pending ? [`${pending} niet opgeslagen`, 'warn'] : ['☁ Opgeslagen', 'good']);
  el.hidden = false;
  el.textContent = text;
  el.className = 'sync-badge ' + cls;
}

/* ---------- Pushmeldingen (dagoverzicht om 17:30 en 19:00) ---------- */
let pushState = 'unknown'; // unknown | unsupported | denied | on | off | busy

const pushSupported = () => Cloud.enabled && window.APP_CONFIG.vapidPublicKey &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function base64UrlToBytes(s) {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function currentPushSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function refreshPushState() {
  if (!pushSupported()) { pushState = 'unsupported'; return; }
  if (Notification.permission === 'denied') { pushState = 'denied'; return; }
  try {
    const sub = await currentPushSubscription();
    pushState = sub ? 'on' : 'off';
    // Registratie opnieuw bevestigen bij de server (bv. na opnieuw inloggen)
    if (sub && !Cloud.needsLogin()) Cloud.savePushSubscription(sub.toJSON()).catch(() => {});
  } catch { pushState = 'off'; }
}

async function enablePush() {
  pushState = 'busy'; render();
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      pushState = permission === 'denied' ? 'denied' : 'off';
      render();
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(window.APP_CONFIG.vapidPublicKey),
    });
    await Cloud.savePushSubscription(sub.toJSON());
    pushState = 'on';
    toast('Meldingen staan aan');
  } catch (e) {
    await refreshPushState();
    toast('Aanzetten mislukt: ' + e.message);
  }
  render();
}

async function disablePush() {
  try {
    const sub = await currentPushSubscription();
    if (sub) {
      await Cloud.deletePushSubscription(sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
    toast('Meldingen staan uit');
  } catch (e) {
    toast('Uitzetten mislukt: ' + e.message);
  }
  await refreshPushState();
  render();
}

function pushSection() {
  const texts = {
    unknown:     '<p class="hint">Even kijken…</p>',
    busy:        '<p class="hint">Bezig…</p>',
    unsupported: '<p class="hint">Meldingen worden hier niet ondersteund. Gebruik de geïnstalleerde app op je gsm.</p>',
    denied:      '<p class="hint late">Meldingen zijn geblokkeerd. Zet ze aan via de instellingen van je gsm: Instellingen → Apps → Sport &amp; Huishouden → Meldingen.</p>',
    off:         `<p class="hint">Krijg om 17:30 en 19:00 een melding met wat er vandaag nog openstaat.</p>
                  <button class="btn primary" data-action="push-on" style="width:100%">Meldingen aanzetten</button>`,
    on:          `<p class="hint">✓ Je krijgt om 17:30 en 19:00 een melding als er nog iets openstaat.</p>
                  <div class="btn-row">
                    <button class="btn" data-action="push-test">Testmelding</button>
                    <button class="btn" data-action="push-off">Uitzetten</button>
                  </div>`,
  };
  return `<section><h2 class="section-title">Meldingen</h2>${texts[pushState]}</section>`;
}

// Bolletjes met het aantal openstaande zaken (vandaag + te laat):
// op de tabbladen in de app, en op het app-icoon als het toestel dat ondersteunt.
function updateBadges(loggedOut) {
  const t = today();
  const yesterday = addInterval(t, -1, 'dagen');
  const openSport = loggedOut ? 0 : db.activities.filter(a => a.status === 'gepland' && (a.date === t || a.date === yesterday)).length;
  const openTasks = loggedOut ? 0 : db.tasks.filter(x => x.nextDate <= t).length;

  for (const [id, n] of [['badgeSport', openSport], ['badgeTasks', openTasks]]) {
    const el = document.getElementById(id);
    el.hidden = n === 0;
    el.textContent = n > 9 ? '9+' : String(n);
  }

  const total = openSport + openTasks;
  // Alles afgewerkt: de dagoverzicht-melding (en daarmee het bolletje op het icoon) weghalen
  if (total === 0 && navigator.serviceWorker) {
    navigator.serviceWorker.getRegistration()
      .then(reg => reg && reg.getNotifications({ tag: 'dagoverzicht' }))
      .then(list => (list || []).forEach(n => n.close()))
      .catch(() => {});
  }
  try {
    if (total > 0 && navigator.setAppBadge) navigator.setAppBadge(total).catch(() => {});
    else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  } catch (e) { /* niet ondersteund op dit toestel */ }
}

function render() {
  const loggedOut = Cloud.needsLogin();
  updateBadges(loggedOut);
  document.body.classList.toggle('logged-out', loggedOut);
  renderSyncBadge();
  if (loggedOut) {
    document.getElementById('title').textContent = 'Sport & Huishouden';
    document.getElementById('subtitle').textContent = '';
    document.getElementById('main').innerHTML = viewLogin();
    return;
  }
  rollOverTasks();
  updateBadges(false);
  document.getElementById('title').textContent = VIEWS[view].title;
  document.getElementById('subtitle').textContent = view === 'vandaag'
    ? new Date().toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('main').innerHTML = VIEWS[view].render();
}

/* ---------- Formulieren ---------- */
const dlg = document.getElementById('dialog');

function openForm(title, fieldsHtml, onSubmit, onDelete) {
  dlg.innerHTML = `
    <form novalidate>
      <h2>${title}</h2>
      ${fieldsHtml}
      <div class="form-actions">
        ${onDelete ? '<button type="button" class="btn danger" data-role="delete">Verwijderen</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-role="cancel">Annuleren</button>
        <button type="submit" class="btn primary">Opslaan</button>
      </div>
    </form>`;
  const form = dlg.querySelector('form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    onSubmit(Object.fromEntries(new FormData(form)));
    dlg.close();
  });
  form.querySelector('[data-role=cancel]').onclick = () => dlg.close();
  if (onDelete) {
    form.querySelector('[data-role=delete]').onclick = () => {
      if (confirm('Zeker dat je dit wilt verwijderen?')) { onDelete(); dlg.close(); }
    };
  }
  dlg.showModal();
  return form;
}

// mode: 'plan' (vooruit plannen), 'log' (gedane activiteit), 'complete' (geplande activiteit afronden)
function activityForm(mode, a) {
  const isLog = mode !== 'plan';
  const v = a ? { ...a } : { category: '', date: today(), time: '', duration: null, hr: null, note: '' };
  if (mode === 'complete' && v.date > today()) v.date = today();

  const title = mode === 'complete' ? 'Hoe ging het?'
    : mode === 'plan' ? (a ? 'Planning bewerken' : 'Sport plannen')
    : (a ? 'Activiteit bewerken' : 'Sport loggen');

  const fields = `
    <div class="field-label">Categorie</div>
    <div class="chips">
      ${CATS.map(c => `
        <label class="chip">
          <input type="radio" name="category" value="${c.name}" ${v.category === c.name ? 'checked' : ''} required>
          <span>${c.icon} ${c.name}</span>
        </label>`).join('')}
    </div>
    <div class="field-row">
      <label class="field">Datum<input type="date" name="date" value="${v.date}" required></label>
      ${isLog ? '' : `<label class="field">Tijd<input type="time" name="time" value="${v.time || ''}"></label>`}
    </div>
    <div class="field-row">
      <label class="field">${isLog ? 'Duur (min)' : 'Geplande duur (min)'}
        <input type="number" name="duration" inputmode="numeric" min="1" max="1440" value="${v.duration ?? ''}" ${isLog ? 'required' : ''}>
      </label>
      ${isLog ? `<label class="field">Gem. hartslag (bpm)
        <input type="number" name="hr" inputmode="numeric" min="30" max="230" value="${v.hr ?? ''}">
      </label>` : ''}
    </div>
    ${isLog ? `
      <div class="field-label">Intensiteit</div>
      <div class="chips">
        ${INTENSITY.map((name, i) => `
          <label class="chip">
            <input type="radio" name="intensity" value="${i + 1}" ${v.intensity === i + 1 ? 'checked' : ''}>
            <span>${name}</span>
          </label>`).join('')}
      </div>` : ''}
    <label class="field">Notitie<textarea name="note" rows="2" placeholder="Optioneel">${esc(v.note)}</textarea></label>`;

  openForm(title, fields, d => {
    const rec = {
      id: v.id || uid(),
      category: d.category,
      date: d.date,
      time: 'time' in d ? d.time : (v.time || ''),
      duration: d.duration ? Number(d.duration) : null,
      hr: isLog && d.hr ? Number(d.hr) : null,
      intensity: isLog && d.intensity ? Number(d.intensity) : null,
      note: (d.note || '').trim(),
      status: isLog ? 'gedaan' : 'gepland',
    };
    const i = db.activities.findIndex(x => x.id === rec.id);
    if (i >= 0) db.activities[i] = rec; else db.activities.push(rec);
    save();
    render();
    toast(isLog ? 'Opgeslagen 💪' : 'Ingepland');
  }, a && mode !== 'complete'
    ? () => withUndo('Activiteit verwijderd', () => { db.activities = db.activities.filter(x => x.id !== a.id); })
    : null);
}

function taskForm(t) {
  const v = t ? { ...t } : { name: '', icon: DEFAULT_TASK_ICON, every: 1, unit: 'weken', nextDate: today() };
  const currentIcon = taskIcon(v.icon).icon;
  const units = [['dagen', 'dag(en)'], ['weken', 'week/weken'], ['maanden', 'maand(en)'], ['eenmalig', 'niet herhalen']];
  const fields = `
    <label class="field">Taak<input name="name" required maxlength="80" value="${esc(v.name)}" placeholder="bv. Stofzuigen"></label>
    <div class="field-label">Icoon</div>
    <div class="chips">
      ${TASK_ICONS.map(x => `
        <label class="chip">
          <input type="radio" name="icon" value="${x.icon}" ${x.icon === currentIcon ? 'checked' : ''}>
          <span>${x.icon} ${x.name}</span>
        </label>`).join('')}
    </div>
    <div class="field-row">
      <label class="field" id="everyWrap">Elke<input type="number" name="every" min="1" max="365" inputmode="numeric" value="${v.every || 1}"></label>
      <label class="field">Herhaling
        <select name="unit">${units.map(([val, txt]) => `<option value="${val}" ${v.unit === val ? 'selected' : ''}>${txt}</option>`).join('')}</select>
      </label>
    </div>
    <label class="field">${t ? 'Volgende keer' : 'Eerste keer'}<input type="date" name="nextDate" value="${v.nextDate}" required></label>`;

  const form = openForm(t ? 'Taak bewerken' : 'Nieuwe taak', fields, d => {
    const rec = {
      id: v.id || uid(),
      name: d.name.trim(),
      icon: d.icon || DEFAULT_TASK_ICON,
      every: d.unit === 'eenmalig' ? 1 : Math.max(1, Number(d.every) || 1),
      unit: d.unit,
      nextDate: d.nextDate,
    };
    const i = db.tasks.findIndex(x => x.id === rec.id);
    if (i >= 0) db.tasks[i] = rec; else db.tasks.push(rec);
    save();
    render();
    toast('Taak opgeslagen');
  }, t ? () => withUndo('Taak verwijderd', () => { db.tasks = db.tasks.filter(x => x.id !== t.id); }) : null);

  // "Elke …" verbergen bij een eenmalige taak
  const unit = form.querySelector('[name=unit]');
  const every = form.querySelector('[name=every]');
  const sync = () => {
    const once = unit.value === 'eenmalig';
    form.querySelector('#everyWrap').style.visibility = once ? 'hidden' : '';
    every.disabled = once;
  };
  unit.addEventListener('change', sync);
  sync();
}

// status: 'gedaan' of 'overgeslagen'. Daarna wordt de volgende keer ingepland vanaf vandaag.
function completeTask(id, status = 'gedaan') {
  const t = db.tasks.find(x => x.id === id);
  if (!t) return;
  const once = t.unit === 'eenmalig';
  const next = once ? null : addInterval(today(), t.every, t.unit);
  const verb = status === 'gedaan' ? 'gedaan' : 'overgeslagen';
  withUndo(once ? `"${t.name}" ${verb}` : `"${t.name}" ${verb}, volgende: ${niceDate(next).toLowerCase()}`, () => {
    db.taskLog.push({ id: uid(), taskId: t.id, name: t.name, icon: t.icon, date: today(), status });
    if (once) db.tasks = db.tasks.filter(x => x.id !== id);
    else t.nextDate = next;
  });
}

/* ---------- Melding ---------- */
let toastTimer;
function toast(message, undo) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button>Ongedaan maken</button>' : ''}`;
  if (undo) el.querySelector('button').onclick = () => { undo(); el.classList.remove('show'); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 5000 : 2500);
}

/* ---------- Export & back-up ---------- */
function toCSV(rows, cols) {
  const q = v => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\n');
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ACTIONS = {
  'plan-activity':     () => activityForm('plan'),
  'log-activity':      () => activityForm('log'),
  'complete-activity': id => activityForm('complete', db.activities.find(a => a.id === id)),
  'edit-activity':     id => { const a = db.activities.find(x => x.id === id); activityForm(a.status === 'gepland' ? 'plan' : 'log', a); },
  'new-task':          () => taskForm(),
  'edit-task':         id => taskForm(db.tasks.find(x => x.id === id)),
  'skip-activity':     id => withUndo('Gemarkeerd als overgeslagen', () => {
    db.activities.find(a => a.id === id).status = 'overgeslagen';
  }),
  'stats-range':       id => { statsRange = id === 'all' ? 'all' : Number(id); render(); },
  'complete-task':     id => completeTask(id),
  'skip-task':         id => completeTask(id, 'overgeslagen'),
  'more-history':      () => { historyDays += 30; render(); },
  'export-sport':      () => download(`sport-${today()}.csv`,
    toCSV([...db.activities].sort(byWhen), ['date', 'time', 'category', 'status', 'duration', 'hr', 'intensity', 'note']), 'text/csv'),
  'export-tasks':      () => download(`taken-${today()}.csv`,
    toCSV(db.taskLog.map(l => ({ ...l, status: l.status || 'gedaan' })).sort((a, b) => a.date.localeCompare(b.date)),
      ['date', 'name', 'status']), 'text/csv'),
  'backup':            () => download(`backup-sport-huishouden-${today()}.json`,
    JSON.stringify({ app: 'sport-huishouden', version: 1, ...db }, null, 2), 'application/json'),
  'restore':           () => document.getElementById('importFile').click(),
  'sync-now':          () => Cloud.sync(),
  'sign-out':          () => {
    const pending = Cloud.status().pending;
    const msg = pending
      ? `Er zijn nog ${pending} wijzigingen niet opgeslagen in de cloud. Die gaan verloren als je nu uitlogt. Toch uitloggen?`
      : 'Uitloggen? De gegevens worden van dit toestel verwijderd (ze blijven in de cloud bewaard).';
    if (!confirm(msg)) return;
    // Eerst meldingen voor dit toestel afmelden, anders blijven ze komen na het uitloggen
    (pushState === 'on' ? disablePush() : Promise.resolve()).finally(() => Cloud.signOut());
  },
  'push-on':           () => enablePush(),
  'push-off':          () => disablePush(),
  'push-test':         async () => {
    toast('Testmelding wordt verstuurd…');
    try {
      const r = await Cloud.sendTestPush();
      const res = (r.resultaten || []).join(', ');
      toast(res.includes('verstuurd') ? 'Testmelding verstuurd' : 'Resultaat: ' + (res || 'onbekend'));
    } catch (e) {
      toast('Testmelding mislukt: ' + e.message);
    }
  },
};

document.getElementById('importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (![d.activities, d.tasks, d.taskLog].every(Array.isArray)) throw new Error('ongeldig');
    if (!confirm('Dit vervangt al je huidige gegevens door de back-up. Doorgaan?')) return;
    db = { activities: d.activities, tasks: d.tasks, taskLog: d.taskLog };
    save();
    render();
    toast('Back-up teruggezet');
  } catch {
    alert('Dit bestand is geen geldige back-up.');
  }
});

/* ---------- Klikken ---------- */
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-view]');
  if (nav) { view = nav.dataset.view; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el.dataset.id);
});

/* ---------- Tooltip bij grafieken (aanraken of muis erover) ---------- */
const tip = Object.assign(document.createElement('div'), { id: 'tip' });
document.body.appendChild(tip);
document.addEventListener('pointerover', e => {
  const el = e.target.closest('[data-tip]');
  if (!el) { tip.classList.remove('show'); return; }
  tip.textContent = el.dataset.tip;
  tip.classList.add('show');
  const r = el.getBoundingClientRect();
  const x = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2));
  tip.style.left = x + 'px';
  tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + 'px';
});
window.addEventListener('scroll', () => tip.classList.remove('show'), { passive: true });

// Klik naast het formulier sluit het
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

// Inloggen
document.addEventListener('submit', async e => {
  if (e.target.id !== 'loginForm') return;
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector('button');
  const error = document.getElementById('loginError');
  button.disabled = true;
  button.textContent = 'Bezig…';
  error.textContent = '';
  try {
    await Cloud.signIn(form.email.value.trim(), form.password.value);
    view = 'vandaag';
    render();
    Cloud.sync();
    refreshPushState();
  } catch (err) {
    error.textContent = err.message;
    button.disabled = false;
    button.textContent = 'Inloggen';
  }
});

// Na middernacht of bij terugkeren naar de app: scherm verversen en synchroniseren
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (!dlg.open) render();
  Cloud.sync();
});
window.addEventListener('online', () => Cloud.sync());

/* ---------- Start ---------- */
Cloud.init({
  getDb: () => db,
  // Nieuwe gegevens uit de database: lokaal bewaren (zonder opnieuw te synchroniseren)
  setDb: next => {
    db = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    if (!dlg.open) render(); else renderSyncBadge();
  },
  onChange: () => renderSyncBadge(),
});
render();
Cloud.sync();
refreshPushState().then(() => { if (view === 'geschiedenis') render(); });
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}

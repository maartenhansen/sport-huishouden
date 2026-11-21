'use strict';

/* ============================================================
   Cloud: inloggen bij Supabase en gegevens synchroniseren.

   Werking:
   - De app werkt altijd op een lokale kopie (localStorage), ook offline.
   - "shadow" = de laatst bekende toestand van de database.
   - Synchroniseren = 1) verschil tussen lokaal en shadow doorsturen
     (upsert / delete), 2) alles opnieuw ophalen uit de database.
   - Niet-verstuurde wijzigingen overleven dus het sluiten van de app:
     ze zijn gewoon het verschil tussen lokaal en shadow.
   ============================================================ */

const Cloud = (() => {
  const cfg = window.APP_CONFIG || {};
  const enabled = Boolean(cfg.supabaseUrl && cfg.supabaseKey);
  const base = (cfg.supabaseUrl || '').replace(/\/+$/, '');

  const SESSION_KEY = 'sport-huishouden-session';
  const SHADOW_KEY = 'sport-huishouden-shadow';
  const PAGE = 1000; // Supabase geeft standaard max. 1000 rijen per verzoek

  // Omzetting tussen app-objecten (camelCase) en databaserijen (snake_case)
  const TABLES = {
    activities: {
      local: 'activities',
      toRow: a => ({
        id: a.id, category: a.category, date: a.date, time: a.time || null,
        duration: a.duration ?? null, hr: a.hr ?? null, intensity: a.intensity ?? null,
        note: a.note || '', status: a.status,
      }),
      fromRow: r => ({
        id: r.id, category: r.category, date: r.date, time: r.time ? r.time.slice(0, 5) : '',
        duration: r.duration, hr: r.hr, intensity: r.intensity, note: r.note || '', status: r.status,
      }),
    },
    tasks: {
      local: 'tasks',
      toRow: t => ({
        id: t.id, name: t.name, icon: t.icon || null, every: t.every || 1,
        unit: t.unit, next_date: t.nextDate,
      }),
      fromRow: r => ({
        id: r.id, name: r.name, icon: r.icon || undefined, every: r.every,
        unit: r.unit, nextDate: r.next_date,
      }),
    },
    task_log: {
      local: 'taskLog',
      toRow: l => ({
        id: l.id, task_id: l.taskId, name: l.name, icon: l.icon || null,
        date: l.date, status: l.status || 'gedaan',
      }),
      fromRow: r => ({
        id: r.id, taskId: r.task_id, name: r.name, icon: r.icon || undefined,
        date: r.date, status: r.status,
      }),
    },
  };

  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const write = (key, val) => localStorage.setItem(key, JSON.stringify(val));
  const emptyShadow = () => ({ activities: {}, tasks: {}, task_log: {} });

  let session = read(SESSION_KEY);
  let shadow = read(SHADOW_KEY) || emptyShadow();
  let state = 'idle';        // idle | syncing | ok | offline | error
  let lastError = '';
  let app = { getDb: () => ({}), setDb: () => {}, onChange: () => {} };

  const setState = (s, err = '') => { state = s; lastError = err; app.onChange(); };

  /* ---------- Inloggen ---------- */
  class AuthError extends Error {}

  async function authRequest(path, body) {
    const res = await fetch(`${base}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: cfg.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new AuthError(data.error_description || data.msg || data.message || `Fout ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function storeSession(d) {
    session = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
      email: (d.user && d.user.email) || (session && session.email) || '',
    };
    write(SESSION_KEY, session);
  }

  function dropSession() {
    session = null;
    localStorage.removeItem(SESSION_KEY);
  }

  async function signIn(email, password) {
    try {
      storeSession(await authRequest('token?grant_type=password', { email, password }));
    } catch (e) {
      if (e instanceof AuthError && (e.status === 400 || e.status === 401)) {
        throw new Error('E-mail of wachtwoord klopt niet.');
      }
      if (e instanceof TypeError) throw new Error('Geen verbinding. Probeer opnieuw als je online bent.');
      throw e;
    }
    app.onChange();
  }

  // Geldig toegangstoken; vernieuwt het automatisch als het (bijna) verlopen is
  async function accessToken() {
    if (!session) throw new AuthError('Niet ingelogd');
    if (session.expires_at - 60 < Date.now() / 1000) {
      try {
        storeSession(await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
      } catch (e) {
        // Vernieuwen geweigerd → opnieuw inloggen nodig. Lokale gegevens blijven bewaard.
        if (e instanceof AuthError && (e.status === 400 || e.status === 401)) { dropSession(); app.onChange(); }
        throw e;
      }
    }
    return session.access_token;
  }

  // Uitloggen wist ook de lokale gegevens van dit toestel
  async function signOut() {
    const token = session && session.access_token;
    dropSession();
    shadow = emptyShadow();
    localStorage.removeItem(SHADOW_KEY);
    app.setDb({ activities: [], tasks: [], taskLog: [] });
    if (token) {
      fetch(`${base}/auth/v1/logout`, {
        method: 'POST', headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setState('idle');
  }

  /* ---------- Database-API (PostgREST) ---------- */
  async function rest(method, path, body, headers = {}, retry = true) {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: cfg.supabaseKey,
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && retry && session) {
      // Token geweigerd: één keer vernieuwen en opnieuw proberen
      session.expires_at = 0;
      return rest(method, path, body, headers, false);
    }
    if (!res.ok) throw new Error(`Database ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function fetchAll(table) {
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await rest('GET', `${table}?select=*&order=id&limit=${PAGE}&offset=${offset}`);
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  // Wat is er lokaal veranderd t.o.v. de database?
  function diff() {
    const db = app.getDb();
    const out = {};
    for (const [table, def] of Object.entries(TABLES)) {
      const rows = (db[def.local] || []).map(def.toRow);
      const known = shadow[table];
      const ids = new Set(rows.map(r => r.id));
      out[table] = {
        upserts: rows.filter(r => JSON.stringify(r) !== JSON.stringify(known[r.id])),
        deletes: Object.keys(known).filter(id => !ids.has(id)),
      };
    }
    return out;
  }

  function pendingCount() {
    if (!enabled || !session) return 0;
    return Object.values(diff()).reduce((s, d) => s + d.upserts.length + d.deletes.length, 0);
  }

  /* ---------- Synchroniseren ---------- */
  let running = false;
  let again = false;
  let timer = null;

  function schedule(ms = 800) {
    if (!enabled || !session) return;
    clearTimeout(timer);
    timer = setTimeout(sync, ms);
    app.onChange();
  }

  async function sync() {
    if (!enabled || !session) return;
    if (running) { again = true; return; }
    running = true;
    setState('syncing');
    try {
      // 1. Lokale wijzigingen doorsturen
      const changes = diff();
      for (const [table, { upserts, deletes }] of Object.entries(changes)) {
        for (const part of chunks(upserts, 500)) {
          await rest('POST', `${table}?on_conflict=id`, part, { Prefer: 'resolution=merge-duplicates,return=minimal' });
          part.forEach(r => { shadow[table][r.id] = r; });
          write(SHADOW_KEY, shadow);
        }
        for (const part of chunks(deletes, 100)) {
          const list = part.map(id => `"${id}"`).join(',');
          await rest('DELETE', `${table}?id=in.(${encodeURIComponent(list)})`);
          part.forEach(id => { delete shadow[table][id]; });
          write(SHADOW_KEY, shadow);
        }
      }

      // 2. Alles ophalen (de database is de bron van waarheid)
      const before = JSON.stringify(app.getDb());
      const fresh = {};
      for (const table of Object.keys(TABLES)) fresh[table] = await fetchAll(table);

      if (JSON.stringify(app.getDb()) !== before) {
        again = true; // er is intussen lokaal iets gewijzigd: straks opnieuw
      } else {
        const next = {};
        const newShadow = emptyShadow();
        for (const [table, def] of Object.entries(TABLES)) {
          next[def.local] = fresh[table].map(def.fromRow);
          next[def.local].forEach(item => { const r = def.toRow(item); newShadow[table][r.id] = r; });
        }
        shadow = newShadow;
        write(SHADOW_KEY, shadow);
        app.setDb(next);
      }
      setState('ok');
    } catch (e) {
      console.warn('Synchronisatie mislukt:', e);
      if (!session) setState('idle');
      else if (e instanceof TypeError) setState('offline');
      else setState('error', e.message);
    } finally {
      running = false;
      if (again) { again = false; schedule(500); }
    }
  }

  return {
    enabled,
    init(hooks) { app = { ...app, ...hooks }; },
    needsLogin: () => enabled && !session,
    email: () => (session && session.email) || '',
    status: () => ({ state, lastError, pending: pendingCount() }),
    signIn,
    signOut,
    sync,
    schedule,
  };
})();

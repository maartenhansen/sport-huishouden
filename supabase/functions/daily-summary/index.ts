// =====================================================================
// Supabase Edge Function "daily-summary"
//
// Verstuurt het dagoverzicht (openstaande sport en taken) als pushmelding.
//
// Twee manieren om deze functie te starten:
//  1. Door het tijdschema (pg_cron), met de header x-cron-secret.
//     Er wordt alleen verstuurd om 17:30 en 19:00 Belgische tijd,
//     en alleen als er nog iets openstaat.
//  2. Door de knop "Testmelding" in de app, met je eigen login.
//     Dan krijg je meteen een melding, ook als alles gedaan is.
//
// Benodigde secrets (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET
// (SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn automatisch beschikbaar)
// =====================================================================

import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const APP_URL = "https://dailyplanner.hansen-tools.be/";
const TIMEZONE = "Europe/Brussels";
const SEND_TIMES = ["17:30", "19:00"];
const WINDOW_MINUTES = 10; // marge omdat het tijdschema enkele seconden later kan starten

webpush.setVapidDetails(
  APP_URL,
  Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
  Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
);

const CATEGORY_ICONS: Record<string, string> = {
  Padel: "🏓", Tennis: "🎾", Squash: "🏸", Joggen: "🏃",
  Yoga: "🧘", Pilates: "🤸", Krachttraining: "🏋️",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Toegang tot de database met de service-sleutel (alleen hier, op de server)
const dbHeaders: Record<string, string> = SERVICE_KEY.startsWith("eyJ")
  ? { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  : { apikey: SERVICE_KEY };

async function db(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: dbHeaders });
  if (!res.ok) throw new Error(`Database ${res.status}: ${await res.text()}`);
  return res.json();
}

// Huidige datum en tijd in België
function localNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    label: `${parts.hour}:${parts.minute}`,
  };
}

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isSendTime(minutes: number) {
  return SEND_TIMES.some((t) => {
    const [h, m] = t.split(":").map(Number);
    const diff = minutes - (h * 60 + m);
    return diff >= 0 && diff < WINDOW_MINUTES;
  });
}

// Zelfde regels als in de app: sport van vandaag en gisteren, taken van vandaag en te laat
async function openItems(userId: string, today: string) {
  const yesterday = shiftDate(today, -1);
  const user = `user_id=eq.${userId}`;
  const sport = await db(
    `activities?select=category,date,time&${user}&status=eq.gepland&date=in.(${yesterday},${today})&order=date.asc,time.asc.nullslast`,
  );
  const tasks = await db(
    `tasks?select=name,icon,next_date&${user}&next_date=lte.${today}&order=next_date.asc`,
  );
  return [
    ...sport.map((a: { category: string; date: string; time: string | null }) =>
      `${CATEGORY_ICONS[a.category] ?? "•"} ${a.category}${a.time ? " " + a.time.slice(0, 5) : ""}${a.date < today ? " (gisteren)" : ""}`
    ),
    ...tasks.map((t: { name: string; icon: string | null; next_date: string }) =>
      `${t.icon ?? "📋"} ${t.name}${t.next_date < today ? " (te laat)" : ""}`
    ),
  ];
}

function buildMessage(lines: string[], test: boolean) {
  if (!lines.length) {
    return { title: "Alles gedaan voor vandaag 🎉", body: test ? "Testmelding: meldingen werken." : "" };
  }
  const shown = lines.slice(0, 6);
  if (lines.length > shown.length) shown.push(`+ ${lines.length - shown.length} meer`);
  return {
    title: `${test ? "Test · " : ""}Vandaag nog te doen (${lines.length})`,
    body: shown.join("\n"),
  };
}

type Subscription = { endpoint: string; p256dh: string; auth: string; user_id: string };

async function send(sub: Subscription, message: { title: string; body: string }) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ ...message, tag: "dagoverzicht", url: APP_URL }),
      { TTL: 3 * 3600, urgency: "normal" },
    );
    return "verstuurd";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // Toestel bestaat niet meer (app verwijderd of meldingen uitgezet): opruimen
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
        method: "DELETE", headers: dbHeaders,
      });
      return "toestel verwijderd";
    }
    return `fout: ${status ?? (e as Error).message}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const now = localNow();
  let userFilter = "";
  let test = false;

  if (CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET) {
    // Gestart door het tijdschema
    if (!isSendTime(now.minutes)) return json({ overgeslagen: "geen verzendtijd", tijd: now.label });
  } else {
    // Gestart vanuit de app: controleer de login van de gebruiker
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Niet toegestaan" }, 401);
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: auth } });
    if (!res.ok) return json({ error: "Niet toegestaan" }, 401);
    const user = await res.json();
    userFilter = `&user_id=eq.${user.id}`;
    test = true;
  }

  try {
    const subs: Subscription[] = await db(`push_subscriptions?select=endpoint,p256dh,auth,user_id${userFilter}`);
    if (test && !subs.length) return json({ error: "Geen toestel geregistreerd. Zet eerst meldingen aan." }, 400);

    const results: string[] = [];
    const cache = new Map<string, string[]>();
    for (const sub of subs) {
      if (!cache.has(sub.user_id)) cache.set(sub.user_id, await openItems(sub.user_id, now.date));
      const lines = cache.get(sub.user_id)!;
      if (!lines.length && !test) { results.push("niets open"); continue; }
      results.push(await send(sub, buildMessage(lines, test)));
    }
    return json({ tijd: now.label, resultaten: results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

// Koppeling met Supabase.
// - supabaseUrl: de "Project URL" (https://xxxx.supabase.co)
// - supabaseKey: de PUBLIEKE sleutel ("publishable key", sb_publishable_…, of de oude "anon" key)
//
// De publieke sleutel mag in de app staan: Row Level Security in de database zorgt
// dat alleen jij aan je gegevens kan. Zet hier NOOIT de secret / service_role key.
//
// Laat beide leeg om de app zonder cloud te gebruiken (alleen lokale opslag).
window.APP_CONFIG = {
  supabaseUrl: 'https://cyvuznstxbqjlflyjrgd.supabase.co',
  supabaseKey: 'sb_publishable_qmNHZv0aO3cqa-4TL7aEcg_0Ysy9z0I',
  // Publieke sleutel voor pushmeldingen (de bijhorende geheime sleutel staat alleen in Supabase)
  vapidPublicKey: 'BNl5OFAItkTo75I-uFaeznLq0Ec-UBzHBZCblP7RfVjz5ptVDl-VUmg-C7-9o123Jw2lTD19uwah5cQp7mqhTQc',
};

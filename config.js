// Instellingen per omgeving.
// De app kiest zelf de juiste omgeving op basis van het webadres:
//   - dailyplanner.hansen-tools.be        → live (je echte gegevens)
//   - al het andere (dev-site, localhost)  → dev  (aparte testdatabase)
//
// De sleutels hieronder zijn PUBLIEK en mogen in de app staan: Row Level Security
// in de database beschermt je gegevens. Zet hier NOOIT een secret/service_role key.
// Laat supabaseUrl leeg om een omgeving zonder cloud te gebruiken (alleen lokale opslag).
(function () {
  const ENVIRONMENTS = {
    live: {
      supabaseUrl: 'https://cyvuznstxbqjlflyjrgd.supabase.co',
      supabaseKey: 'sb_publishable_qmNHZv0aO3cqa-4TL7aEcg_0Ysy9z0I',
      vapidPublicKey: 'BNl5OFAItkTo75I-uFaeznLq0Ec-UBzHBZCblP7RfVjz5ptVDl-VUmg-C7-9o123Jw2lTD19uwah5cQp7mqhTQc',
    },
    dev: {
      supabaseUrl: '',   // wordt ingevuld zodra het dev-project bestaat
      supabaseKey: '',
      vapidPublicKey: 'BMQdtO5rQDcQlBo0MfynCpDSaeCKgnC_68KyHTOfZs98g2i62MKyydNKVCFdbeBVfutz9_yLhXUXHJp6ADOAG_8',
    },
  };

  const LIVE_HOSTS = ['dailyplanner.hansen-tools.be'];
  const env = LIVE_HOSTS.includes(location.hostname) ? 'live' : 'dev';

  self.APP_ENV = env;
  self.APP_CONFIG = ENVIRONMENTS[env];

  // Dev: eigen naam en oranje icoon bij installeren, zodat je beide apps uit elkaar houdt
  if (env === 'dev' && typeof document !== 'undefined') {
    const link = document.querySelector('link[rel="manifest"]');
    if (link) link.setAttribute('href', 'manifest-dev.webmanifest');
  }
})();

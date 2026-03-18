/**
 * The Bureau — HubSpot Proxy sécurisé
 * Variable d'environnement Netlify requise : HS_TOKEN
 *
 * Vérifie le JWT Netlify Identity avant chaque appel HubSpot.
 * Le token HubSpot n'est jamais exposé côté client.
 */

const TOKEN = process.env.HS_TOKEN;
const SITE_URL = process.env.URL || '';

const cors = {
  'Access-Control-Allow-Origin':  SITE_URL || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

/* Vérifie que la requête vient d'un utilisateur Netlify Identity connecté */
function getIdentityUser(event) {
  const ctx = event.clientContext;
  if (!ctx || !ctx.user) return null;
  return ctx.user; /* { email, sub, user_metadata, ... } */
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  /* Vérification Identity — bloque les non-connectés */
  const user = getIdentityUser(event);
  if (!user) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Non authentifié. Connectez-vous.' }) };
  }

  if (!TOKEN) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'HS_TOKEN non configuré sur Netlify.' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'JSON invalide' }) }; }

  const { action } = payload;
  const hs = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN };

  try {

    /* ── SEARCH contacts ── */
    if (action === 'search') {
      const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method: 'POST', headers: hs,
        body: JSON.stringify({
          query: payload.query, limit: 10,
          properties: ['firstname', 'lastname', 'email', 'company', 'jobtitle'],
        }),
      });
      if (r.status === 401) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Token HubSpot invalide' }) };
      const d = await r.json();
      const contacts = (d.results || []).map(c => ({
        id:        c.id,
        firstname: c.properties.firstname || '',
        lastname:  c.properties.lastname  || '',
        email:     c.properties.email     || '',
        company:   c.properties.company   || '',
        jobtitle:  c.properties.jobtitle  || '',
      }));
      return { statusCode: 200, headers: cors, body: JSON.stringify({ contacts }) };
    }

    /* ── CREATE note (Engagements API) ── */
    if (action === 'note') {
      /* On ajoute le nom de l'utilisateur connecté dans la note */
      const authorLine = '\n\n— Proposition envoyée par ' + (user.email || 'un membre The Bureau');
      const r = await fetch('https://api.hubapi.com/engagements/v1/engagements', {
        method: 'POST', headers: hs,
        body: JSON.stringify({
          engagement:   { active: true, type: 'NOTE', timestamp: Date.now() },
          associations: { contactIds: [payload.contactId], companyIds: [], dealIds: [], ownerIds: [] },
          metadata:     { body: payload.body + authorLine },
        }),
      });
      if (!r.ok) { const e = await r.text(); return { statusCode: r.status, headers: cors, body: JSON.stringify({ error: e }) }; }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    /* ── PATCH contact ── */
    if (action === 'patch_contact') {
      const r = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${payload.contactId}`, {
        method: 'PATCH', headers: hs,
        body: JSON.stringify({ properties: payload.properties }),
      });
      if (!r.ok) { const e = await r.text(); return { statusCode: r.status, headers: cors, body: JSON.stringify({ error: e }) }; }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Action inconnue : ' + action }) };

  } catch (err) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Erreur proxy : ' + err.message }) };
  }
};

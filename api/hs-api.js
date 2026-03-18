/**
 * The Bureau — HubSpot Proxy
 * Vercel Serverless Function (remplace netlify/functions/hs-api.js)
 *
 * Variable d'environnement Vercel requise :
 *   HS_TOKEN = pat-na1-votre-token
 */

const TOKEN = process.env.HS_TOKEN;

module.exports = async function handler(req, res) {
  /* CORS */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!TOKEN) return res.status(500).json({ error: 'HS_TOKEN non configuré' });

  const { action } = req.body || {};
  const hs = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + TOKEN,
  };

  try {

    /* ── SEARCH contacts ── */
    if (action === 'search') {
      const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method: 'POST', headers: hs,
        body: JSON.stringify({
          query: req.body.query, limit: 10,
          properties: ['firstname', 'lastname', 'email', 'company', 'jobtitle'],
        }),
      });
      if (r.status === 401) return res.status(401).json({ error: 'Token HubSpot invalide' });
      const d = await r.json();
      const contacts = (d.results || []).map(c => ({
        id:        c.id,
        firstname: c.properties.firstname || '',
        lastname:  c.properties.lastname  || '',
        email:     c.properties.email     || '',
        company:   c.properties.company   || '',
        jobtitle:  c.properties.jobtitle  || '',
      }));
      return res.status(200).json({ contacts });
    }

    /* ── CREATE note ── */
    if (action === 'note') {
      const r = await fetch('https://api.hubapi.com/engagements/v1/engagements', {
        method: 'POST', headers: hs,
        body: JSON.stringify({
          engagement:   { active: true, type: 'NOTE', timestamp: Date.now() },
          associations: { contactIds: [req.body.contactId], companyIds: [], dealIds: [], ownerIds: [] },
          metadata:     { body: req.body.body },
        }),
      });
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      return res.status(200).json({ ok: true });
    }

    /* ── PATCH contact ── */
    if (action === 'patch_contact') {
      const r = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${req.body.contactId}`, {
        method: 'PATCH', headers: hs,
        body: JSON.stringify({ properties: req.body.properties }),
      });
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Action inconnue : ' + action });

  } catch (err) {
    return res.status(502).json({ error: 'Erreur proxy : ' + err.message });
  }
};

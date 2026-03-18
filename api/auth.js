/**
 * The Bureau — Auth API
 * POST /api/auth
 *
 * Variables d'environnement Vercel requises :
 *   AUTH_USERS = json array: [{"email":"thomas@thebureau.paris","password":"motdepasse"}]
 *   AUTH_SECRET = une chaîne aléatoire longue pour signer les tokens (ex: openssl rand -hex 32)
 */

const USERS  = JSON.parse(process.env.AUTH_USERS  || '[]');
const SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me';

/* Token simple signé (HMAC-SHA256 maison via Web Crypto) */
async function sign(payload) {
  const data    = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const key     = await crypto.subtle.importKey(
    'raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const sigB64 = Buffer.from(sig).toString('base64url');
  return Buffer.from(data).toString('base64url') + '.' + sigB64;
}

async function verify(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const data    = Buffer.from(parts[0], 'base64url').toString();
    const encoder = new TextEncoder();
    const key     = await crypto.subtle.importKey(
      'raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sig = Buffer.from(parts[1], 'base64url');
    const ok  = await crypto.subtle.verify('HMAC', key, sig, encoder.encode(data));
    if (!ok) return null;
    const payload = JSON.parse(data);
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  /* ── VERIFY TOKEN (GET ou POST avec action: verify) ── */
  if (req.method === 'GET' || req.body?.action === 'verify') {
    const token = req.cookies?.tb_session || req.body?.token;
    const payload = await verify(token);
    if (payload) return res.status(200).json({ ok: true, email: payload.email });
    return res.status(401).json({ ok: false });
  }

  /* ── LOGIN ── */
  if (req.method === 'POST') {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Champs manquants' });

    const user = USERS.find(u =>
      u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );

    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    /* Génère un token valable 8h */
    const token = await sign({ email: user.email, exp: Date.now() + 8 * 3600 * 1000 });

    /* Cookie httpOnly sécurisé */
    res.setHeader('Set-Cookie',
      `tb_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`
    );

    return res.status(200).json({ ok: true, email: user.email });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

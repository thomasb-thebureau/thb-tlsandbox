import { NextResponse } from 'next/server';

const SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me';

async function verifyToken(token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  try {
    const data    = atob(parts[0].replace(/-/g,'+').replace(/_/g,'/'));
    const encoder = new TextEncoder();
    const key     = await crypto.subtle.importKey(
      'raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = Uint8Array.from(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));
    if (!ok) return false;
    const payload = JSON.parse(data);
    if (payload.exp && Date.now() > payload.exp) return false;
    return true;
  } catch { return false; }
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  /* Laisse passer les appels API auth sans vérification */
  if (pathname.startsWith('/api/auth')) return NextResponse.next();
  /* Laisse passer les assets statiques */
  if (pathname.match(/\.(json|txt|ico|png|jpg|svg|css|js)$/)) return NextResponse.next();

  /* Vérifie le cookie de session */
  const token = req.cookies.get('tb_session')?.value;
  const valid = await verifyToken(token);

  if (!valid) {
    /* Redirige vers la page de login (anchor) */
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.hash = 'login';
    /* Pour une SPA, on laisse passer et le JS gère l'overlay */
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

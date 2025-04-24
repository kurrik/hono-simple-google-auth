/** @jsx jsx */
export type { GoogleAuthEnv } from './types';
export { createKVSessionStore } from './kvSessionStore';
export { GoogleSignInButton } from './GoogleSignInButton';
import type { Env as HonoEnv } from 'hono';
import { MiddlewareHandler, Hono } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import type { HonoSimpleGoogleAuthOptionsProvider, ValidSessionData, SigninCallbackData, TokenInfo, GoogleAuthEnv } from './types';
import { GoogleSignInButton } from './GoogleSignInButton';

// Helper: Verify Google ID token (from src/auth.ts)
async function verifyCredential(credential: string): Promise<TokenInfo | null> {
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Export a Hono sub-app and session middleware for Google authentication
// Usage:
//   const googleAuth = honoSimpleGoogleAuth(provider)
//   app.route('/auth', googleAuth.routes)
//   app.use('/your-path', googleAuth.session)
// See README for full usage.
export function honoSimpleGoogleAuth<Env extends HonoEnv = HonoEnv>(
  provider: HonoSimpleGoogleAuthOptionsProvider<GoogleAuthEnv & Env>
): {
  routes: Hono<GoogleAuthEnv & Env, {}, "/">,
  session: MiddlewareHandler<GoogleAuthEnv & Env>
} {
  // Middleware to resolve options and inject into context
  const optionsMiddleware: MiddlewareHandler<GoogleAuthEnv & Env> = async (c, next) => {
    const options = await provider(c);
    c.set('googleAuthOptions', options);
    await next();
  };

  // Session middleware (for use on any route)
  const sessionMiddleware: MiddlewareHandler<GoogleAuthEnv & Env> = async (c, next) => {
    // Always inject options first
    await optionsMiddleware(c, async () => {
      const options = c.var.googleAuthOptions!;
      const COOKIE_NAME = options.cookieName || 'auth_session_cookie';
      const sessionStore = options.sessionStore;
      const sessionId = getCookie(c, COOKIE_NAME);
      if (sessionId) {
        const session = await sessionStore.get(sessionId);
        if (session) {
          c.set('session', session);
        } else {
          c.set('session', { signedIn: false, error: 'Session not found' });
        }
      } else {
        c.set('session', { signedIn: false, error: 'No session cookie' });
      }
      await next();
    });
  };

  const router = new Hono<GoogleAuthEnv & Env, {}, "/">();
  router.use(optionsMiddleware);

  // /signin: Render Google Sign-In button
  router.get('/signin', async (c) => {
    const options = c.var.googleAuthOptions!;
    const COOKIE_NAME = options.cookieName || 'auth_session_cookie';
    const sessionStore = options.sessionStore;
    const sessionId = getCookie(c, COOKIE_NAME);
    let session: ValidSessionData | undefined = undefined;
    if (sessionId) session = await sessionStore.get(sessionId);
    if (session && session.signedIn) {
      return c.redirect('/');
    }
    const clientId = options.clientId;
    const loginUri = options.callbackUrl;
    if (options.renderSignInPage) {
      const page = options.renderSignInPage({ clientId, loginUri });
      return c.html(page ? page.toString() : '');
    } else {
      const page = <GoogleSignInButton clientId={clientId} loginUri={loginUri} />;
      return c.html(page.toString());
    }
  });

  // /auth: Google callback
  router.post('/auth', async (c) => {
    const options = c.var.googleAuthOptions!;
    const COOKIE_NAME = options.cookieName || 'auth_session_cookie';
    const COOKIE_DOMAIN = options.cookieDomain;
    const SESSION_DURATION = options.sessionDurationSeconds || 3600 * 24 * 365;
    const sessionStore = options.sessionStore;
    const data = await c.req.parseBody() as SigninCallbackData;
    const tokenInfo = await verifyCredential(data.credential);
    if (tokenInfo) {
      const session: ValidSessionData = {
        signedIn: true,
        sessionId: crypto.randomUUID(),
        name: tokenInfo.name,
        email: tokenInfo.email,
        credential: data.credential,
      };
      await sessionStore.put(session);
      setCookie(c, COOKIE_NAME, session.sessionId, {
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: SESSION_DURATION,
        ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {})
      });
      return c.redirect('/');
    }
    return c.text('Invalid Google Sign-In');
  });

  // /signout: Clear cookie
  router.get('/signout', async (c) => {
    const options = c.var.googleAuthOptions!;
    const COOKIE_NAME = options.cookieName || 'auth_session_cookie';
    const COOKIE_DOMAIN = options.cookieDomain;
    setCookie(c, COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 0,
      ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {})
    });
    return c.redirect('/');
  });



  // Attach middleware directly to router and return it
  return {
    routes: router,
    session: sessionMiddleware
  };
}

/** @jsx jsx */
import { jsx } from 'hono/jsx';
// hono-simple-google-auth: Hono middleware for Google authentication
// Sets up /signin, /auth, /signout and injects session info into context

import { Context, MiddlewareHandler, Next, Hono } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import type { HonoSimpleGoogleAuthOptions, ValidSessionData, SessionData, SigninCallbackData, TokenInfo } from './types';
import { GoogleSignInButton } from './GoogleSignInButton';

export type HonoSimpleGoogleAuthContext = Context & { var: { session?: SessionData } };

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

// Export a Hono sub-app for Google authentication and session injection
// Usage: mainApp.route('/auth', honoSimpleGoogleAuth(options))
import type { Env as HonoEnv } from 'hono';

export function honoSimpleGoogleAuth<Env extends HonoEnv = HonoEnv>(options: HonoSimpleGoogleAuthOptions): Hono<Env, {}, "/"> {
  const COOKIE_NAME = options.cookieName || 'auth_session_cookie';
  const COOKIE_DOMAIN = options.cookieDomain;
  const SESSION_DURATION = options.sessionDurationSeconds || 3600 * 24 * 365;
  const sessionStore = options.sessionStore;
  const router = new Hono();

  // /signin: Render Google Sign-In button
  router.get('/signin', async (c) => {
    const sessionId = getCookie(c, COOKIE_NAME);
    let session: ValidSessionData | undefined = undefined;
    if (sessionId) session = await sessionStore.get(sessionId);
    if (session && session.signedIn) {
      return c.redirect('/');
    }
    // Allow users to customize the sign-in page by providing a TSX component in options.renderSignInPage.
    // If not provided, use the default GoogleSignInButton.
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
    setCookie(c, COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 0,
      ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {})
    });
    return c.redirect('/');
  });

  // Mount the auth router on the main app
  // The user should call app.route('/', honoSimpleGoogleAuth(...))

  // Middleware: Inject session info into c.var.session (cast to add .var)
  const sessionMiddleware: MiddlewareHandler = async (c, next) => {
    // Inject session info for downstream handlers
    const ctx = c as HonoSimpleGoogleAuthContext;
    const sessionId = getCookie(c, COOKIE_NAME);
    if (sessionId) {
      const session = await sessionStore.get(sessionId);
      if (session) {
        ctx.var.session = session;
      } else {
        ctx.var.session = { signedIn: false, error: 'Session not found' };
      }
    } else {
      ctx.var.session = { signedIn: false, error: 'No session cookie' };
    }
    await next();
  };

  // Return a composed Hono instance with session injection and routes
  const composed = new Hono<Env, {}, "/">();
  composed.use(sessionMiddleware);
  composed.route('/', router);
  return composed;
}

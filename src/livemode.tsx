/** @jsx jsx */
import { setCookie, getCookie } from 'hono/cookie';
import type { ValidSessionData, SigninCallbackData, TokenInfo, HonoSimpleGoogleAuthImplementationMiddleware, HonoSimpleGoogleAuthImplementation, HonoSimpleGoogleAuthImplementationHandler } from './types';
import { GoogleSignInButton } from './GoogleSignInButton';

// Helper: Verify Google ID token
async function verifyCredential(credential: string): Promise<TokenInfo | null> {
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export class LivemodeAuthImplementation implements HonoSimpleGoogleAuthImplementation {
  sessionMiddlewareImpl: HonoSimpleGoogleAuthImplementationMiddleware = async (c, options, next) => {
    const COOKIE_NAME = options.cookieName || 'auth_session_cookie';
    const sessionStore = options.sessionStore;
    const sessionId = getCookie(c, COOKIE_NAME);
    if (sessionId) {
      try {
        const session = await sessionStore.get(sessionId);
        if (session) {
          c.set('session', session);
        } else {
          c.set('session', { signedIn: false, error: 'Session not found' });
        }
      } catch (error) {
        c.set('session', { signedIn: false, error: 'Session store error' });
      }
    } else {
      c.set('session', { signedIn: false, error: 'No session cookie' });
    }
    await next();
  };

  signinImpl: HonoSimpleGoogleAuthImplementationHandler = async (c, options) => {
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
  }

  callbackImpl: HonoSimpleGoogleAuthImplementationHandler = async (c, options) => {
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
  }

  signoutImpl: HonoSimpleGoogleAuthImplementationHandler = async (c, options) => {
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
  }
};
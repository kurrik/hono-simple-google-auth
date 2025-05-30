/** @jsx jsx */
export type { GoogleAuthEnv } from './types';
export { createKVSessionStore } from './kvSessionStore';
export { GoogleSignInButton } from './GoogleSignInButton';
import type { Env as HonoEnv } from 'hono';
import { MiddlewareHandler, Hono } from 'hono';
import type { HonoSimpleGoogleAuthOptionsProvider, GoogleAuthEnv } from './types';
import { LivemodeAuthImplementation } from './livemode';
import { TestmodeAuthImplementation } from './testmode';


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
  // Middleware to inject resolved options into context
  const optionsMiddleware: MiddlewareHandler<GoogleAuthEnv & Env> = async (c, next) => {
    const options = await provider(c);
    c.set('googleAuthOptions', options);
    if (options.mode === 'testmode') {
      const authImplementation = new TestmodeAuthImplementation();
      c.set('authImplementation', authImplementation);
    } else {
      const authImplementation = new LivemodeAuthImplementation();
      c.set('authImplementation', authImplementation);
    }
    await next();
  };

  // Session middleware (for use on any route)
  const sessionMiddleware: MiddlewareHandler<GoogleAuthEnv & Env> = async (c, next) => {
    // Always inject options first
    await optionsMiddleware(c, async () => {
      const options = c.var.googleAuthOptions!;
      const authImplementation = c.var.authImplementation;
      await authImplementation.sessionMiddlewareImpl(c, options, next);
    });
  };

  const router = new Hono<GoogleAuthEnv & Env, {}, "/">();
  router.use("*", optionsMiddleware);

  // /signin: Render Google Sign-In button (GET) or handle test signin (POST)
  router.get('/signin', async (c) => {
    const options = c.var.googleAuthOptions!;
    const authImplementation = c.var.authImplementation;
    return authImplementation.signinImpl(c, options);
  });

  // /test/signin: Sets test signin data.
  router.post('/test/signin', async (c) => {
    const options = c.var.googleAuthOptions!;
    const authImplementation = c.var.authImplementation;
    if (!authImplementation.testSigninImpl) {
      return c.json({ error: 'Testmode not enabled' }, 400);
    }
    return authImplementation.testSigninImpl(c, options);
  });

  // /callback: Google callback
  router.post('/callback', async (c) => {
    const options = c.var.googleAuthOptions!
    const authImplementation = c.var.authImplementation;
    return authImplementation.callbackImpl(c, options);
  });

  // /signout: Clear cookie
  router.get('/signout', async (c) => {
    const options = c.var.googleAuthOptions!;
    const authImplementation = c.var.authImplementation;
    return authImplementation.signoutImpl(c, options);
  });

  return {
    routes: router,
    session: sessionMiddleware
  };
}

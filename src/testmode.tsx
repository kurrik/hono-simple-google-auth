/** @jsx jsx */
import type { ValidSessionData, HonoSimpleGoogleAuthImplementation, HonoSimpleGoogleAuthImplementationHandler, HonoSimpleGoogleAuthImplementationMiddleware, HonoSimpleGoogleAuthOptions } from './types';

export class TestmodeAuthImplementation implements HonoSimpleGoogleAuthImplementation {
  private static readonly TEST_SESSION_ID = 'testmode-session';

  sessionMiddlewareImpl: HonoSimpleGoogleAuthImplementationMiddleware = async (c, options, next) => {
    const sessionStore = options.sessionStore;
    try {
      const session = await sessionStore.get(TestmodeAuthImplementation.TEST_SESSION_ID);
      if (session) {
        c.set('session', session);
      } else {
        c.set('session', { signedIn: false, error: 'No test session' });
      }
    } catch (error) {
      c.set('session', { signedIn: false, error: 'Session store error' });
    }
    await next();
  };

  signinImpl: HonoSimpleGoogleAuthImplementationHandler = async (c, options) => {
    const sessionStore = options.sessionStore;
    try {
      const currentSession = await sessionStore.get(TestmodeAuthImplementation.TEST_SESSION_ID);
      if (currentSession) {
        return c.json({
          message: 'Already signed in',
          session: currentSession
        });
      }
    } catch (error) {
      // Continue to render form if session store fails
    }

    return c.html(`
      <html>
        <body>
          <h1>Test Mode Sign In</h1>
          <p>POST to /auth/test/signin with JSON: {"email": "user@example.com", "name": "User Name"}</p>
          <form id="testSignin">
            <input type="text" id="name" placeholder="Name" required />
            <input type="email" id="email" placeholder="Email" required />
            <button type="submit">Sign In</button>
          </form>
          <script>
            document.getElementById('testSignin').onsubmit = async (e) => {
              e.preventDefault();
              const name = document.getElementById('name').value;
              const email = document.getElementById('email').value;
              const response = await fetch('/auth/test/signin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email })
              });
              const result = await response.json();
              if (result.success) {
                window.location.href = '/';
              } else {
                alert('Error: ' + result.error);
              }
            };
          </script>
        </body>
      </html>
    `);
  };

  testSigninImpl?: HonoSimpleGoogleAuthImplementationHandler = async (c, options) => {
    let data: { email: string; name: string };
    try {
      data = await c.req.json() as { email: string; name: string };
    } catch (error) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    
    if (!data.email || !data.name) {
      return c.json({ error: 'email and name are required' }, 400);
    }

    // Store session in session store
    const sessionStore = options.sessionStore;
    const session: ValidSessionData = {
      signedIn: true,
      sessionId: TestmodeAuthImplementation.TEST_SESSION_ID,
      name: data.name,
      email: data.email,
      credential: 'test-credential',
    };

    try {
      await sessionStore.put(session);
      return c.json({ success: true, session });
    } catch (error) {
      return c.json({ error: 'Failed to store session' }, 500);
    }
  };

  callbackImpl: HonoSimpleGoogleAuthImplementationHandler = async (c, _options) => {
    // In testmode, no callback is needed since signin is direct
    return c.redirect('/');
  };

  signoutImpl: HonoSimpleGoogleAuthImplementationHandler = async (c, options) => {
    // Clear the session from session store
    const sessionStore = options.sessionStore;
    try {
      if (sessionStore.delete) {
        await sessionStore.delete(TestmodeAuthImplementation.TEST_SESSION_ID);
      }
    } catch (error) {
      // Continue with redirect even if delete fails
    }
    return c.redirect('/');
  };
}
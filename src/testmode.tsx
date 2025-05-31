/** @jsx jsx */
import type { ValidSessionData, HonoSimpleGoogleAuthImplementation, HonoSimpleGoogleAuthImplementationHandler, HonoSimpleGoogleAuthImplementationMiddleware, HonoSimpleGoogleAuthOptions } from './types';

export class TestmodeAuthImplementation implements HonoSimpleGoogleAuthImplementation {
  private static readonly TEST_SESSION_ID = 'testmode-session';

  sessionMiddlewareImpl: HonoSimpleGoogleAuthImplementationMiddleware = async (c, options, next) => {
    const sessionStore = options.sessionStore;
    
    // Check for session ID in cookie, fallback to default TEST_SESSION_ID
    const cookieHeader = c.req.header('cookie');
    let sessionId = TestmodeAuthImplementation.TEST_SESSION_ID;
    
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(cookie => cookie.trim());
      const sessionCookie = cookies.find(cookie => cookie.startsWith('testmode-session-id='));
      if (sessionCookie) {
        sessionId = sessionCookie.split('=')[1];
      }
    }
    
    try {
      const session = await sessionStore.get(sessionId);
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
    
    // Check for session ID in cookie, fallback to default TEST_SESSION_ID
    const cookieHeader = c.req.header('cookie');
    let sessionId = TestmodeAuthImplementation.TEST_SESSION_ID;
    
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(cookie => cookie.trim());
      const sessionCookie = cookies.find(cookie => cookie.startsWith('testmode-session-id='));
      if (sessionCookie) {
        sessionId = sessionCookie.split('=')[1];
      }
    }
    
    try {
      const currentSession = await sessionStore.get(sessionId);
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
          <p>POST to /auth/test/signin with JSON: {"email": "user@example.com", "name": "User Name", "sessionID": "optional-session-id"}</p>
          <form id="testSignin">
            <input type="text" id="name" placeholder="Name" required />
            <input type="email" id="email" placeholder="Email" required />
            <input type="text" id="sessionID" placeholder="Session ID" value="` + Date.now() + `" />
            <button type="submit">Sign In</button>
          </form>
          <script>
            document.getElementById('testSignin').onsubmit = async (e) => {
              e.preventDefault();
              const name = document.getElementById('name').value;
              const email = document.getElementById('email').value;
              const sessionID = document.getElementById('sessionID').value;
              const payload = { name, email };
              if (sessionID) {
                payload.sessionID = sessionID;
              }
              const response = await fetch('/auth/test/signin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
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
    let data: { email: string; name: string; sessionID?: string };
    try {
      data = await c.req.json() as { email: string; name: string; sessionID?: string };
    } catch (error) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    
    if (!data.email || !data.name) {
      return c.json({ error: 'email and name are required' }, 400);
    }

    // Use provided sessionID or default to TEST_SESSION_ID
    const sessionId = data.sessionID || TestmodeAuthImplementation.TEST_SESSION_ID;

    // Store session in session store
    const sessionStore = options.sessionStore;
    const session: ValidSessionData = {
      signedIn: true,
      sessionId: sessionId,
      name: data.name,
      email: data.email,
      credential: 'test-credential',
    };

    try {
      await sessionStore.put(session);
      
      // Set session cookie if custom sessionID was provided
      if (data.sessionID) {
        c.header('Set-Cookie', `testmode-session-id=${sessionId}; Path=/; SameSite=Lax`);
      }
      
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
    
    // Check for session ID in cookie, fallback to default TEST_SESSION_ID
    const cookieHeader = c.req.header('cookie');
    let sessionId = TestmodeAuthImplementation.TEST_SESSION_ID;
    
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(cookie => cookie.trim());
      const sessionCookie = cookies.find(cookie => cookie.startsWith('testmode-session-id='));
      if (sessionCookie) {
        sessionId = sessionCookie.split('=')[1];
      }
    }
    
    try {
      if (sessionStore.delete) {
        await sessionStore.delete(sessionId);
      }
      
      // Clear the session cookie if it exists
      if (sessionId !== TestmodeAuthImplementation.TEST_SESSION_ID) {
        c.header('Set-Cookie', 'testmode-session-id=; Path=/; SameSite=Lax; Max-Age=0');
      }
    } catch (error) {
      // Continue with redirect even if delete fails
    }
    return c.redirect('/');
  };
}
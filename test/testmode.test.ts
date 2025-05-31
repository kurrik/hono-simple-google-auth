import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { honoSimpleGoogleAuth } from '../src/index';
import { Hono } from 'hono';
import type { ValidSessionData, GoogleAuthEnv } from '../src/types';

// Mock environment for testmode
type TestEnv = GoogleAuthEnv & {
  Bindings: {
    GOOGLE_CLIENT_ID: string;
  }
}

describe('Testmode Implementation', () => {
  // Create a simple in-memory session store for testing
  const sessionData = new Map<string, ValidSessionData>();
  
  const sessionStore = {
    async get(sessionId: string): Promise<ValidSessionData | undefined> {
      return sessionData.get(sessionId);
    },
    async put(data: ValidSessionData): Promise<void> {
      sessionData.set(data.sessionId, data);
    },
    async delete(sessionId: string): Promise<void> {
      sessionData.delete(sessionId);
    },
  };

  let app: Hono<TestEnv>;

  beforeEach(() => {
    sessionData.clear(); // Clear session data between tests

    app = new Hono<TestEnv>();

    // Create options object once so the same session store instance is reused
    const options = {
      clientId: 'test-client-id',
      callbackUrl: 'http://localhost:3000/auth/callback',
      sessionStore,
      mode: 'testmode' as const,
    };

    const googleAuth = honoSimpleGoogleAuth<TestEnv>(async (_c) => options);

    app.route('/auth', googleAuth.routes);

    // Protected routes for testing session middleware
    app.use('/api/*', googleAuth.session);
    app.get('/api/me', async (c) => {
      const session = c.var.session;
      if (!session?.signedIn) return c.json({ error: 'Not authenticated' }, 401);
      return c.json({ name: session.name, email: session.email });
    });

    // Public route with optional session
    app.use('/', googleAuth.session);
    app.get('/', (c) => {
      const session = c.var.session;
      if (session?.signedIn) {
        return c.json({ message: `Hello, ${session.name}!`, authenticated: true });
      }
      return c.json({ message: 'Hello, anonymous!', authenticated: false });
    });
  });

  describe('GET /signin', () => {
    it('should render test signin form when not authenticated', async () => {
      const response = await app.request('/auth/signin');
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('Test Mode Sign In');
      expect(html).toContain('<form id="testSignin">');
      expect(html).toContain('POST to /auth/test/signin with JSON');
    });

    it('should return session info when already signed in', async () => {
      // First sign in
      await app.request('/auth/test/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test User', email: 'test@example.com' })
      });

      // Then try to access signin again
      const response = await app.request('/auth/signin');
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.message).toBe('Already signed in');
      expect(data.session).toEqual({
        signedIn: true,
        sessionId: 'testmode-session',
        name: 'Test User',
        email: 'test@example.com',
        credential: 'test-credential',
      });
    });
  });

  describe('POST /test/signin', () => {
    it('should create session with valid email and name', async () => {
      const response = await app.request('/auth/test/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John Doe', email: 'john@example.com' })
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.session).toEqual({
        signedIn: true,
        sessionId: 'testmode-session',
        name: 'John Doe',
        email: 'john@example.com',
        credential: 'test-credential',
      });
    });

    it('should return 400 for missing email', async () => {
      const response = await app.request('/auth/test/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John Doe' })
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('email and name are required');
    });

    it('should return 400 for missing name', async () => {
      const response = await app.request('/auth/test/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'john@example.com' })
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('email and name are required');
    });

    it('should return 400 for invalid JSON', async () => {
      const response = await app.request('/auth/test/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('Invalid JSON body');
    });

    it('should handle empty email or name', async () => {
      const response = await app.request('/auth/test/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', email: 'john@example.com' })
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('email and name are required');
    });
  });

  describe('GET /signout', () => {
    it('should clear session and redirect', async () => {
      // First sign in
      await app.request('/auth/test/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test User', email: 'test@example.com' })
      });

      // Verify we're signed in
      const beforeSignout = await app.request('/');
      const beforeData = await beforeSignout.json() as any;
      expect(beforeData.authenticated).toBe(true);

      // Sign out
      const signoutResponse = await app.request('/auth/signout');
      expect(signoutResponse.status).toBe(302);
      expect(signoutResponse.headers.get('Location')).toBe('/');

      // Verify we're signed out
      const afterSignout = await app.request('/');
      const afterData = await afterSignout.json() as any;
      expect(afterData.authenticated).toBe(false);
    });
  });

  describe('Session Middleware Integration', () => {
    it('should provide session data to protected routes after signin', async () => {
      // First sign in
      await app.request('/auth/test/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Jane Smith', email: 'jane@example.com' })
      });

      // Access protected route
      const response = await app.request('/api/me');
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toEqual({ name: 'Jane Smith', email: 'jane@example.com' });
    });

    it('should return 401 for protected routes when not signed in', async () => {
      const response = await app.request('/api/me');
      expect(response.status).toBe(401);
      const data = await response.json() as any;
      expect(data).toEqual({ error: 'Not authenticated' });
    });

    it('should return 401 for protected routes after signout', async () => {
      // Sign in
      await app.request('/auth/test/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test User', email: 'test@example.com' })
      });

      // Verify access works
      const beforeResponse = await app.request('/api/me');
      expect(beforeResponse.status).toBe(200);

      // Sign out
      await app.request('/auth/signout');

      // Verify access is denied
      const afterResponse = await app.request('/api/me');
      expect(afterResponse.status).toBe(401);
    });

    it('should handle multiple users with different instances', async () => {
      // Create a second app instance with its own session store
      const sessionData2 = new Map<string, ValidSessionData>();
      const sessionStore2 = {
        async get(sessionId: string): Promise<ValidSessionData | undefined> {
          return sessionData2.get(sessionId);
        },
        async put(data: ValidSessionData): Promise<void> {
          sessionData2.set(data.sessionId, data);
        },
        async delete(sessionId: string): Promise<void> {
          sessionData2.delete(sessionId);
        },
      };
      
      const app2 = new Hono<TestEnv>();
      const googleAuth2 = honoSimpleGoogleAuth<TestEnv>(async (_c) => ({
        clientId: 'test-client-id-2',
        callbackUrl: 'http://localhost:3000/auth/callback',
        sessionStore: sessionStore2,
        mode: 'testmode',
      }));
      app2.route('/auth', googleAuth2.routes);
      app2.use('/api/*', googleAuth2.session);
      app2.get('/api/me', async (c) => {
        const session = c.var.session;
        if (!session?.signedIn) return c.json({ error: 'Not authenticated' }, 401);
        return c.json({ name: session.name, email: session.email });
      });

      // Sign in user 1 on app1
      await app.request('/auth/test/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'User One', email: 'user1@example.com' })
      });

      // Sign in user 2 on app2
      await app2.request('/auth/test/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'User Two', email: 'user2@example.com' })
      });

      // Verify each app has its own session
      const app1Response = await app.request('/api/me');
      const app1Data = await app1Response.json() as any;
      expect(app1Data.name).toBe('User One');

      const app2Response = await app2.request('/api/me');
      const app2Data = await app2Response.json() as any;
      expect(app2Data.name).toBe('User Two');
    });
  });

  describe('POST /callback', () => {
    it('should redirect to home (no-op in testmode)', async () => {
      const response = await app.request('/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ some: 'data' })
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/');
    });
  });

  describe('Session Scoping with Custom Session IDs', () => {
    describe('POST /test/signin with sessionID', () => {
      it('should create session with custom sessionID and set cookie', async () => {
        const customSessionId = 'custom-session-123';
        const response = await app.request('/auth/test/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'John Doe', 
            email: 'john@example.com',
            sessionID: customSessionId
          })
        });

        expect(response.status).toBe(200);
        const data = await response.json() as any;
        expect(data.success).toBe(true);
        expect(data.session).toEqual({
          signedIn: true,
          sessionId: customSessionId,
          name: 'John Doe',
          email: 'john@example.com',
          credential: 'test-credential',
        });

        // Check that cookie was set
        const setCookieHeader = response.headers.get('Set-Cookie');
        expect(setCookieHeader).toContain(`testmode-session-id=${customSessionId}`);
        expect(setCookieHeader).toContain('Path=/');
        expect(setCookieHeader).toContain('SameSite=Lax');
        expect(setCookieHeader).not.toContain('HttpOnly');
      });

      it('should create session with default sessionID when no sessionID provided', async () => {
        const response = await app.request('/auth/test/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'Jane Doe', 
            email: 'jane@example.com'
          })
        });

        expect(response.status).toBe(200);
        const data = await response.json() as any;
        expect(data.success).toBe(true);
        expect(data.session.sessionId).toBe('testmode-session');

        // Check that no cookie was set for default session
        const setCookieHeader = response.headers.get('Set-Cookie');
        expect(setCookieHeader).toBeNull();
      });

      it('should not set cookie when sessionID is empty string', async () => {
        const response = await app.request('/auth/test/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'Jane Doe', 
            email: 'jane@example.com',
            sessionID: ''
          })
        });

        expect(response.status).toBe(200);
        const data = await response.json() as any;
        expect(data.session.sessionId).toBe('testmode-session');

        // Check that no cookie was set for empty sessionID
        const setCookieHeader = response.headers.get('Set-Cookie');
        expect(setCookieHeader).toBeNull();
      });
    });

    describe('Session middleware with cookies', () => {
      it('should use sessionID from cookie for authentication', async () => {
        const customSessionId = 'cookie-session-456';
        
        // First, create a session with custom ID
        await app.request('/auth/test/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'Cookie User', 
            email: 'cookie@example.com',
            sessionID: customSessionId
          })
        });

        // Then make a request with the session cookie
        const response = await app.request('/api/me', {
          headers: {
            'Cookie': `testmode-session-id=${customSessionId}`
          }
        });

        expect(response.status).toBe(200);
        const data = await response.json() as any;
        expect(data).toEqual({ 
          name: 'Cookie User', 
          email: 'cookie@example.com' 
        });
      });

      it('should return unauthenticated when sessionID in cookie has no session data', async () => {
        const nonExistentSessionId = 'non-existent-session';
        
        const response = await app.request('/api/me', {
          headers: {
            'Cookie': `testmode-session-id=${nonExistentSessionId}`
          }
        });

        expect(response.status).toBe(401);
        const data = await response.json() as any;
        expect(data).toEqual({ error: 'Not authenticated' });
      });

      it('should fallback to default session when no cookie present', async () => {
        // Create a default session
        await app.request('/auth/test/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'Default User', 
            email: 'default@example.com'
          })
        });

        // Make request without cookie
        const response = await app.request('/api/me');
        expect(response.status).toBe(200);
        const data = await response.json() as any;
        expect(data).toEqual({ 
          name: 'Default User', 
          email: 'default@example.com' 
        });
      });

      it('should handle malformed cookies gracefully', async () => {
        const response = await app.request('/api/me', {
          headers: {
            'Cookie': 'testmode-session-id=; some-other-cookie=value'
          }
        });

        expect(response.status).toBe(401);
        const data = await response.json() as any;
        expect(data).toEqual({ error: 'Not authenticated' });
      });
    });

    describe('Session isolation between different sessionIDs', () => {
      it('should maintain separate sessions for different sessionIDs', async () => {
        const sessionId1 = 'session-1';
        const sessionId2 = 'session-2';

        // Create first session
        await app.request('/auth/test/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'User One', 
            email: 'user1@example.com',
            sessionID: sessionId1
          })
        });

        // Create second session
        await app.request('/auth/test/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'User Two', 
            email: 'user2@example.com',
            sessionID: sessionId2
          })
        });

        // Test first session
        const response1 = await app.request('/api/me', {
          headers: { 'Cookie': `testmode-session-id=${sessionId1}` }
        });
        expect(response1.status).toBe(200);
        const data1 = await response1.json() as any;
        expect(data1).toEqual({ name: 'User One', email: 'user1@example.com' });

        // Test second session
        const response2 = await app.request('/api/me', {
          headers: { 'Cookie': `testmode-session-id=${sessionId2}` }
        });
        expect(response2.status).toBe(200);
        const data2 = await response2.json() as any;
        expect(data2).toEqual({ name: 'User Two', email: 'user2@example.com' });
      });

      it('should not affect other sessions when one is signed out', async () => {
        const sessionId1 = 'session-to-keep';
        const sessionId2 = 'session-to-signout';

        // Create both sessions
        await app.request('/auth/test/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'Keep User', 
            email: 'keep@example.com',
            sessionID: sessionId1
          })
        });

        await app.request('/auth/test/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'Signout User', 
            email: 'signout@example.com',
            sessionID: sessionId2
          })
        });

        // Sign out the second session
        const signoutResponse = await app.request('/auth/signout', {
          headers: { 'Cookie': `testmode-session-id=${sessionId2}` }
        });
        expect(signoutResponse.status).toBe(302);

        // Verify first session still works
        const response1 = await app.request('/api/me', {
          headers: { 'Cookie': `testmode-session-id=${sessionId1}` }
        });
        expect(response1.status).toBe(200);
        const data1 = await response1.json() as any;
        expect(data1).toEqual({ name: 'Keep User', email: 'keep@example.com' });

        // Verify second session is gone
        const response2 = await app.request('/api/me', {
          headers: { 'Cookie': `testmode-session-id=${sessionId2}` }
        });
        expect(response2.status).toBe(401);
      });
    });

    describe('Signout with session scoping', () => {
      it('should clear session cookie when signing out custom session', async () => {
        const customSessionId = 'signout-session-789';
        
        // Create session
        await app.request('/auth/test/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'Signout User', 
            email: 'signout@example.com',
            sessionID: customSessionId
          })
        });

        // Sign out
        const signoutResponse = await app.request('/auth/signout', {
          headers: { 'Cookie': `testmode-session-id=${customSessionId}` }
        });

        expect(signoutResponse.status).toBe(302);
        expect(signoutResponse.headers.get('Location')).toBe('/');

        // Check that cookie was cleared
        const setCookieHeader = signoutResponse.headers.get('Set-Cookie');
        expect(setCookieHeader).toContain('testmode-session-id=;');
        expect(setCookieHeader).toContain('Max-Age=0');
        expect(setCookieHeader).toContain('Path=/');
        expect(setCookieHeader).toContain('SameSite=Lax');
      });

      it('should not clear cookie when signing out default session', async () => {
        // Create default session
        await app.request('/auth/test/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'Default User', 
            email: 'default@example.com'
          })
        });

        // Sign out without cookie
        const signoutResponse = await app.request('/auth/signout');
        expect(signoutResponse.status).toBe(302);

        // Check that no cookie clearing header was set
        const setCookieHeader = signoutResponse.headers.get('Set-Cookie');
        expect(setCookieHeader).toBeNull();
      });

      it('should handle signout when session does not exist', async () => {
        const nonExistentSessionId = 'non-existent-signout';
        
        const signoutResponse = await app.request('/auth/signout', {
          headers: { 'Cookie': `testmode-session-id=${nonExistentSessionId}` }
        });

        expect(signoutResponse.status).toBe(302);
        expect(signoutResponse.headers.get('Location')).toBe('/');

        // Should still try to clear the cookie
        const setCookieHeader = signoutResponse.headers.get('Set-Cookie');
        expect(setCookieHeader).toContain('testmode-session-id=;');
        expect(setCookieHeader).toContain('Max-Age=0');
      });
    });

    describe('Signin form with session scoping', () => {
      it('should include sessionID input field in signin form', async () => {
        const response = await app.request('/auth/signin');
        expect(response.status).toBe(200);
        const html = await response.text();
        
        expect(html).toContain('id="sessionID"');
        expect(html).toContain('placeholder="Session ID"');
        expect(html).toContain('sessionID');
        expect(html).toContain('"sessionID": "optional-session-id"');
      });

      it('should show already signed in message when accessing signin with custom session', async () => {
        const customSessionId = 'signin-check-session';
        
        // Create custom session
        await app.request('/auth/test/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'Signin Check User', 
            email: 'signin@example.com',
            sessionID: customSessionId
          })
        });

        // Access signin page with cookie
        const response = await app.request('/auth/signin', {
          headers: { 'Cookie': `testmode-session-id=${customSessionId}` }
        });

        expect(response.status).toBe(200);
        const data = await response.json() as any;
        expect(data.message).toBe('Already signed in');
        expect(data.session.sessionId).toBe(customSessionId);
        expect(data.session.name).toBe('Signin Check User');
      });
    });
  });
});
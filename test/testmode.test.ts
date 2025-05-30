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
});
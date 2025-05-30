import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { honoSimpleGoogleAuth } from '../src/index';
import { Hono } from 'hono';
import type { ValidSessionData, GoogleAuthEnv } from '../src/types';

// Mock environment for Cloudflare-style setup
type TestEnv = GoogleAuthEnv & {
  Bindings: {
    GOOGLE_CLIENT_ID: string;
    KV: any;
  }
}

// Extend global fetch type
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// Augment global scope
interface Global {
  fetch: FetchFn;
}

declare const global: Global;

describe('Session Middleware Integration', () => {
  const mockSessionStore = {
    get: jest.fn((): Promise<ValidSessionData | undefined> => Promise.resolve(undefined)),
    put: jest.fn((): Promise<void> => Promise.resolve()),
    delete: jest.fn((): Promise<void> => Promise.resolve()),
  };

  let app: Hono<TestEnv>;

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn() as unknown as FetchFn;
    
    app = new Hono<TestEnv>();

    const googleAuth = honoSimpleGoogleAuth<TestEnv>(async (c) => {
      const url = new URL(c.req.url);
      const callbackUrl = `${url.protocol}//${url.host}/auth/callback`;
      return {
        clientId: c.env?.GOOGLE_CLIENT_ID || 'test-client-id',
        callbackUrl,
        sessionStore: mockSessionStore,
        mode: 'livemode',
      };
    });

    app.route('/auth', googleAuth.routes);

    // Protected API routes
    app.use('/api/*', googleAuth.session);
    app.get('/api/me', async (c) => {
      const session = c.var.session;
      if (!session?.signedIn) return c.json({ error: 'Not authenticated' }, 401);
      return c.json({ name: session.name, email: session.email });
    });

    app.get('/api/profile', async (c) => {
      const session = c.var.session;
      if (!session?.signedIn) return c.json({ error: 'Not authenticated' }, 401);
      return c.json({ 
        profile: {
          name: session.name, 
          email: session.email,
          sessionId: session.sessionId
        }
      });
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

  describe('Protected API Routes', () => {
    it('should return 401 for unauthenticated requests to /api/me', async () => {
      const response = await app.request('/api/me');
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Not authenticated' });
    });

    it('should return user data for authenticated requests to /api/me', async () => {
      const mockSession: ValidSessionData = {
        signedIn: true,
        sessionId: 'test-session-id',
        name: 'John Doe',
        email: 'john@example.com',
        credential: 'test-credential',
      };

      mockSessionStore.get.mockResolvedValue(mockSession);

      const response = await app.request('/api/me', {
        headers: {
          Cookie: 'auth_session_cookie=test-session-id',
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ name: 'John Doe', email: 'john@example.com' });
      expect(mockSessionStore.get).toHaveBeenCalledWith('test-session-id');
    });

    it('should return 401 when session is not found in store', async () => {
      mockSessionStore.get.mockResolvedValue(undefined);

      const response = await app.request('/api/me', {
        headers: {
          Cookie: 'auth_session_cookie=invalid-session-id',
        },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Not authenticated' });
    });

    it('should return profile data for authenticated requests to /api/profile', async () => {
      const mockSession: ValidSessionData = {
        signedIn: true,
        sessionId: 'profile-session-id',
        name: 'Jane Smith',
        email: 'jane@example.com',
        credential: 'test-credential',
      };

      mockSessionStore.get.mockResolvedValue(mockSession);

      const response = await app.request('/api/profile', {
        headers: {
          Cookie: 'auth_session_cookie=profile-session-id',
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        profile: {
          name: 'Jane Smith',
          email: 'jane@example.com',
          sessionId: 'profile-session-id'
        }
      });
    });
  });

  describe('Public Routes with Optional Session', () => {
    it('should return anonymous message for unauthenticated requests', async () => {
      const response = await app.request('/');
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ message: 'Hello, anonymous!', authenticated: false });
    });

    it('should return personalized message for authenticated requests', async () => {
      const mockSession: ValidSessionData = {
        signedIn: true,
        sessionId: 'home-session-id',
        name: 'Alice Johnson',
        email: 'alice@example.com',
        credential: 'test-credential',
      };

      mockSessionStore.get.mockResolvedValue(mockSession);

      const response = await app.request('/', {
        headers: {
          Cookie: 'auth_session_cookie=home-session-id',
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ message: 'Hello, Alice Johnson!', authenticated: true });
    });
  });

  describe('Session Store Integration', () => {
    it('should handle custom cookie names', async () => {
      const customApp = new Hono<TestEnv>();
      const customAuth = honoSimpleGoogleAuth<TestEnv>(async (c) => ({
        clientId: 'test-client-id',
        callbackUrl: 'http://localhost:3000/auth/callback',
        sessionStore: mockSessionStore,
        cookieName: 'custom_session_cookie',
        mode: 'livemode',
      }));

      customApp.route('/auth', customAuth.routes);
      customApp.use('/protected', customAuth.session);
      customApp.get('/protected', (c) => {
        const session = c.var.session;
        return c.json({ authenticated: session?.signedIn || false });
      });

      const mockSession: ValidSessionData = {
        signedIn: true,
        sessionId: 'custom-session-id',
        name: 'Custom User',
        email: 'custom@example.com',
        credential: 'test-credential',
      };

      mockSessionStore.get.mockResolvedValue(mockSession);

      const response = await customApp.request('/protected', {
        headers: {
          Cookie: 'custom_session_cookie=custom-session-id',
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ authenticated: true });
      expect(mockSessionStore.get).toHaveBeenCalledWith('custom-session-id');
    });

    it('should handle session store errors gracefully', async () => {
      mockSessionStore.get.mockRejectedValue(new Error('Session store error'));

      const response = await app.request('/api/me', {
        headers: {
          Cookie: 'auth_session_cookie=error-session-id',
        },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Not authenticated' });
    });
  });

  describe('Environment Variable Integration', () => {
    it('should use environment variables in provider function', async () => {
      const envApp = new Hono<TestEnv>();
      const envAuth = honoSimpleGoogleAuth<TestEnv>(async (c) => {
        // Simulate accessing environment variables
        const clientId = c.env?.GOOGLE_CLIENT_ID || 'fallback-client-id';
        const url = new URL(c.req.url);
        const callbackUrl = `${url.protocol}//${url.host}/auth/callback`;
        
        return {
          clientId,
          callbackUrl,
          sessionStore: mockSessionStore,
          mode: 'livemode',
        };
      });

      envApp.route('/auth', envAuth.routes);
      envApp.use('/test', envAuth.session);
      envApp.get('/test', (c) => {
        const options = c.var.googleAuthOptions;
        return c.json({ clientId: options?.clientId });
      });

      // Test with mock environment
      const mockEnv = { GOOGLE_CLIENT_ID: 'env-client-id', KV: {} };
      const response = await envApp.request('/test', {}, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ clientId: 'env-client-id' });
    });
  });
});
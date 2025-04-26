import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { honoSimpleGoogleAuth } from '../src/index';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { ValidSessionData, HonoSimpleGoogleAuthOptions } from '../src/types';

describe('Session Management', () => {
  const mockGet = jest.fn<(sessionId: string) => Promise<ValidSessionData | undefined>>();
  const mockPut = jest.fn<(data: ValidSessionData) => Promise<void>>();
  const mockDelete = jest.fn<(sessionId: string) => Promise<void>>();

  const mockSessionStore: HonoSimpleGoogleAuthOptions['sessionStore'] = {
    get: mockGet,
    put: mockPut,
    delete: mockDelete,
  };

  const mockOptions: HonoSimpleGoogleAuthOptions = {
    clientId: 'test-client-id',
    callbackUrl: 'http://localhost:3000/callback',
    sessionStore: mockSessionStore,
    cookieName: 'test_session',
    cookieDomain: 'test.com',
    sessionDurationSeconds: 3600,
  };

  let app: Hono;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockImplementation(() => Promise.resolve(undefined));
    mockPut.mockImplementation(() => Promise.resolve());
    mockDelete.mockImplementation(() => Promise.resolve());
    app = new Hono();
    const mockFetch = jest.fn<typeof fetch>();
    mockFetch.mockReturnValue(Promise.resolve(new Response(JSON.stringify({}), { status: 200 })));
    global.fetch = mockFetch;
    const auth = honoSimpleGoogleAuth(async () => mockOptions);
    app.route('/', auth.routes);
    app.use(auth.session);
    app.get('/', (c) => c.text('Hello', 200));
  });

  describe('Session Creation', () => {
    it('should create a new session on successful authentication', async () => {
      const mockTokenInfo = {
        name: 'Test User',
        email: 'test@example.com',
        // ... other token info fields
      };

      // Mock the token verification
      (global.fetch as jest.Mock).mockReturnValue(Promise.resolve(new Response(JSON.stringify(mockTokenInfo), { status: 200 })));

      const credential = 'mock-credential';
      const response = await app.request('/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `credential=${credential}`,
      });

      expect(response.status).toBe(302); // Redirect
      expect(mockSessionStore.put).toHaveBeenCalledWith(
        expect.objectContaining({
          signedIn: true,
          name: 'Test User',
          email: 'test@example.com',
          credential,
        })
      );

      const cookies = response.headers.get('Set-Cookie');
      expect(cookies).toBeTruthy();
      expect(cookies).toContain('test_session');
      expect(cookies).toContain('test.com');
    });
  });

  describe('Session Retrieval', () => {
    it('should retrieve session data from store', async () => {
      const mockSession: ValidSessionData = {
        signedIn: true,
        sessionId: 'test-session-id',
        name: 'Test User',
        email: 'test@example.com',
        credential: 'test-credential',
      };

      mockGet.mockResolvedValueOnce(mockSession);

      const response = await app.request('/', {
        headers: {
          Cookie: 'test_session=test-session-id',
        },
      });

      expect(mockSessionStore.get).toHaveBeenCalledWith('test-session-id');
      expect(response.status).toBe(200);
    });

    it('should handle missing session gracefully', async () => {
      mockGet.mockResolvedValueOnce(undefined);

      const response = await app.request('/', {
        headers: {
          Cookie: 'test_session=invalid-session',
        },
      });

      expect(mockSessionStore.get).toHaveBeenCalledWith('invalid-session');
      expect(response.status).toBe(200);
    });
  });

  describe('Session Deletion', () => {
    it('should clear session on signout', async () => {
      const response = await app.request('/signout');

      expect(response.status).toBe(302); // Redirect
      const cookies = response.headers.get('Set-Cookie');
      expect(cookies).toContain('test_session=;');
      expect(cookies).toContain('Max-Age=0');
    });
  });
});

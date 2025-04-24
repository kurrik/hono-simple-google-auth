/** @jsx jsx */
import { jsx } from 'hono/jsx';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { honoSimpleGoogleAuth } from '../src/index';
import { Hono } from 'hono';
import type { ValidSessionData, HonoSimpleGoogleAuthOptions } from '../src/types';
import type { FC } from 'hono/jsx';
import { HtmlEscapedString } from 'hono/utils/html';

// Extend global fetch type
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// Augment global scope
interface Global {
  fetch: FetchFn;
}

declare const global: Global;

describe('Authentication Flow', () => {
  const mockSessionStore = {
    get: jest.fn((sessionId: string): Promise<ValidSessionData | undefined> => Promise.resolve(undefined)),
    put: jest.fn((data: ValidSessionData): Promise<void> => Promise.resolve()),
    delete: jest.fn((sessionId: string): Promise<void> => Promise.resolve()),
  };

  const mockOptions: HonoSimpleGoogleAuthOptions = {
    clientId: 'test-client-id',
    callbackUrl: 'http://localhost:3000/auth',
    sessionStore: mockSessionStore,
  };

  let app: Hono;

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn() as unknown as FetchFn;
    app = new Hono();
    const auth = honoSimpleGoogleAuth(async () => mockOptions);
    app.route('/auth', auth.routes);
    app.use(auth.session);
  });

  describe('Sign-in Page', () => {
    it('should render the default sign-in page', async () => {
      const response = await app.request('/auth/signin');
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('g_id_onload');
      expect(html).toContain('test-client-id');
    });

    it('should redirect if user is already signed in', async () => {
      const mockSession: ValidSessionData = {
        signedIn: true,
        sessionId: 'test-session-id',
        name: 'Test User',
        email: 'test@example.com',
        credential: 'test-credential',
      };

      mockSessionStore.get.mockResolvedValue(mockSession);

      const response = await app.request('/auth/signin', {
        headers: {
          Cookie: 'auth_session_cookie=test-session-id',
        },
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/');
    });

    it('should use custom sign-in page when provided', async () => {
      const customSignInPage: FC<{ clientId: string; loginUri: string }> = ({ clientId, loginUri }) => {
        const element = jsx(
          'div',
          {
            id: 'custom-signin',
            'data-client-id': clientId,
            'data-login-uri': loginUri,
            children: 'Custom Sign In'
          }
        );
        return element as unknown as HtmlEscapedString;
      };

      const customOptions: HonoSimpleGoogleAuthOptions = {
        ...mockOptions,
        renderSignInPage: customSignInPage,
      };

      const customApp = new Hono();
      const customAuth = honoSimpleGoogleAuth(async () => customOptions);
      customApp.route('/auth', customAuth.routes);
      customApp.use(customAuth.session);

      const response = await customApp.request('/auth/signin');
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('custom-signin');
      expect(html).toContain('test-client-id');
    });
  });

  describe('Google Token Verification', () => {
    it('should verify valid Google token', async () => {
      const mockTokenInfo = {
        name: 'Test User',
        email: 'test@example.com',
        // ... other token info fields
      };

      (global.fetch as unknown as jest.Mock).mockImplementation(() => {
        return Promise.resolve(new Response(JSON.stringify(mockTokenInfo), { status: 200 }));
      });

      const response = await app.request('/auth/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'credential=valid-token',
      });

      expect(response.status).toBe(302);
      expect(mockSessionStore.put).toHaveBeenCalled();
    });

    it('should handle invalid Google token', async () => {
      (global.fetch as unknown as jest.Mock).mockImplementation(() => {
        return Promise.resolve(new Response(null, { status: 400 }));
      });

      const response = await app.request('/auth/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'credential=invalid-token',
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('Invalid Google Sign-In');
      expect(mockSessionStore.put).not.toHaveBeenCalled();
    });

    it('should handle network errors during verification', async () => {
      (global.fetch as unknown as jest.Mock).mockImplementation(() => {
        return Promise.reject(new Error('Network error'));
      });

      const response = await app.request('/auth/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'credential=some-token',
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('Invalid Google Sign-In');
      expect(mockSessionStore.put).not.toHaveBeenCalled();
    });
  });
});

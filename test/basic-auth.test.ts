import { describe, it, expect } from '@jest/globals';
import { honoSimpleGoogleAuth } from '../src/index';

// Example test (replace with real tests)
describe('honoSimpleGoogleAuth', () => {
  it('should be a function', () => {
    const mockOptions = {
      clientId: 'test-client-id',
      callbackUrl: 'http://localhost/callback',
      sessionStore: {
        get: async () => undefined,
        put: async () => {},
      },
    };
    const wrappedHonoSimpleGoogleAuth = honoSimpleGoogleAuth(async () => mockOptions);
    expect(typeof wrappedHonoSimpleGoogleAuth).toBe('object');
    expect(typeof wrappedHonoSimpleGoogleAuth.fetch).toBe('function');
  });
});

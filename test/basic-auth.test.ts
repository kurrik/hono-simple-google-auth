import { describe, it, expect } from '@jest/globals';
import { honoSimpleGoogleAuth } from '../src/index';
import { HonoSimpleGoogleAuthOptions } from '../src/types';

// Example test (replace with real tests)
describe('honoSimpleGoogleAuth', () => {
  it('should be a function', () => {
    const mockOptions: HonoSimpleGoogleAuthOptions = {
      clientId: 'test-client-id',
      callbackUrl: 'http://localhost/callback',
      sessionStore: {
        get: async () => undefined,
        put: async () => { },
      },
      mode: 'livemode'
    };
    const wrappedHonoSimpleGoogleAuth = honoSimpleGoogleAuth(async () => mockOptions);
    expect(typeof wrappedHonoSimpleGoogleAuth).toBe('object');
    expect(typeof wrappedHonoSimpleGoogleAuth.routes).toBe('object');
    expect(typeof wrappedHonoSimpleGoogleAuth.session).toBe('function');
  });
});

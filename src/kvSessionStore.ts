import type { HonoSimpleGoogleAuthOptions, ValidSessionData } from './types';

/**
 * Creates a sessionStore implementation backed by a Cloudflare Workers KVNamespace.
 * @param kv The KVNamespace instance (e.g., env.SESSION_KV)
 */
export function createKVSessionStore(kv: KVNamespace): HonoSimpleGoogleAuthOptions['sessionStore'] {
  return {
    async get(sessionId: string): Promise<ValidSessionData | undefined> {
      const value = await kv.get(sessionId);
      return value ? (JSON.parse(value) as ValidSessionData) : undefined;
    },
    async put(data: ValidSessionData): Promise<void> {
      // Assumes ValidSessionData includes a unique sessionId property
      await kv.put(data.sessionId, JSON.stringify(data));
    },
    async delete(sessionId: string): Promise<void> {
      await kv.delete(sessionId);
    }
  };
}

import type { FC } from 'hono/jsx';
import type { Context, Env as HonoEnv } from 'hono';

export interface HonoSimpleGoogleAuthOptions {
  clientId: string;
  callbackUrl: string;
  sessionStore: {
    get: (sessionId: string) => Promise<ValidSessionData | undefined>;
    put: (data: ValidSessionData) => Promise<void>;
    delete?: (sessionId: string) => Promise<void>;
  };
  cookieName?: string;
  cookieDomain?: string;
  sessionDurationSeconds?: number;
  /**
   * Optional: Provide a TSX component to render the sign-in page.
   * Receives clientId and loginUri as props.
   * If not provided, the default is <GoogleSignInButton />
   */
  renderSignInPage?: FC<{ clientId: string; loginUri: string }>;
}

// Provider function type for dynamic options
// Custom Env type for Hono context variables used by the middleware

export type GoogleAuthEnv = {
  Variables: {
    session?: SessionData;
    googleAuthOptions?: HonoSimpleGoogleAuthOptions;
  }
};

export type HonoSimpleGoogleAuthOptionsProvider<Env extends HonoEnv = HonoEnv> = (c: Context<Env, string>) => Promise<HonoSimpleGoogleAuthOptions>;


export type TokenInfo = {
  iss: string;
  nbf: string;
  aud: string;
  sub: string;
  azp: string;
  iat: string;
  exp: string;
  jti: string;
  alg: string;
  kid: string;
  typ: string;
  email: string;
  email_verified: string;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
};

export type SigninCallbackData = {
  clientId: string;
  credential: string;
  g_csrf_token: string;
};

export type ValidSessionData = {
  signedIn: true;
  sessionId: string;
  name: string;
  email: string;
  credential: string;
};

export type InvalidSessionData = {
  signedIn: false;
  error?: string;
};

export type SessionData = ValidSessionData | InvalidSessionData;

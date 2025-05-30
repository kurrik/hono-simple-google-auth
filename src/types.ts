import type { FC } from 'hono/jsx';
import type { Context, Hono, Env as HonoEnv, Next } from 'hono';

// Configuration options.
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
  /**
   * Mode for authentication - 'livemode' uses Google OAuth, 'testmode' uses in-memory session
   * Defaults to 'livemode'
   */
  mode: 'livemode' | 'testmode';
}

// Environment, populated by middlewares.
export type GoogleAuthEnv = HonoEnv & {
  Variables: {
    session?: SessionData;
    googleAuthOptions?: HonoSimpleGoogleAuthOptions;
    authImplementation: HonoSimpleGoogleAuthImplementation;
  }
};

// User-defined provider for dynamic options.
export type HonoSimpleGoogleAuthOptionsProvider<Env extends HonoEnv = HonoEnv> = (c: Context<Env, string>) => Promise<HonoSimpleGoogleAuthOptions>;

// Internal context type.
export type HonoSimpleGoogleAuthContext = Context<GoogleAuthEnv, string, {}>;

// Internal handler function.
export type HonoSimpleGoogleAuthImplementationHandler = (c: HonoSimpleGoogleAuthContext, options: HonoSimpleGoogleAuthOptions) => Promise<Response | void>;

// Internal middleware function.
export type HonoSimpleGoogleAuthImplementationMiddleware = (c: HonoSimpleGoogleAuthContext, options: HonoSimpleGoogleAuthOptions, next: Next) => Promise<Response | void>;

// Livemode and Testmode must implement this interface.
export interface HonoSimpleGoogleAuthImplementation {
  sessionMiddlewareImpl: HonoSimpleGoogleAuthImplementationMiddleware;
  signinImpl: HonoSimpleGoogleAuthImplementationHandler;
  callbackImpl: HonoSimpleGoogleAuthImplementationHandler;
  signoutImpl: HonoSimpleGoogleAuthImplementationHandler;
  testSigninImpl?: HonoSimpleGoogleAuthImplementationHandler;
}

// Token info from Google
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

// Data received from Google callback
export type SigninCallbackData = {
  clientId: string;
  credential: string;
  g_csrf_token: string;
};

// Valid session data
export type ValidSessionData = {
  signedIn: true;
  sessionId: string;
  name: string;
  email: string;
  credential: string;
};

// Invalid session data
export type InvalidSessionData = {
  signedIn: false;
  error?: string;
};

// Valid or invalid session data
export type SessionData = ValidSessionData | InvalidSessionData;

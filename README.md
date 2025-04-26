# hono-simple-google-auth

[![npm version](https://badge.fury.io/js/hono-simple-google-auth.svg)](https://www.npmjs.com/package/hono-simple-google-auth)

A simple, customizable Google Sign-In authentication subapp for [Hono](https://hono.dev/) with JSX/TSX support. Easily add Google authentication to your Hono app, with optional support for custom sign-in pages and seamless integration with Cloudflare Workers.


---

## Features
- Plug-and-play Google OAuth for Hono
- Customizable sign-in page (use your own TSX/JSX component)
- Secure session handling
- Works with Node.js, Bun, Deno, and Cloudflare Workers

---

## Installation

```sh
npm install hono-simple-google-auth hono
```

---

## TypeScript Support

This package is written in TypeScript and ships with full type definitions. If you are using TypeScript, you will get type checking and autocompletion automatically when you import from `hono-simple-google-auth`—no additional setup is required.

**For full type safety:**
```ts
import type { GoogleAuthEnv } from 'hono-simple-google-auth';
const app = new Hono<GoogleAuthEnv>();
```

---

## Breaking Changes

### v0.4.0+
> **Note:** The Google callback route has changed from `/auth` to `/callback`. You must update any routes or reverse proxies that expect the callback at `/auth` to use `/callback` instead. This is a breaking minor change. See updated usage below.

### v0.3.0+
> **Note:** The API now returns an object `{ routes, session }` instead of a Hono app. You must mount `googleAuth.routes` and use `googleAuth.session` as middleware. See updated usage below.

### v0.2.0+
> **Note:** The API now requires an async provider function for options. See updated usage below. This enables full compatibility with Cloudflare Workers and other platforms where environment variables are only available at request time.

---

## Basic Usage

```ts
import { Hono } from 'hono';
import { honoSimpleGoogleAuth } from 'hono-simple-google-auth';
const app = new Hono();

// Create the auth subapp and session middleware
const googleAuth = honoSimpleGoogleAuth(async (c) => ({
  clientId: c.env.GOOGLE_CLIENT_ID,
  callbackUrl: c.env.CALLBACK_URL,
  sessionStore: mySessionStore,
  // Optionally, provide a custom sign-in page:
  // renderSignInPage: ({ clientId, loginUri }) => <YourCustomSignInComponent clientId={clientId} loginUri={loginUri} />
}));

// Mount all auth endpoints
app.route('/auth', googleAuth.routes);

// Add session middleware to any route you want session info
app.use('/dashboard', googleAuth.session);
app.use('/', googleAuth.session);

app.get('/', (c) => {
  // Access user info from session (if signed in)
  const user = c.var.session;
  if (user?.signedIn) {
    return c.text(`Hello, ${user.name} (${user.email})`);
  }
  return c.redirect('/auth/signin');
});

// For type safety, you can use:
const options = c.get<HonoSimpleGoogleAuthOptions>('googleAuthOptions');

export default app;
```

---

## Cloudflare Workers Integration

Here is a full-featured Cloudflare Workers integration example using KV for session storage and type-safe bindings:

```ts
import { Hono } from 'hono';
import { honoSimpleGoogleAuth, createKVSessionStore, type GoogleAuthEnv } from 'hono-simple-google-auth';
import type { KVNamespace, Fetcher } from '@cloudflare/workers-types';

type Env = GoogleAuthEnv & {
  Bindings: {
    KV: KVNamespace;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    ASSETS: Fetcher;
  }
}

const app = new Hono<Env>();

// --- Auth Routes ---

const googleAuth = honoSimpleGoogleAuth<Env>(async (c) => {
  const url = new URL(c.req.url);
  const callbackUrl = `${url.protocol}//${url.host}/auth/callback`;
  return {
    clientId: c.env.GOOGLE_CLIENT_ID,
    callbackUrl,
    sessionStore: createKVSessionStore(c.env.KV),
  };
});

app.route('/auth', googleAuth.routes);

// --- API Routes (Authenticated) ---

app.use('/api/*', googleAuth.session);
app.get('/api/me', async (c) => {
  const session = c.var.session;
  if (!session?.signedIn) return c.json({ error: 'Not authenticated' }, 401);
  return c.json({ name: session.name, email: session.email });
});
```

This example demonstrates:
- Using Cloudflare KV for session storage
- Type-safe environment bindings
- Dynamic callback URL generation
- Protecting API endpoints by requiring authentication

---

## Cloudflare Workers: Built-in KV Session Store

This package exports a helper for using [Cloudflare Workers KV](https://developers.cloudflare.com/workers/runtime-apis/kv/) as your session store:

```ts
import { createKVSessionStore } from 'hono-simple-google-auth';

// In your Worker, assuming env.SESSION_KV is your KVNamespace binding:
const googleAuth = honoSimpleGoogleAuth(async (c) => ({
  clientId: c.env.GOOGLE_CLIENT_ID,
  callbackUrl: c.env.CALLBACK_URL,
  sessionStore: createKVSessionStore(c.env.SESSION_KV),
}))
```

- `createKVSessionStore` is exported from the package root and can be used wherever you need a Cloudflare Workers-compatible session store.
- This is optional; you can provide your own session store implementation if not using Workers KV.

---

## Customizing the Sign-In Page

You can provide your own TSX/JSX component for the sign-in page:

```ts
import { GoogleSignInButton } from 'hono-simple-google-auth';

const CustomSignIn = ({ clientId, loginUri }) => (
  <div>
    <h1>Sign in with Google</h1>
    <GoogleSignInButton clientId={clientId} loginUri={loginUri} />
    <p>Welcome to our app!</p>
  </div>
);

app.route('/auth', honoSimpleGoogleAuth({
  clientId: '<GOOGLE_CLIENT_ID>',
  callbackUrl: 'https://your-app.com/auth/callback',
  renderSignInPage: CustomSignIn
}));
```

## License
MIT

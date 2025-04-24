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

No special configuration is required! Just use the async provider pattern as shown above. This allows you to access `c.env` for secrets and environment variables in a type-safe way.

**Example:**

```ts
import { Hono } from 'hono';
import { honoSimpleGoogleAuth } from 'hono-simple-google-auth';

const app = new Hono();

app.route('/auth', honoSimpleGoogleAuth(async (c) => ({
  clientId: c.env.GOOGLE_CLIENT_ID,
  callbackUrl: c.env.CALLBACK_URL,
  sessionStore: mySessionStore,
})));

app.get('/', (c) => {
  // Access user info from session (if signed in)
  const user = c.var.session;
  if (user?.signedIn) {
    return c.text(`Hello, ${user.name} (${user.email})`);
  }
  return c.redirect('/auth/signin');
});

// For type safety, you can use:
// const options = c.get<HonoSimpleGoogleAuthOptions>('googleAuthOptions');

export default app;
```

**Notes:**
- Use environment variables for sensitive credentials.
- For best security, set cookies as `httpOnly` and `SameSite=Strict` (the library does this by default).

---

## Cloudflare Workers: Built-in KV Session Store

This package exports a helper for using [Cloudflare Workers KV](https://developers.cloudflare.com/workers/runtime-apis/kv/) as your session store:

```ts
import { createKVSessionStore } from 'hono-simple-google-auth';

// In your Worker, assuming env.SESSION_KV is your KVNamespace binding:
const sessionStore = createKVSessionStore(env.SESSION_KV);

const googleAuth = honoSimpleGoogleAuth(async (c) => ({
  clientId: c.env.GOOGLE_CLIENT_ID,
  callbackUrl: c.env.CALLBACK_URL,
  sessionStore,
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

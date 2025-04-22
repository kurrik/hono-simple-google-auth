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

## Basic Usage

```ts
import { Hono } from 'hono';
import { honoSimpleGoogleAuth } from 'hono-simple-google-auth';

const app = new Hono();

app.route('/auth', honoSimpleGoogleAuth({
  clientId: '<GOOGLE_CLIENT_ID>',
  callbackUrl: 'https://your-app.com/auth/callback',
  // Optionally, provide a custom sign-in page:
  // renderSignInPage: ({ clientId, loginUri }) => <YourCustomSignInComponent clientId={clientId} loginUri={loginUri} />
}));

app.get('/', (c) => {
  // Access user info from session (if signed in)
  const user = c.get('googleUser');
  if (user) {
    return c.text(`Hello, ${user.name} (${user.email})`);
  }
  return c.redirect('/auth/signin');
});

export default app;
```

---

## Cloudflare Workers Integration

No special configuration is required! Just use as above. However, make sure your `wrangler.toml` or deployment configuration allows environment variables for your Google client ID and secrets.

**Example:**

```ts
import { Hono } from 'hono';
import { honoSimpleGoogleAuth } from 'hono-simple-google-auth';

export default new Hono()
  .route('/auth', honoSimpleGoogleAuth({
    clientId: GOOGLE_CLIENT_ID,
    callbackUrl: 'https://<your-worker-subdomain>.workers.dev/auth/callback',
  }))
  .get('/', (c) => {
    const user = c.get('googleUser');
    return c.text(user ? `Hello, ${user.name}` : 'Not signed in');
  });
```

**Notes:**
- Use environment variables for sensitive credentials.
- For best security, set cookies as `httpOnly` and `SameSite=Strict` (the library does this by default).

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

---

## Typescript Support
- All types are included.
- Works out-of-the-box with `hono/jsx`.

---

## License
MIT

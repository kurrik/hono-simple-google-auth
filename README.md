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

### v0.5.0+
> **Note:** The `mode` field is now required in the options object. You must specify either `'livemode'` for Google OAuth or `'testmode'` for testing. This enables explicit control over authentication behavior.

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
  mode: 'livemode', // Required: 'livemode' for Google OAuth, 'testmode' for testing
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
    mode: 'livemode',
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
  mode: 'livemode',
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

const googleAuth = honoSimpleGoogleAuth(async (c) => ({
  clientId: '<GOOGLE_CLIENT_ID>',
  callbackUrl: 'https://your-app.com/auth/callback',
  sessionStore: mySessionStore,
  mode: 'livemode',
  renderSignInPage: CustomSignIn
}));

app.route('/auth', googleAuth.routes);
```

---

## Test Mode

For testing and development, you can use the built-in test mode instead of Google OAuth. Test mode provides a simple way to simulate user authentication without requiring actual Google credentials.

### Basic Test Mode Setup

```ts
import { Hono } from 'hono';
import { honoSimpleGoogleAuth } from 'hono-simple-google-auth';

const app = new Hono();

// Create session store (in-memory for testing)
const sessionStore = {
  data: new Map(),
  async get(sessionId) { return this.data.get(sessionId); },
  async put(session) { this.data.set(session.sessionId, session); },
  async delete(sessionId) { this.data.delete(sessionId); }
};

const googleAuth = honoSimpleGoogleAuth(async (c) => ({
  clientId: 'test-client-id', // Can be any string in test mode
  callbackUrl: 'http://localhost:3000/auth/callback', // Can be any URL in test mode
  sessionStore,
  mode: 'testmode', // Enable test mode
}));

app.route('/auth', googleAuth.routes);
app.use('/api/*', googleAuth.session);

// Protected route
app.get('/api/me', async (c) => {
  const session = c.var.session;
  if (!session?.signedIn) return c.json({ error: 'Not authenticated' }, 401);
  return c.json({ name: session.name, email: session.email });
});

export default app;
```

### Test Mode Endpoints

Test mode provides these endpoints:

- **GET `/auth/signin`** - Displays a simple test form for signing in (includes sessionID input field)
- **POST `/auth/test/signin`** - Accepts JSON with `{ name, email, sessionID? }` to create a test session
- **GET `/auth/signout`** - Clears the test session (handles session-specific cleanup)
- **POST `/auth/callback`** - No-op in test mode (just redirects)

### Programmatic Test Authentication

In your tests, you can programmatically sign in users:

```ts
// Test sign-in
const response = await app.request('/auth/test/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Test User',
    email: 'test@example.com'
  })
});

// Response: { success: true, session: { ... } }

// Now the user is signed in for subsequent requests
const protectedResponse = await app.request('/api/me');
// Response: { name: 'Test User', email: 'test@example.com' }
```

### Session Scoping for Multi-User Testing

Test mode supports session scoping, allowing you to test multiple users simultaneously by providing custom session IDs:

```ts
// Create session for user 1 with custom sessionID
const user1Response = await app.request('/auth/test/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Alice',
    email: 'alice@example.com',
    sessionID: 'session-alice-123'
  })
});

// Create session for user 2 with different sessionID
const user2Response = await app.request('/auth/test/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Bob',
    email: 'bob@example.com',
    sessionID: 'session-bob-456'
  })
});

// Access API as user 1 using session cookie
const aliceResponse = await app.request('/api/me', {
  headers: { 'Cookie': 'testmode-session-id=session-alice-123' }
});
// Response: { name: 'Alice', email: 'alice@example.com' }

// Access API as user 2 using different session cookie
const bobResponse = await app.request('/api/me', {
  headers: { 'Cookie': 'testmode-session-id=session-bob-456' }
});
// Response: { name: 'Bob', email: 'bob@example.com' }
```

#### Session Scoping Behavior

- **Custom sessionID**: When provided, creates an isolated session and sets a `testmode-session-id` cookie
- **Default behavior**: If no `sessionID` is provided, uses the default session behavior for backward compatibility
- **Cookie handling**: Sessions with custom IDs use cookies for session identification across requests
- **Session isolation**: Different session IDs maintain completely separate authentication states
- **Independent signout**: Signing out one session doesn't affect other sessions

### Test Mode Session Management

Test mode uses the same session store interface as live mode, so sessions persist across requests:

```ts
// Sign in
await app.request('/auth/test/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'John Doe', email: 'john@test.com' })
});

// Session persists for subsequent requests
const response1 = await app.request('/api/me'); // ✅ Authenticated
const response2 = await app.request('/api/profile'); // ✅ Authenticated

// Sign out
await app.request('/auth/signout');

// Now unauthenticated
const response3 = await app.request('/api/me'); // ❌ 401 Unauthorized
```

### Environment-Based Mode Selection

You can dynamically choose between live and test mode based on your environment:

```ts
const googleAuth = honoSimpleGoogleAuth(async (c) => ({
  clientId: c.env.GOOGLE_CLIENT_ID || 'test-client-id',
  callbackUrl: c.env.CALLBACK_URL || 'http://localhost:3000/auth/callback',
  sessionStore: c.env.NODE_ENV === 'test' ? testSessionStore : liveSessionStore,
  mode: c.env.NODE_ENV === 'test' ? 'testmode' : 'livemode',
}));
```

### Jest/Vitest Testing Example

```ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { honoSimpleGoogleAuth } from 'hono-simple-google-auth';
import { Hono } from 'hono';

describe('Authentication Tests', () => {
  let app;

  beforeEach(() => {
    const sessionData = new Map();
    const sessionStore = {
      async get(id) { return sessionData.get(id); },
      async put(session) { sessionData.set(session.sessionId, session); },
      async delete(id) { sessionData.delete(id); }
    };

    app = new Hono();
    const googleAuth = honoSimpleGoogleAuth(async () => ({
      clientId: 'test',
      callbackUrl: 'http://test/callback',
      sessionStore,
      mode: 'testmode',
    }));

    app.route('/auth', googleAuth.routes);
    app.use('/api/*', googleAuth.session);
    app.get('/api/me', async (c) => {
      const session = c.var.session;
      if (!session?.signedIn) return c.json({ error: 'Not authenticated' }, 401);
      return c.json({ name: session.name, email: session.email });
    });
  });

  it('should authenticate user in test mode', async () => {
    // Sign in
    await app.request('/auth/test/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email: 'test@example.com' })
    });

    // Access protected endpoint
    const response = await app.request('/api/me');
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({ name: 'Test User', email: 'test@example.com' });
  });

  it('should reject unauthenticated requests', async () => {
    const response = await app.request('/api/me');
    expect(response.status).toBe(401);
  });

  it('should support multiple isolated sessions', async () => {
    // Create user 1 session
    await app.request('/auth/test/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: 'Alice', 
        email: 'alice@test.com',
        sessionID: 'session-alice'
      })
    });

    // Create user 2 session
    await app.request('/auth/test/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: 'Bob', 
        email: 'bob@test.com',
        sessionID: 'session-bob'
      })
    });

    // Test Alice's session
    const aliceResponse = await app.request('/api/me', {
      headers: { 'Cookie': 'testmode-session-id=session-alice' }
    });
    expect(aliceResponse.status).toBe(200);
    const aliceData = await aliceResponse.json();
    expect(aliceData).toEqual({ name: 'Alice', email: 'alice@test.com' });

    // Test Bob's session
    const bobResponse = await app.request('/api/me', {
      headers: { 'Cookie': 'testmode-session-id=session-bob' }
    });
    expect(bobResponse.status).toBe(200);
    const bobData = await bobResponse.json();
    expect(bobData).toEqual({ name: 'Bob', email: 'bob@test.com' });

    // Sessions should be isolated
    expect(aliceData.name).not.toBe(bobData.name);
  });

  it('should handle session-specific signout', async () => {
    // Create two sessions
    await app.request('/auth/test/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: 'User 1', 
        email: 'user1@test.com',
        sessionID: 'session-1'
      })
    });

    await app.request('/auth/test/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: 'User 2', 
        email: 'user2@test.com',
        sessionID: 'session-2'
      })
    });

    // Sign out session-1
    await app.request('/auth/signout', {
      headers: { 'Cookie': 'testmode-session-id=session-1' }
    });

    // Session-1 should be signed out
    const response1 = await app.request('/api/me', {
      headers: { 'Cookie': 'testmode-session-id=session-1' }
    });
    expect(response1.status).toBe(401);

    // Session-2 should still be active
    const response2 = await app.request('/api/me', {
      headers: { 'Cookie': 'testmode-session-id=session-2' }
    });
    expect(response2.status).toBe(200);
    const data2 = await response2.json();
    expect(data2).toEqual({ name: 'User 2', email: 'user2@test.com' });
  });
});
```

---
## Development

Release a new version:
```zsh
npm version minor
npm publish
```

---

## License
MIT

# Oh My SSH unified Cloudflare Worker

This directory contains the complete production service. One Worker serves the compiled SPA
from Workers Assets and handles the HTTPS ticket API, WebSocket byte relay, and Durable Object
session state. The browser performs SSH key exchange, host-key verification, authentication,
PTY, encryption, and SFTP; the relay never receives SSH credentials or decrypts SSH payloads.

## Deploy the complete service

From the repository root:

1. Copy `gateway/.dev.vars.example` to `gateway/.dev.vars` only for local development and
   replace the token.
2. Set `ALLOWED_ORIGINS`, `ALLOWED_PORTS`, and preferably `ALLOWED_HOSTS` in
   `gateway/wrangler.toml`. The deployed Worker origin is allowed automatically; the origin
   list is for an optional Vercel static mirror.
3. Authenticate Wrangler and store the production secrets as Cloudflare secrets:

   ```bash
   npx wrangler login --config gateway/wrangler.toml
   npx wrangler whoami --config gateway/wrangler.toml
   npx wrangler secret put ACCESS_TOKEN --config gateway/wrangler.toml
   npx wrangler secret put APP_LOGIN_PASSWORD_HASH --config gateway/wrangler.toml
   npx wrangler secret put APP_SESSION_SECRET --config gateway/wrangler.toml
   ```

4. Build and deploy the page and relay together:

   ```bash
   npm run workers:deploy
   ```

The command is equivalent to `npm run build && wrangler deploy --config gateway/wrangler.toml`.
The returned `https://<worker>.workers.dev` URL is the fallback application URL. This deployment
also binds the production custom domain `https://ssh.w0x7ce.eu`; verify the custom domain before
using the UI:

```bash
curl https://ssh.w0x7ce.eu/health
```

The JSON must contain `"ok":true`, `"service":"oh-myssh-relay"`, and
`"deployment":"unified-workers"`. Open the production Worker URL in the browser; the page
and relay are same-origin, and the login form establishes the HttpOnly session automatically.
End users do not enter a Cloudflare access token or run a local relay.

## Local Worker development

Run `npm run gateway:typecheck` and `npm run gateway:dev` after building `dist`. Production
targets must be public DNS-only SSH endpoints. The Worker deliberately rejects private,
reserved, loopback, Cloudflare-owned, and disallowed port targets. Use `npm run dev` for local
LAN testing; its Vite middleware is a development-only relay and is not deployed here.

## Protocol boundary

The browser first signs in at `/api/auth/login` with the product password. The Worker verifies
the PBKDF2-SHA-256 record and returns a signed, `HttpOnly; Secure; SameSite=Strict` session
cookie. The browser then requests a 30-second single-use ticket over HTTPS with that cookie; a
legacy `ACCESS_TOKEN` bearer remains accepted for administration and compatibility clients.
The ticket is carried in the WebSocket subprotocol header, not in the URL. Before issuing it,
the Worker resolves A and AAAA records, rejects the target if any answer is private/reserved,
and pins the session to the validated address. Durable Objects enforce per-client ticket/
session limits, backpressure, byte limits, idle timeout, and maximum session duration.

Cloudflare Access is optional and is not required for the normal browser flow. End users never
see or enter `ACCESS_TOKEN`, and they do not run a local relay.

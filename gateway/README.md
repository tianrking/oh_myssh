# Oh My SSH encrypted TCP relay

This Cloudflare Worker relays raw TCP bytes. SSH negotiation, host-key verification,
password/private-key authentication, shell encryption, and SFTP all run in the browser.
The relay never receives SSH credentials.

## Deploy

1. Copy `.dev.vars.example` to `.dev.vars` for local development and replace the token.
2. Edit `ALLOWED_ORIGINS`, `ALLOWED_PORTS`, and preferably `ALLOWED_HOSTS` in
   `wrangler.toml`.
3. Run `npm run gateway:typecheck`, then `npm run gateway:dev`.
4. Set the production secret with `npx wrangler secret put ACCESS_TOKEN --config gateway/wrangler.toml`.
5. Deploy with `npm run gateway:deploy`.

The browser requests a 30-second ticket over HTTPS using the access token. The ticket is
single-use and carried in the WebSocket subprotocol header, not in the URL. Before a ticket
is issued, the Worker resolves A and AAAA records, rejects the whole target if any address is
private/reserved, and pins the session to one validated address. Per-client ticket and active
session limits are stored in Durable Objects.

You may use a custom domain for the Worker. The browser ticket request intentionally omits
cookies, so interactive Cloudflare Access login is not currently a supported mandatory
boundary. Keep at least one endpoint reachable by the application's bearer-token flow.

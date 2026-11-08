# Deployment handoff — not executed

The application is built to run on Vercel or Netlify. Deployment and creation of
the cloud database require the repository owner's involvement. No hosting
project, cloud database, secret, or public deployment was created here.

## 1. Create the database

Create a Supabase project under your account. Run
[`001_traffic_lab.sql`](../supabase/migrations/001_traffic_lab.sql) in its SQL
editor. It creates the scenario table, an atomic quota function, and row-level
security. Direct anonymous/authenticated table access is revoked: public reads
go through our own API, which removes private fields.

Keep the project URL and server-only service-role key for hosting settings.
Never commit the key or put it in a `NEXT_PUBLIC_` variable. The app requires
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only on the server. No browser
Supabase SDK or account sign-in is required for the capability-based demo.

## 2. Connect the repository to a host

Recommended: import `gitgoap/traffic-agentsimulator` into Vercel with its Next.js
preset. Use the repository root, Node.js 24, `npm ci`, and `npm run build`.
Let the host choose Next.js output defaults.

Netlify is an alternative using its automatic Next.js runtime. Use Node.js 24
and the standard Next.js framework configuration. Do not configure the app as a
static export: its scenario API needs server functions.

Set these server environment variables in the host's settings:

| Name                        | Value                              |
| --------------------------- | ---------------------------------- |
| `SUPABASE_URL`              | Your HTTPS Supabase project origin |
| `SUPABASE_SERVICE_ROLE_KEY` | Your private server credential     |

Do **not** set `TRAFFIC_STORAGE=local` on a serverless host. Ephemeral files and
process memory are unsuitable for persistent shared scenarios. The application
rejects local mode when `VERCEL` or `NETLIFY` is set. Without database settings,
the simulation, browser saves, imports/exports, and experiments still work;
sharing reports a configuration error instead of pretending to save.

## 3. Check the deployed application

1. Load each preset, play, pause, change settings, and inspect a vehicle. Verify
   that the worker bundle loads and no browser errors appear.
2. Run a short baseline comparison and export its data.
3. Share a scenario, open its read-only link in a different browser, and verify
   that the network and saved summary load.
4. Update it from the creating browser. Verify that the other browser cannot
   update or delete it, then delete it from the creator's browser.
5. Check mobile layout, keyboard navigation, hosting logs, quotas, and database
   persistence across a redeploy. Do not paste credentials into logs or chat.

The database migration is exercised against embedded PostgreSQL in tests; the
Supabase HTTP adapter is contract-tested with mocked responses. A live Supabase
project and the deployed host still need these integration checks. Current
provider quotas/pricing have not been verified; review them before publication.

## Ownership and availability

Anyone holding a share link can read the scenario. The edit key stays in the
creator's browser storage and is not part of the link. There is no account
recovery or search/listing of all shared scenarios. Export a portable scenario
backup before clearing browser data. A deployment database is persistent, but
its backup and retention policy remain the owner's responsibility.

Live simulation runs on each visitor's device. Large batch jobs, live traffic
feeds, and multiplayer editing are outside this deployment. No WebSocket
server, Redis service, Docker setup, or long-running simulation function is
required.

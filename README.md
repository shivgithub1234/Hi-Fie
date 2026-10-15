# hi-fie

Real-time rooms with collision-checked five-character codes, NextAuth credentials authentication, five-message join history, join/leave notifications, and heartbeat presence.

The app, API routes, authentication, storage, and tests use TypeScript with strict checking. Database queries use Prisma ORM 7 with the PostgreSQL driver adapter. Models and relationships live in `prisma/schema.prisma`; generated client code goes in ignored `generated/prisma/`. Shared chat types live in `lib/types.ts`; NextAuth session types live in `types/next-auth.d.ts`.

## Run

For an existing checkout, `npm run setup` installs dependencies, generates and validates Prisma Client, checks the connection, migrates, imports any existing `data/chat.json`, and verifies the schema. It stops immediately when a step fails; it does not start the app after a failed migration or import. After setup succeeds, run `npm run dev`. The setup prints its project directory to help distinguish a different or outdated checkout.

Use Node.js 22.12 or later. Keep credentials in `.env.local`; `.env.example` contains placeholders only. If `.env.local` does not exist, copy the example and set `DATABASE_URL` to your PostgreSQL connection URL. Set `NEXTAUTH_SECRET` and `CRON_SECRET` to separate random values (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Keep `NEXTAUTH_URL=http://localhost:3000` for local development.

```powershell
npm install
npm run db:generate
npm run db:check
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Create an account to start or join a room. Use a second browser profile to chat with another account.

`npm install` generates Prisma Client automatically. `npm run db:generate` regenerates it after editing models. `npm run db:validate` validates the Prisma schema. `npm run db:studio` opens Prisma Studio for browsing the database. Prisma's connection configuration loads `.env.local` through `prisma.config.ts`; `DATABASE_URL` is used by the running app and the direct URL is preferred for migrations.

`npm run db:migrate` uses Prisma Migrate. On an empty database it applies the initial schema and the room revision migration. For a database created by the earlier SQL migration, it checks the expected legacy models, records the initial migration as already applied, then adds the revision field. It never resets existing tables. Use this command when adopting Prisma rather than running `prisma migrate reset` or forcing `db push` against existing data. Future model changes should be committed with new Prisma migrations.

If room creation reports a database connection error, run `npm run db:check`. It checks the main endpoint and, if that fails, the direct endpoint, without printing credentials. Missing tables require `npm run db:migrate`. If neither endpoint connects, check database availability in Neon and outbound PostgreSQL access on your network. Restart the app after changing environment variables or updating the database connection configuration. Connections allow up to 30 seconds for startup; SQL statements and idle transactions have separate deadlines to prevent stalled requests from exhausting the connection pool.

If Prisma has not installed or generated yet, `npm run db:network` independently reports installed packages, client generation, DNS resolution, and TCP connectivity for both URLs without exposing credentials. A reachable port is only a network check; `db:check` must still verify authentication and tables. Do not run the JSON importer until database connectivity and migrations succeed. Neon URLs are normalized to explicit `sslmode=verify-full`, preserving certificate and hostname verification and removing pg's SSL alias warning.

To preserve accounts and messages from the old file-based version, stop the old app and run `npm run db:import-json` after migrating. The importer uses batched writes in a transaction with a 120-second deadline, preserves password hashes, skips existing accounts and room codes, and leaves `data/chat.json` unchanged. Ordinary chat transactions retain the shorter 15-second deadline. Old presence is not imported; everyone must rejoin. Back up the old JSON file before retiring it. The app now uses PostgreSQL exclusively, so old accounts appear only after importing.

`npm test` runs validation and membership tests; PostgreSQL integration tests are skipped unless `TEST_DATABASE_URL` is set. `npm run test:db` tests accounts, concurrent room operations, persisted messages, atomic rate limits, presence expiration, cascading cleanup, and JSON import. Set `TEST_DATABASE_URL` to an accessible database whose role can create schemas (prefer a separate development database). Integration tests create a unique temporary schema and drop only that schema. `npm run typecheck` checks TypeScript; `npm run build` builds the app.

## Deploy to Vercel

Deployment preparation does not publish the app or change your database credentials. The current Neon database can be reused; data already imported locally does not need importing again on Vercel.

1. Put the source and `package-lock.json` in a Git repository and import it into Vercel as a **Next.js** project. Use the project root as the Root Directory and Node.js **22.x**. This workspace is not currently initialized as a Git repository.
2. Add the variables listed in `.env.production.example` to **Project Settings → Environment Variables → Production**. Use your existing pooled Neon `DATABASE_URL`, existing direct `DATABASE_URL_UNPOOLED`, and current `NEXTAUTH_SECRET` and `CRON_SECRET`. Do not copy localhost `NEXTAUTH_URL`; set it to the exact HTTPS production domain shown in Vercel, such as `https://your-project.vercel.app`. The secrets must be different and at least 32 characters. Never paste live values into either example file.
3. Keep preview deployments on a separate database branch. The runtime and migration URLs for each environment must target the same database and branch. A custom migration-role username may differ from the app role. If using `PRISMA_MIGRATION_URL`, it overrides the direct migration URL and must target that same database.
4. Use the checked-in `vercel.json` defaults: install with **`npm ci`** and build with **`npm run build:vercel`**. The install generates Prisma Client. The build first checks production environment values, then applies Prisma migrations, then builds Next.js. The migration role needs schema creation permissions. Missing variables or a localhost login URL stop the build before any migration runs.
5. Deploy when ready, then test registration, sign-in, room creation, joining from another browser profile, messages, and leaving. Redeploy after changing environment variables or the production domain.

The `.vercelignore` file excludes local environment files, JSON data, caches, tests, and generated artifacts from CLI uploads. Git ignores live environment files and data while retaining the two example files. Prisma Client is regenerated during installation; do not upload your local `node_modules` or `.next` folder.

The included daily cleanup job uses `CRON_SECRET` automatically on Vercel. Live streams reconnect after 25 seconds, within the route's 60-second limit. No JSON import or password reset is part of deployment.

Publishing requires a connected Vercel account and a source repository or CLI deployment. Adding a database URL locally does not deploy the app. `npm run db:check` checks connectivity without changing database records.

## Operation

Accounts, rooms, the latest 100 messages per room, presence, and rate limits live in PostgreSQL through Prisma models. Passwords use salted scrypt hashes. The app needs no writable application disk. Room mutations increment a revision counter inside a Prisma transaction to lock the room row; room creation and the creator's membership commit together. Unique database constraints reserve room codes and email addresses. Rate-limit transactions lock and update shared counters across app instances; server clocks should be synchronized for expiry calculations.

SSE reads PostgreSQL about once per second, so messages and presence are visible across instances without an in-memory pub/sub service. Streams close after 25 seconds and EventSource reconnects using the last message ID to stay within function execution limits. Each stream occupies a running function and queries the database; monitor usage as traffic grows. Clients heartbeat every 10 seconds and expire after 45 seconds. Room reads remove stale presence, while authenticated room actions run global cleanup. Empty rooms expire after an hour of inactivity. There is no process-local cleanup timer.

`vercel.json` schedules `/api/cleanup` daily, compatible with Vercel Hobby scheduling limits. Vercel sends `CRON_SECRET` as a bearer token when configured. For cleanup every minute even when nobody uses the app, configure an external scheduler or an eligible Vercel plan to call that endpoint with `Authorization: Bearer <CRON_SECRET>`. Daily scheduling means an abandoned room may remain until the next cleanup. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/manage-cron-jobs) and [function duration](https://vercel.com/docs/functions/configuring-functions/duration).

Room codes are bearer invitations: any signed-in user who knows a code may join. Join attempts, room creation, messages, login, registration, and general requests have shared rate limits. Registration has a global cap of 20 per minute. Login has a per-email cap of 10 per minute and a global cap of 60 per minute. Use hosting firewall limits for public deployments as well. Room mutations require the configured origin and server-side sessions. React escapes message text; messages are limited to 1,000 characters. Multiple tabs using the same account share one presence entry; leaving in one tab leaves in all tabs.

References: [NextAuth server-side sessions](https://next-auth.js.org/configuration/nextjs), [Next.js route handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route).

Prisma references: [Prisma 7 configuration and driver adapters](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), [Prisma transactions](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions).

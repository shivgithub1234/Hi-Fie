import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createDatabase } from './db';

const baseline = '20261015000000_initial';

function runPrisma(args: string[]) {
  const result = spawnSync(process.execPath, [path.join(process.cwd(), 'node_modules/prisma/build/index.js'), ...args], {
    encoding: 'utf8', windowsHide: true, env: process.env, timeout: 120000,
  });
  return { ok: result.status === 0, output: `${result.stdout || ''}\n${result.stderr || ''}` };
}

export async function migrate() {
  let result = runPrisma(['migrate', 'deploy']);
  if (!result.ok && /\bP3005\b/.test(result.output)) {
    // The previous app used these same tables without Prisma migration tracking.
    // Validate all expected columns before recording the initial migration as applied.
    const url = process.env.PRISMA_MIGRATION_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is missing.');
    const database = createDatabase(url);
    try {
      await database.user.findFirst();
      await database.room.findFirst({ select: { code: true, updated: true } });
      await database.member.findFirst();
      await database.message.findFirst();
      await database.rateLimit.findFirst();
    } finally { await database.$disconnect(); }
    const resolved = runPrisma(['migrate', 'resolve', '--applied', baseline]);
    if (!resolved.ok) throw new Error('Could not baseline the existing chat database. No tables were reset.');
    result = runPrisma(['migrate', 'deploy']);
  }
  if (!result.ok) {
    const code = result.output.match(/\bP\d{4}\b/)?.[0] || 'MIGRATION_FAILED';
    throw Object.assign(new Error(`Prisma migration failed [${code}]. Check database access and run npm run db:generate first.`), { code });
  }
  console.log('Prisma database migrations are up to date.');
}

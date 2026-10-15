import nextEnv from '@next/env';
import { createDatabase } from '../lib/db';
import { diagnosticCode } from '../lib/errors';
nextEnv.loadEnvConfig(process.cwd());
const connectionOnly = process.argv.includes('--connection-only');

async function check(key: 'DATABASE_URL' | 'DATABASE_URL_UNPOOLED') {
  const connectionString = process.env[key];
  if (!connectionString) { console.error(`${key}: missing.`); return false; }
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2) throw new Error('Invalid URL');
  } catch { console.error(`${key}: invalid PostgreSQL connection URL.`); return false; }
  const database = createDatabase(connectionString);
  const started = Date.now();
  try {
    await database.$connect();
    try {
      await database.user.findFirst();
      await database.room.findFirst();
      await database.member.findFirst();
      await database.message.findFirst();
      await database.rateLimit.findFirst();
      console.log(`${key}: connected in ${Date.now() - started}ms. Prisma chat tables are ready.`);
    } catch (error) {
      if (['P2021', 'P2022'].includes(diagnosticCode(error))) {
        console.log(`${key}: connected; database setup is incomplete.`);
        if (!connectionOnly) {
          console.error('Run npm run db:migrate, then npm run db:import-json to preserve existing accounts.');
          process.exitCode = 1;
        }
      } else throw error;
    }
    return true;
  } catch (error) {
    console.error(`${key}: connection failed [${diagnosticCode(error)}] after ${Date.now() - started}ms.`);
    return false;
  } finally { await database.$disconnect(); }
}

async function main() {
  console.log('hi-fie Prisma database diagnostic');
  if (await check('DATABASE_URL')) return;
  process.exitCode = 1;
  if (process.env.DATABASE_URL_UNPOOLED && await check('DATABASE_URL_UNPOOLED')) {
    console.error('The direct endpoint works. For local development, set DATABASE_URL to the value of DATABASE_URL_UNPOOLED, then restart the app.');
    return;
  }
  console.error('Check that the Neon database is available in its dashboard. If it is, test on another network or with your VPN disconnected; PostgreSQL requires outbound TCP port 5432.');
  console.error('Share this diagnostic output, not your connection URLs or passwords.');
}
main().catch(error => { console.error(`Database check failed [${diagnosticCode(error)}].`); process.exitCode = 1; });

import nextEnv from '@next/env';
import { lookup } from 'node:dns/promises';
import { createConnection } from 'node:net';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
nextEnv.loadEnvConfig(process.cwd());

function code(error: unknown) {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)) return error.code;
  return 'UNKNOWN';
}

function checkPort(host: string, port: number): Promise<string> {
  return new Promise(resolve => {
    const socket = createConnection({ host, port });
    const done = (result: string) => { socket.destroy(); resolve(result); };
    socket.setTimeout(8000);
    socket.once('connect', () => done('OPEN'));
    socket.once('timeout', () => done('TIMEOUT'));
    socket.once('error', error => done(code(error)));
  });
}

async function main() {
  console.log('hi-fie database network diagnostic (no credentials printed)');
  console.log('Project:', process.cwd());
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  for (const name of ['prisma/config', '@prisma/client', '@prisma/adapter-pg']) {
    try { require.resolve(name); console.log(`${name}: installed`); }
    catch { console.log(`${name}: missing — run npm install`); }
  }
  console.log('Generated Prisma client:', existsSync('generated/prisma/client.ts') ? 'present' : 'missing — run npm run db:generate');
  let reachable = false;
  for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
    const value = process.env[key];
    if (!value) { console.log(`${key}: not configured`); continue; }
    let url: URL;
    try {
      url = new URL(value);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error('Invalid URL');
    } catch { console.log(`${key}: invalid URL`); process.exitCode = 1; continue; }
    try {
      await lookup(url.hostname);
      console.log(`${key}: DNS resolved`);
    } catch (error) { console.log(`${key}: DNS failed [${code(error)}]`); process.exitCode = 1; continue; }
    const port = Number(url.port || '5432');
    const result = await checkPort(url.hostname, port);
    console.log(`${key}: TCP port ${port} [${result}]`);
    if (result === 'OPEN') reachable = true; else process.exitCode = 1;
  }
  if (reachable) console.log('A database port is reachable. Run npm run db:check to test PostgreSQL authentication and schema.');
  else {
    process.exitCode = 1;
    console.log('No configured database endpoint is reachable. Check Neon database availability, then test a mobile hotspot or disconnect your VPN to distinguish a network restriction.');
  }
}
main().catch(error => { console.error(`Network check failed [${code(error)}].`); process.exitCode = 1; });

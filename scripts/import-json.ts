import nextEnv from '@next/env';
import { readFile } from 'node:fs/promises';
import { importJson } from '../lib/import-json';
import { closeDatabase } from '../lib/db';
import { diagnosticCode } from '../lib/errors';
nextEnv.loadEnvConfig(process.cwd());
async function main() {
  const raw = await readFile('data/chat.json', 'utf8');
  const result = await importJson(JSON.parse(raw));
  console.log(`Imported ${result.users} accounts, ${result.rooms} rooms, and ${result.messages} messages. The original JSON file is unchanged.`);
}
main().catch(error => {
  const code = diagnosticCode(error);
  if (code === 'ENOENT') console.error('No data/chat.json file exists. Skip this import when starting with a new database.');
  else if (error instanceof SyntaxError) console.error('data/chat.json contains invalid JSON. Restore a valid backup before importing.');
  else if (['P2021', 'P2022', '42P01'].includes(code)) console.error('The database tables are not ready. Run npm run db:migrate before importing.');
  else console.error(`JSON import failed [${code}]. Run npm run db:check to diagnose database access. Your original JSON file has not been changed.`);
  process.exitCode = 1;
}).finally(closeDatabase);

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Native Node keeps recovery usable before Prisma or its generated client exists.
const directory = fileURLToPath(new URL('../', import.meta.url));
process.chdir(directory);
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('Run this setup using npm run setup from the hi-fie project.');
  process.exit(1);
}

function run(args) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: directory, stdio: 'inherit', windowsHide: true });
  if (result.error) console.error('Could not start the setup step.');
  return result.status === 0;
}

console.log('hi-fie setup — project:', directory);
if (!run(['install'])) process.exit(1);
if (!run(['run', 'db:validate'])) process.exit(1);
if (!run(['run', 'db:check', '--', '--connection-only'])) {
  console.error('Setup stopped: database connectivity must work before migrating or importing.');
  run(['run', 'db:network']);
  process.exit(1);
}
if (!run(['run', 'db:migrate'])) process.exit(1);
if (existsSync('data/chat.json') && !run(['run', 'db:import-json'])) process.exit(1);
if (!run(['run', 'db:check'])) process.exit(1);
console.log('Setup completed successfully. Start the app with npm run dev.');

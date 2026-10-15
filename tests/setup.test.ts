import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

for (const failure of ['install', 'run db:check -- --connection-only', 'run db:migrate']) {
  test(`setup stops after failure of ${failure}`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'hi-fie-setup-test-'));
    const cli = path.join(directory, 'fake-npm.cjs');
    const log = path.join(directory, 'commands.jsonl');
    try {
      writeFileSync(cli, `const fs = require('node:fs'); const args = process.argv.slice(2); fs.appendFileSync(process.env.TEST_SETUP_LOG, JSON.stringify(args) + '\\n'); process.exit(args.join(' ') === process.env.TEST_SETUP_FAIL_STEP ? 1 : 0);`);
      const result = spawnSync(process.execPath, [path.resolve('scripts/setup.mjs')], {
        encoding: 'utf8', windowsHide: true,
        env: { ...process.env, npm_execpath: cli, TEST_SETUP_LOG: log, TEST_SETUP_FAIL_STEP: failure },
      });
      assert.equal(result.status, 1);
      const calls: string[][] = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      assert.ok(!calls.some(args => args.includes('db:import-json')));
      assert.ok(!result.stdout.includes('Setup completed successfully'));
      if (failure === 'install') assert.equal(calls.length, 1);
      if (failure.includes('db:check')) assert.ok(!calls.some(args => args.includes('db:migrate')));
    } finally {
      assert.equal(path.dirname(directory), path.resolve(tmpdir()));
      assert.ok(path.basename(directory).startsWith('hi-fie-setup-test-'));
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

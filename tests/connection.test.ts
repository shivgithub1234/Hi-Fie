import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDatabaseUrl } from '../lib/connection';

test('Neon connections use explicit certificate and hostname verification', () => {
  for (const mode of ['require', 'prefer', 'verify-ca', 'verify-full']) {
    const url = new URL(normalizeDatabaseUrl(`postgresql://user:secret@ep-example-pooler.us-east-2.aws.neon.tech/chat?sslmode=${mode}&channel_binding=require`));
    assert.equal(url.searchParams.get('sslmode'), 'verify-full');
    assert.equal(url.searchParams.get('channel_binding'), 'require');
    assert.equal(url.username, 'user');
    assert.equal(url.password, 'secret');
  }
});

test('local database configuration and schema selection are preserved', () => {
  const url = 'postgresql://user:secret@localhost:5432/chat?schema=test&sslmode=disable';
  assert.equal(normalizeDatabaseUrl(url), url);
  assert.throws(() => normalizeDatabaseUrl('https://example.com/database'), /PostgreSQL/);
});

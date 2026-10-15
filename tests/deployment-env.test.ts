import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentIssues } from '../lib/deployment-env';

const valid = {
  DATABASE_URL: 'postgresql://app:password@ep-example-pooler.us-east-1.aws.neon.tech/chat?sslmode=verify-full',
  DATABASE_URL_UNPOOLED: 'postgresql://migration:password@ep-example.us-east-1.aws.neon.tech/chat?sslmode=verify-full',
  NEXTAUTH_URL: 'https://hi-fie.example.com',
  NEXTAUTH_SECRET: 'a'.repeat(64),
  CRON_SECRET: 'b'.repeat(64),
};

test('accepts production config with pooled runtime and direct migration URLs', () => {
  assert.deepEqual(deploymentIssues(valid), []);
});

test('rejects local or incorrectly scoped authentication origins', () => {
  for (const NEXTAUTH_URL of ['http://localhost:3000', 'https://localhost', 'https://example.com/app', 'https://example.com?redirect=other']) {
    assert.ok(deploymentIssues({ ...valid, NEXTAUTH_URL }).some(issue => issue.startsWith('NEXTAUTH_URL')));
  }
});

test('prevents migrating a different branch or database', () => {
  for (const DATABASE_URL_UNPOOLED of ['postgresql://user:password@other.neon.tech/chat', 'postgresql://user:password@ep-example.us-east-1.aws.neon.tech/other']) {
    assert.ok(deploymentIssues({ ...valid, DATABASE_URL_UNPOOLED }).some(issue => issue.includes('same database')));
  }
});

test('rejects missing and placeholder secrets without exposing credentials', () => {
  const issues = deploymentIssues({ ...valid, NEXTAUTH_SECRET: 'replace-with-a-random-secret', CRON_SECRET: '' });
  assert.equal(issues.length, 2);
  assert.ok(!issues.join(' ').includes('replace-with-a-random-secret'));
  assert.ok(deploymentIssues({ ...valid, CRON_SECRET: valid.NEXTAUTH_SECRET }).some(issue => issue.includes('must be different')));
});

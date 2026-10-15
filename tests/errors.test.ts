import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiError, diagnosticCode } from '../lib/errors';

test('database timeouts return a retryable service error', () => {
  for (const error of [new Error('Connection terminated due to connection timeout'), Object.assign(new Error('network blocked'), { code: 'EACCES' }), Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), Object.assign(new Error('Prisma cannot reach database'), { code: 'P1001' }), Object.assign(new Error('Prisma pool timeout'), { code: 'P2024' })]) {
    const result = apiError(error);
    assert.equal(result.status, 503);
    assert.equal(result.code, 'DATABASE_UNAVAILABLE');
  }
});

test('missing tables are distinguished from invalid requests', () => {
  assert.equal(apiError(Object.assign(new Error('missing relation'), { code: '42P01' })).code, 'DATABASE_NOT_INITIALIZED');
  assert.equal(apiError(Object.assign(new Error('missing Prisma table'), { code: 'P2021' })).code, 'DATABASE_NOT_INITIALIZED');
  assert.equal(apiError(Object.assign(new Error('missing Prisma column'), { code: 'P2022' })).code, 'DATABASE_NOT_INITIALIZED');
  assert.equal(apiError(new SyntaxError('bad JSON')).status, 400);
  assert.equal(apiError(Object.assign(new Error('Too many requests.'), { status: 429 })).status, 429);
});

test('internal errors and diagnostic codes never expose connection credentials', () => {
  const secret = 'postgresql://user:secret@example.com/database';
  assert.equal(apiError(new Error(secret)).status, 500);
  assert.ok(!JSON.stringify(apiError(new Error(secret))).includes(secret));
  assert.equal(diagnosticCode(Object.assign(new Error('failure'), { code: secret })), 'UNKNOWN');
});

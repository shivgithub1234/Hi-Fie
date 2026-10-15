import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register, authenticate, getRoom, send, requireMember } from '../lib/store';
import type { Room } from '../lib/types';

test('rejects invalid input before querying PostgreSQL', async () => {
  await assert.rejects(register('', 'bad-email', 'short'), /valid email/);
  await assert.rejects(getRoom('invalid'), /5-character/);
  await assert.rejects(getRoom(null), /5-character/);
  await assert.rejects(send('ABCDE', { id: 'user', name: 'Test' }, ' '), /1–1000/);
  await assert.rejects(send('ABCDE', { id: 'user', name: 'Test' }, 'x'.repeat(1001)), /1–1000/);
  assert.equal(await authenticate(null, 'password'), null);
  assert.equal(await authenticate('test@example.com', 'x'.repeat(129)), null);
});

test('only a current member may use a room', () => {
  const user = { id: 'test-user', name: 'Test' };
  const room: Room = { code: 'ABCDE', updated: Date.now(), messages: [], members: {} };
  assert.throws(() => requireMember(room, user), /Join the room again/);
  room.members[user.id] = { name: user.name, seen: Date.now() };
  requireMember(room, user);
  room.members[user.id].seen = Date.now() - 45001;
  assert.throws(() => requireMember(room, user), /Join the room again/);
});

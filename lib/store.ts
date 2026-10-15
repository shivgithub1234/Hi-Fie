import { randomInt, randomUUID, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { ChatUser, Room } from './types';
import { getDatabase, transaction, type DatabaseTransaction } from './db';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const statusError = (message: string, status: number) => Object.assign(new Error(message), { status });
const passwordHash = (password: string, salt: string): Promise<Buffer> => new Promise((resolve, reject) => {
  scrypt(password, salt, 64, (error, hash) => error ? reject(error) : resolve(hash));
});

export async function limit(key: string, max: number, windowMs = 60000) {
  const count = await transaction(async client => {
    // The native upsert locks this shared counter before checking its expiry.
    const current = await client.rateLimit.upsert({
      where: { key },
      create: { key, count: 0, untilMs: BigInt(Date.now() + windowMs) },
      update: { count: { increment: 0 } },
    });
    const now = Date.now();
    const result = await client.rateLimit.update({
      where: { key },
      data: current.untilMs <= BigInt(now) ? { count: 1, untilMs: BigInt(now + windowMs) } : { count: { increment: 1 } },
    });
    return result.count;
  });
  if (count > max) throw statusError('Too many requests. Please wait a moment.', 429);
}

export async function register(name: unknown, email: unknown, password: unknown) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 32 || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 10 || password.length > 128) throw statusError('Use a name of 2–32 characters, a valid email, and a password of 10–128 characters.', 400);
  const salt = randomBytes(16).toString('hex');
  const hash = (await passwordHash(password, salt)).toString('hex');
  const result = await getDatabase().user.createMany({ data: [{ id: randomUUID(), name: name.trim(), email: email.trim().toLowerCase(), salt, hash }], skipDuplicates: true });
  if (!result.count) throw statusError('An account with this email already exists.', 409);
}

export async function authenticate(email: unknown, password: unknown): Promise<ChatUser | null> {
  if (typeof email !== 'string' || typeof password !== 'string' || password.length > 128) return null;
  const user = await getDatabase().user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const hash = await passwordHash(password, user?.salt || 'missing-user');
  return user && timingSafeEqual(hash, Buffer.from(user.hash, 'hex')) ? { id: user.id, name: user.name, email: user.email } : null;
}

type RoomWriter = Pick<DatabaseTransaction, 'room'>;
export async function createRoom() { return reserveRoom(getDatabase()); }

async function reserveRoom(client: RoomWriter) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join('');
    const result = await client.room.createMany({ data: [{ code, updated: BigInt(Date.now()) }], skipDuplicates: true });
    if (result.count) return code;
  }
  throw statusError('Could not allocate a room code. Try again.', 503);
}

function validateCode(code: unknown): asserts code is string {
  if (typeof code !== 'string' || !/^[A-Z2-9]{5}$/.test(code)) throw statusError('Enter a valid 5-character room code.', 400);
}

async function append(client: DatabaseTransaction, code: string, name: string, text: string, system = false, userId: string | null = null, at = Date.now()) {
  const id = randomUUID();
  await client.message.create({ data: { id, roomCode: code, name, text, system, userId, at: BigInt(at) } });
  await client.room.update({ where: { code }, data: { updated: BigInt(at) } });
  const cutoff = await client.message.findFirst({ where: { roomCode: code }, orderBy: { sequence: 'desc' }, skip: 99, select: { sequence: true } });
  if (cutoff) await client.message.deleteMany({ where: { roomCode: code, sequence: { lt: cutoff.sequence } } });
  return id;
}

async function expireMembers(client: DatabaseTransaction, code: string, now: number) {
  const where = { roomCode: code, seen: { lte: BigInt(now - 45000) } };
  const expired = await client.member.findMany({ where, select: { name: true } });
  if (!expired.length) return;
  await client.member.deleteMany({ where });
  for (const member of expired) await append(client, code, 'System', `${member.name} left the room.`, true, null, now);
}

async function roomTransaction<T>(code: unknown, work: (client: DatabaseTransaction, code: string) => Promise<T>): Promise<T> {
  validateCode(code);
  return transaction(async client => {
    // Incrementing revision acquires PostgreSQL's row lock without changing activity time.
    try { await client.room.update({ where: { code }, data: { revision: { increment: 1 } } }); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2025') throw statusError('Room not found or expired.', 404);
      throw error;
    }
    await expireMembers(client, code, Date.now());
    return work(client, code);
  });
}

async function readRoom(client: DatabaseTransaction, code: string): Promise<Room> {
  const room = await client.room.findUniqueOrThrow({ where: { code }, include: {
    messages: { orderBy: { sequence: 'asc' } },
    members: { orderBy: [{ name: 'asc' }, { userId: 'asc' }] },
  } });
  return {
    code: room.code,
    updated: Number(room.updated),
    messages: room.messages.map(message => ({ id: message.id, name: message.name, text: message.text, system: message.system, userId: message.userId, at: Number(message.at) })),
    members: Object.fromEntries(room.members.map(member => [member.userId, { name: member.name, seen: Number(member.seen) }])),
  };
}

export async function getRoom(code: unknown): Promise<Room> { return roomTransaction(code, readRoom); }
export async function join(code: unknown, user: ChatUser) { return roomTransaction(code, (client, roomCode) => joinRoom(client, roomCode, user)); }

export async function createAndJoinRoom(user: ChatUser) {
  return transaction(async client => {
    const account = await client.user.findUnique({ where: { id: user.id }, select: { id: true } });
    if (!account) throw statusError('Your session is no longer valid. Please sign out and sign in again.', 401);
    const code = await reserveRoom(client);
    return { code, ...await joinRoom(client, code, user) };
  });
}

async function joinRoom(client: DatabaseTransaction, roomCode: string, user: ChatUser) {
  const room = await readRoom(client, roomCode);
  const history = room.messages.slice(-5);
  const added = !room.members[user.id];
  const now = BigInt(Date.now());
  await client.member.upsert({ where: { roomCode_userId: { roomCode, userId: user.id } },
    create: { roomCode, userId: user.id, name: user.name, seen: now }, update: { name: user.name, seen: now },
  });
  const cursor = added ? await append(client, roomCode, 'System', `${user.name} joined the room.`, true) : room.messages.at(-1)?.id;
  room.members[user.id] = { name: user.name, seen: Number(now) };
  return { history, cursor, members: members(room) };
}

export function requireMember(room: Room, user: ChatUser) {
  if (!room.members[user.id] || Date.now() - room.members[user.id].seen >= 45000) throw statusError('Join the room again to continue.', 403);
}
export function members(room: Room) { return Object.entries(room.members).map(([id, member]) => ({ id, name: member.name })); }

export async function heartbeat(code: unknown, user: ChatUser) {
  return roomTransaction(code, async (client, roomCode) => {
    const result = await client.member.updateMany({ where: { roomCode, userId: user.id }, data: { seen: BigInt(Date.now()) } });
    if (!result.count) throw statusError('Join the room again to continue.', 403);
  });
}

export async function leave(code: unknown, user: ChatUser) {
  return roomTransaction(code, async (client, roomCode) => {
    const removed = await client.member.deleteMany({ where: { roomCode, userId: user.id } });
    if (removed.count) await append(client, roomCode, 'System', `${user.name} left the room.`, true);
  });
}

export async function send(code: unknown, user: ChatUser, text: unknown) {
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 1000) throw statusError('Messages must contain 1–1000 characters.', 400);
  await limit(`message:${user.id}`, 20);
  return roomTransaction(code, async (client, roomCode) => {
    const member = await client.member.findUnique({ where: { roomCode_userId: { roomCode, userId: user.id } }, select: { userId: true } });
    if (!member) throw statusError('Join the room again to continue.', 403);
    await append(client, roomCode, user.name, text.trim(), false, user.id);
  });
}

export async function cleanup(now = Date.now()) {
  const candidates = await getDatabase().room.findMany({ where: { OR: [
    { updated: { lt: BigInt(now - 3600000) } }, { members: { some: { seen: { lte: BigInt(now - 45000) } } } },
  ] }, select: { code: true } });
  let deleted = 0;
  for (const { code } of candidates) {
    try {
      deleted += await roomTransaction(code, async (client, roomCode) => {
        await expireMembers(client, roomCode, now);
        const result = await client.room.deleteMany({ where: { code: roomCode, updated: { lt: BigInt(now - 3600000) }, members: { none: {} } } });
        return result.count;
      });
    } catch (error) {
      if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error;
    }
  }
  await getDatabase().rateLimit.deleteMany({ where: { untilMs: { lt: BigInt(now) } } });
  return deleted;
}

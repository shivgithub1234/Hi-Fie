import type { ChatUser, Room } from './types';
import { transaction } from './db';

interface LegacyData {
  users: (ChatUser & { email: string; salt: string; hash: string })[];
  rooms: Record<string, Room>;
}

export async function importJson(data: LegacyData) {
  return transaction(async client => {
    let users = 0, rooms = 0, messages = 0;
    for (let offset = 0; offset < data.users.length; offset += 500) {
      const result = await client.user.createMany({ data: data.users.slice(offset, offset + 500).map(user => ({ id: user.id, name: user.name, email: user.email.trim().toLowerCase(), salt: user.salt, hash: user.hash })), skipDuplicates: true });
      users += result.count;
    }
    for (const room of Object.values(data.rooms)) {
      const created = await client.room.createMany({ data: [{ code: room.code, updated: BigInt(room.updated) }], skipDuplicates: true });
      // A second importer or an active room wins its unique code without mixing histories.
      if (!created.count) continue;
      rooms++;
      const history = room.messages.slice(-100);
      if (!history.length) continue;
      const authorIds = [...new Set(history.flatMap(message => message.userId ? [message.userId] : []))];
      const authors = await client.user.findMany({ where: { id: { in: authorIds } }, select: { id: true } });
      const existingIds = new Set(authors.map(author => author.id));
      const result = await client.message.createMany({ data: history.map(message => ({ id: message.id, roomCode: room.code, name: message.name, text: message.text, system: message.system, userId: message.userId && existingIds.has(message.userId) ? message.userId : null, at: BigInt(message.at) })), skipDuplicates: true });
      messages += result.count;
    }
    return { users, rooms, messages };
  }, { timeout: 120000 });
}

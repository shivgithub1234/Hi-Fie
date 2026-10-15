import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client';
import { normalizeDatabaseUrl } from './connection';

declare global { var __hiFiePrisma: PrismaClient | undefined; }
export type DatabaseTransaction = Prisma.TransactionClient;

export function createDatabase(connectionString: string) {
  const url = new URL(normalizeDatabaseUrl(connectionString));
  const schema = url.searchParams.get('schema') || 'public';
  url.searchParams.delete('schema');
  const adapter = new PrismaPg({
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 60000,
    query_timeout: 20000,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 15000,
    keepAlive: true,
  }, { schema });
  return new PrismaClient({ adapter, transactionOptions: { maxWait: 30000, timeout: 15000 } });
}

export function getDatabase() {
  if (!globalThis.__hiFiePrisma) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. Add it to .env.local or your hosting environment.');
    globalThis.__hiFiePrisma = createDatabase(process.env.DATABASE_URL);
  }
  return globalThis.__hiFiePrisma;
}

export async function transaction<T>(work: (client: DatabaseTransaction) => Promise<T>, options?: { timeout: number }): Promise<T> {
  // PostgreSQL row locks come from atomic ORM updates inside these transactions.
  for (let attempt = 0; ; attempt++) {
    try { return await getDatabase().$transaction(work, options); }
    catch (error) {
      if (attempt < 3 && error instanceof Error && 'code' in error && error.code === 'P2034') continue;
      throw error;
    }
  }
}

export async function closeDatabase() {
  const database = globalThis.__hiFiePrisma;
  globalThis.__hiFiePrisma = undefined;
  await database?.$disconnect();
}

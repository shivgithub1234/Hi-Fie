import nextEnv from '@next/env';
import { defineConfig } from 'prisma/config';
import { normalizeDatabaseUrl } from './lib/connection';
nextEnv.loadEnvConfig(process.cwd());
const migrationUrl = process.env.PRISMA_MIGRATION_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: migrationUrl ? normalizeDatabaseUrl(migrationUrl) : '',
  },
});

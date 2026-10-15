import nextEnv from '@next/env';
import { migrate } from '../lib/migrate';
import { closeDatabase } from '../lib/db';
import { diagnosticCode } from '../lib/errors';
nextEnv.loadEnvConfig(process.cwd());
migrate().then(() => console.log('Database schema is ready.')).catch(error => {
  console.error(`Database migration failed [${diagnosticCode(error)}]. Check database connectivity and run npm run db:generate first.`);
  process.exitCode = 1;
}).finally(closeDatabase);

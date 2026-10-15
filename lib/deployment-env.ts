type Environment = Record<string, string | undefined>;

function databaseUrl(value: string | undefined): URL | null {
  try {
    const url = new URL(value || '');
    return ['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname && url.username && url.password && url.pathname.length > 1 ? url : null;
  } catch { return null; }
}

export function deploymentIssues(env: Environment): string[] {
  const issues: string[] = [];
  const database = databaseUrl(env.DATABASE_URL);
  if (!database) issues.push('DATABASE_URL must be a complete PostgreSQL connection URL.');
  const directValue = env.PRISMA_MIGRATION_URL || env.DATABASE_URL_UNPOOLED;
  if (directValue) {
    const direct = databaseUrl(directValue);
    if (!direct) issues.push('The migration URL must be a complete PostgreSQL connection URL.');
    else if (database && (direct.hostname.replace('-pooler.', '.') !== database.hostname.replace('-pooler.', '.') || direct.pathname !== database.pathname)) {
      issues.push('The migration URL and DATABASE_URL must target the same database and branch.');
    }
  }
  try {
    const origin = new URL(env.NEXTAUTH_URL || '');
    if (origin.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Invalid origin');
  } catch { issues.push('NEXTAUTH_URL must be the exact HTTPS production origin, without a path or localhost.'); }
  for (const name of ['NEXTAUTH_SECRET', 'CRON_SECRET']) {
    const value = env[name];
    if (!value || value.length < 32 || /replace-with|change-me|placeholder/i.test(value)) issues.push(`${name} must contain a random secret of at least 32 characters.`);
  }
  if (env.NEXTAUTH_SECRET && env.NEXTAUTH_SECRET === env.CRON_SECRET) issues.push('NEXTAUTH_SECRET and CRON_SECRET must be different.');
  return issues;
}

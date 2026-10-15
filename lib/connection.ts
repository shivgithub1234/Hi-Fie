export function normalizeDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid PostgreSQL connection URL.');
  // These pg 8 modes currently verify the certificate and hostname. Make that
  // behavior explicit for hosted Neon connections instead of relying on aliases.
  if (url.hostname.endsWith('.neon.tech')) {
    const mode = url.searchParams.get('sslmode');
    if (!mode || ['prefer', 'require', 'verify-ca'].includes(mode)) url.searchParams.set('sslmode', 'verify-full');
  }
  return url.toString();
}

import { cleanup } from '../../../lib/store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });
  try { return Response.json({ deleted: await cleanup() }); }
  catch { return Response.json({ error: 'Cleanup failed. Try again shortly.' }, { status: 503 }); }
}

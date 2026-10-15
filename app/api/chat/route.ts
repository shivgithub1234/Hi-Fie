import { apiError, diagnosticCode } from '../../../lib/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { register, limit, createAndJoinRoom, join, leave, send, heartbeat, cleanup } from '../../../lib/store';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const expectedOrigin = new URL(process.env.NEXTAUTH_URL || request.url).origin;
    if (request.headers.get('origin') !== expectedOrigin) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
    const raw = await request.text();
    if (raw.length > 4096) return Response.json({ error: 'Request too large.' }, { status: 413 });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || !('action' in body)) return Response.json({ error: 'Invalid request.' }, { status: 400 });
    const input = body as Record<string, unknown>;
    if (input.action === 'register') {
      await limit('registration:global', 20);
      await register(input.name, input.email, input.password); return Response.json({ ok: true });
    }
    const session = await getServerSession(authOptions);
    if (!session) return Response.json({ error: 'Please sign in.' }, { status: 401 });
    const user = session.user;
    await limit(`request:${user.id}`, 120);
    await cleanup();
    switch (input.action) {
      case 'create': { await limit(`create:${user.id}`, 5); return Response.json(await createAndJoinRoom(user)); }
      case 'join': await limit(`join:${user.id}`, 15); return Response.json({ code: input.code, ...await join(input.code, user) });
      case 'leave': await leave(input.code, user); break;
      case 'send': await send(input.code, user, input.text); break;
      case 'heartbeat': await heartbeat(input.code, user); break;
      default: return Response.json({ error: 'Unknown action.' }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    const failure = apiError(error);
    const diagnostic = diagnosticCode(error);
    if (failure.status >= 500) console.error('Chat request failed:', failure.code, diagnostic);
    const message = process.env.NODE_ENV !== 'production' && failure.status >= 500
      ? `${failure.error} [${diagnostic}]`
      : failure.error;
    return Response.json({ error: message, code: failure.code }, { status: failure.status });
  }
}

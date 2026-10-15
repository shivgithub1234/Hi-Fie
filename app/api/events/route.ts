import { errorMessage, errorStatus } from '../../../lib/errors';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { getRoom, requireMember, members, limit } from '../../../lib/store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });
  const user = session.user;
  const url = new URL(request.url), code = url.searchParams.get('code');
  try {
    await limit(`stream:${user.id}`, 20);
    requireMember(await getRoom(code), user);
  } catch (error) { return new Response(errorMessage(error), { status: errorStatus(error) }); }
  let cursor = request.headers.get('last-event-id') || url.searchParams.get('cursor');
  let stop: (closeStream?: boolean) => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => stop();
      const deadline = setTimeout(() => stop(), 25000);
      stop = (closeStream = true) => {
        if (closed) return;
        closed = true;
        clearTimeout(timer); clearTimeout(deadline);
        request.signal.removeEventListener('abort', onAbort);
        if (closeStream) controller.close();
      };
      const enqueue = (data: string) => { if (!closed) controller.enqueue(new TextEncoder().encode(data)); };
      const tick = async () => {
        try {
          // Every instance reads the same database; recursive scheduling avoids overlapping queries.
          const room = await getRoom(code);
          if (closed) return;
          requireMember(room, user);
          const index = room.messages.findIndex(message => message.id === cursor);
          const messages = cursor ? (index < 0 ? room.messages.slice(-5) : room.messages.slice(index + 1)) : room.messages.slice(-5);
          if (messages.length) cursor = messages.at(-1)!.id;
          enqueue(`${cursor ? `id: ${cursor}\n` : ''}data: ${JSON.stringify({ messages, members: members(room) })}\n\n`);
          timer = setTimeout(tick, 1000);
        } catch (error) {
          if (closed) return;
          if ([403, 404].includes(errorStatus(error))) enqueue('event: expired\ndata: {}\n\n');
          // Transient database failures close the stream, allowing native EventSource retries.
          stop();
        }
      };
      request.signal.addEventListener('abort', onAbort);
      if (request.signal.aborted) stop(); else void tick();
    },
    cancel() { stop(false); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}

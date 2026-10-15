import { getServerSession } from 'next-auth';
import { authOptions } from '../lib/auth';
import Chat from './ui';
export default async function Page() { const session = await getServerSession(authOptions); return <Chat user={session?.user || null} />; }

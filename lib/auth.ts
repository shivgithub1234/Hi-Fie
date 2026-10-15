import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { authenticate, limit } from './store';
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 86400 },
  providers: [CredentialsProvider({ name: 'Email', credentials: { email: {}, password: {} }, async authorize(credentials) {
    await limit('login:global', 60);
    await limit(`login:${String(credentials?.email).trim().toLowerCase()}`, 10);
    return authenticate(credentials?.email, credentials?.password);
  } })],
  callbacks: { async session({ session, token }) { if (!token.sub) throw new Error('Invalid session.'); session.user.id = token.sub; return session; } },
  pages: { signIn: '/' },
};

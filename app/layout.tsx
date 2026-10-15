import type { ReactNode } from 'react';
import './globals.css';
export const metadata = { title: 'hi-fie — a little room for conversation', description: 'Private real-time chat rooms, just five characters away.' };
export default function Layout({ children }: { children: ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

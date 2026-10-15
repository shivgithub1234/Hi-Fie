'use client';
import type { FormEvent } from 'react';
import type { ChatUser, ChatRequest, JoinResult, Message, Member, RoomUpdate } from '../lib/types';
import { errorMessage } from '../lib/errors';
import { useEffect, useRef, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';

async function api<T = { ok: boolean }>(body: ChatRequest): Promise<T> {
  const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Something went wrong.'); return data as T;
}
export default function Chat({ user }: { user: ChatUser | null }) {
  const [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [room, setRoom] = useState<JoinResult | null>(null), [code, setCode] = useState(''), [messages, setMessages] = useState<Message[]>([]), [people, setPeople] = useState<Member[]>([]), [draft, setDraft] = useState(''), [connected, setConnected] = useState(false), [copied, setCopied] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    if (!room) return;
    const events = new EventSource(`/api/events?code=${room.code}&cursor=${encodeURIComponent(room.cursor || '')}`);
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    events.onmessage = event => { const data: RoomUpdate = JSON.parse(event.data); setPeople(data.members); setMessages(previous => { const ids = new Set(previous.map(message => message.id)); return [...previous, ...data.messages.filter(message => !ids.has(message.id))].slice(-100); }); };
    events.addEventListener('expired', () => { events.close(); setError('Your presence expired. Join the room again.'); setRoom(null); });
    const heartbeat = setInterval(() => api({ action: 'heartbeat', code: room.code }).catch(error => setError(errorMessage(error))), 10000);
    return () => { events.close(); clearInterval(heartbeat); setConnected(false); };
  }, [room]);
  async function auth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const values = { name: String(form.get('name') || ''), email: String(form.get('email') || ''), password: String(form.get('password') || '') };
    try {
      if (register) await api({ action: 'register', ...values });
      const result = await signIn('credentials', { email: values.email, password: values.password, redirect: false });
      if (result?.error) throw new Error('Unable to sign in. Check your credentials or try again shortly.');
      window.location.reload();
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function enter(action: 'create' | 'join') {
    setBusy(true); setError('');
    try { const result = await api<JoinResult>(action === 'create' ? { action } : { action, code: code.trim().toUpperCase() }); setMessages(result.history); setPeople(result.members); setRoom(result); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function exit() {
    if (!room) return;
    setBusy(true); setError('');
    try { await api({ action: 'leave', code: room.code }); setRoom(null); setMessages([]); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!room || !draft.trim() || busy) return; setBusy(true); setError('');
    try { await api({ action: 'send', code: room.code, text: draft }); setDraft(''); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <main>
    <header><a className="brand" href="/">hi-fie<span>✳</span></a><div className="header-right"><span className="tagline">Small code. Good company.</span>{user && <button className="text-button" onClick={async () => { if (room) { try { await api({ action: 'leave', code: room.code }); } catch {} } await signOut({ callbackUrl: '/' }); }}>Sign out ↗</button>}</div></header>
    <div className="workspace"><aside><div><div className="eyebrow">A LITTLE SPACE TO CONNECT</div><h1>Good conversations<br/>start with <em>hi-fie.</em></h1><p>No invites to track. No noisy feeds.<br/>Just your people, in your own little room.</p></div><div className="illustration" aria-hidden="true"><div className="bubble one">hey, you made it <span>✦</span></div><div className="bubble two">right where I want to be.</div><div className="orbit">✳</div><span className="tiny-star">✧</span></div><div className="aside-bottom"><span className="dot"/> Made for the here and now.</div></aside>
    <section className={`panel ${room ? 'chat-panel' : ''}`}>
      {error && <div role="alert" className="error">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
      {!user ? <div className="form-wrap"><span className="pill">YOUR NEXT CONVERSATION AWAITS</span><h2>{register ? 'Make yourself at home.' : 'Welcome back.'}</h2><p>{register ? 'Create an account and bring your people together.' : 'Sign in to find your people.'}</p><form onSubmit={auth}>{register && <label>Your name<input name="name" placeholder="What should we call you?" minLength={2} maxLength={32} required autoComplete="name"/></label>}<label>Email address<input name="email" type="email" placeholder="you@example.com" required maxLength={254} autoComplete="email"/></label><label>Password<input name="password" type="password" placeholder={register ? 'At least 10 characters' : 'Your password'} minLength={register ? 10 : 1} maxLength={128} required autoComplete={register ? 'new-password' : 'current-password'}/></label><button className="primary" disabled={busy}>{busy ? 'One moment…' : register ? 'Create account ↗' : 'Sign in ↗'}</button></form><p className="switch">{register ? 'Already part of the conversation?' : 'New around here?'} <button className="text-button" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Sign in' : 'Create an account'}</button></p><div className="fine-print">A private room. A shared moment. That’s all.</div></div>
      : !room ? <div className="form-wrap"><span className="pill">LET’S GET TOGETHER</span><h2>Hey, {user.name.split(' ')[0]}.</h2><p>Start something new, or pick up a conversation.</p><button className="primary" disabled={busy} onClick={() => enter('create')}>Create a room <span>＋</span></button><div className="divider"><span>or join your people</span></div><form onSubmit={event => { event.preventDefault(); enter('join'); }}><label>Room code<input className="code-input" value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="ABCDE" minLength={5} maxLength={5} pattern="[A-Z2-9]{5}" required autoComplete="off"/></label><button className="secondary" disabled={busy}>Join room ↗</button></form><div className="info"><span>✦</span><p>Five characters are all you need.<br/>Share your room code with someone you like.</p></div></div>
      : <><div className="room-header"><div><span className="eyebrow">YOU’RE IN GOOD COMPANY</span><button className="room-code" title="Copy room code" onClick={async () => { try { await navigator.clipboard.writeText(room.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError('Copy the room code shown above to share it.'); } }}>{room.code} <small>{copied ? 'Copied!' : '⧉'}</small></button></div><button className="text-button" disabled={busy} onClick={exit}>Leave room ↗</button></div><div className="presence"><span className={`dot ${connected ? '' : 'offline'}`}/>{connected ? `${people.length} here` : 'Reconnecting…'}<span className="names">{people.map(person => person.name).join(', ')}</span></div><div className="messages" role="log" aria-label="Room messages" aria-live="polite"><div className="conversation-start"><span>✳</span><h3>A little room for your people.</h3><p>You’re seeing the last five messages before you joined.</p></div>{messages.map(message => message.system ? <div className="system" key={message.id}>{message.text}</div> : <div key={message.id} className={`message ${message.userId === user.id ? 'own' : ''}`}><div className="message-meta">{message.name}<time>{new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><div className="message-body">{message.text}</div></div>)}<div ref={bottom}/></div><form className="composer" onSubmit={send}><input aria-label="Message" placeholder="Say something nice…" value={draft} maxLength={1000} onChange={event => setDraft(event.target.value)}/><button aria-label="Send message" disabled={busy || !draft.trim() || !connected}>↑</button></form><div className="composer-note">A shared space. Keep it kind. <span>{draft.length}/1000</span></div></>}
    </section></div><footer><span>A little less scrolling. A little more talking.</span><span>FIVE CHARACTERS. ENDLESS POSSIBILITIES.</span></footer>
  </main>;
}

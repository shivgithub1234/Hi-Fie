export interface ChatUser { id: string; name: string; email?: string | null }
export interface Message { id: string; name: string; text: string; system: boolean; userId: string | null; at: number }
export interface Member { id: string; name: string }
export interface Room { code: string; messages: Message[]; members: Record<string, { name: string; seen: number }>; updated: number }
export interface JoinResult { code: string; history: Message[]; cursor?: string; members: Member[] }
export interface RoomUpdate { messages: Message[]; members: Member[] }
export type ChatRequest =
  | { action: 'register'; name: string; email: string; password: string }
  | { action: 'create' }
  | { action: 'join' | 'leave' | 'heartbeat'; code: string }
  | { action: 'send'; code: string; text: string };

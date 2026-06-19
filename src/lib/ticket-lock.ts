import { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv();

export const LOCK_TTL = 40; // segundos sin heartbeat = se libera automáticamente

export function lockKey(ticketId: string) {
  return `ticketlock:${ticketId}`;
}

export interface TicketLock {
  user: string;
}

export function checkApiKey(request: NextRequest) {
  return request.headers.get('x-api-key') === process.env.TICKET_LOCK_API_KEY;
}

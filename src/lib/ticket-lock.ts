import { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv();

export function checkApiKey(request: NextRequest) {
  return request.headers.get('x-api-key') === process.env.TICKET_LOCK_API_KEY;
}

// Índice de qué tickets tienen presencia activa ahora mismo (ZSET, member=ticketId,
// score=timestamp del último POST de presencia) — usado por /api/presence/[id]
// (que lo mantiene) y /api/presence/status (que lo lee) para evitar un
// redis.keys('ticketpresence:*') sobre TODO el keyspace en cada poll.
export const ACTIVE_TICKETS_KEY = 'presence:active_tickets';

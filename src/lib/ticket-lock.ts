import { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv();

export function checkApiKey(request: NextRequest) {
  return request.headers.get('x-api-key') === process.env.TICKET_LOCK_API_KEY;
}

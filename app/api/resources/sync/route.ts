import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { autotaskConfigured } from '@/lib/autotask';
import { syncResourcesFromAutotask } from '@/lib/resources';

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!autotaskConfigured()) return NextResponse.json({ ran: false, error: 'autotask not configured' });

  try {
    const result = await syncResourcesFromAutotask();
    return NextResponse.json({ ran: true, ...result });
  } catch {
    return NextResponse.json({ ran: false, error: 'supabase error' }, { status: 502 });
  }
}

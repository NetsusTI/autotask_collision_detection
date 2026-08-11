import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { checkAdminSession } from '@/lib/admin-auth';
import { supabase, type FeedbackType } from '@/lib/supabase/client';
import { lookupResourceId } from '@/lib/supabase/resources';
import { sendGraphMail } from '@/lib/graph-mail';

const VALID_TYPES: FeedbackType[] = ['mejorar', 'agregar', 'quitar', 'otro'];
const TYPE_LABEL: Record<FeedbackType, string> = {
  mejorar: 'Mejorar algo', agregar: 'Agregar algo', quitar: 'Quitar algo', otro: 'Otro',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// Fire-and-forget: sendGraphMail nunca lanza, así que un correo caído no puede
// tumbar la respuesta de /api/feedback. FEEDBACK_EMAIL_TO acepta varios correos
// separados por coma; si no está seteada, simplemente no se manda nada (el
// feedback igual queda guardado y visible en el panel admin).
function notifyFeedbackByEmail(resource_name: string, type: FeedbackType, message: string) {
  const toRaw = process.env.FEEDBACK_EMAIL_TO;
  if (!toRaw) return;
  const to = toRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!to.length) return;
  sendGraphMail(
    to,
    `Feedback CoView — ${TYPE_LABEL[type]} · ${resource_name}`,
    `<p><strong>${escapeHtml(resource_name)}</strong> envió feedback (${escapeHtml(TYPE_LABEL[type])}):</p>
     <p style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:6px">${escapeHtml(message)}</p>`,
  );
}

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { user, type, message } = await request.json().catch(() => ({}));

  const resource_name = typeof user === 'string' ? user.trim() : '';
  const msg = typeof message === 'string' ? message.trim() : '';
  const fbType: FeedbackType = VALID_TYPES.includes(type) ? type : 'otro';

  if (!resource_name || !msg) return NextResponse.json({ error: 'missing fields' }, { status: 400 });

  // El feedback no tiene respaldo en Redis (a diferencia de colisiones/notificaciones),
  // así que si el nombre no corresponde a un técnico conocido, se rechaza directamente
  // en vez de guardarlo sin dueño verificado.
  const resource_id = await lookupResourceId(resource_name);
  if (!resource_id) return NextResponse.json({ error: 'unknown resource' }, { status: 403 });

  const { error } = await supabase.from('feedback').insert({ resource_name, resource_id, type: fbType, message: msg });
  if (error) return NextResponse.json({ error: 'supabase error' }, { status: 502 });

  notifyFeedbackByEmail(resource_name, fbType, msg);

  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Lectura de feedback es una acción administrativa — mismo criterio que roster/
  // config/historial: el x-api-key embebido en la extensión pública no alcanza solo.
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });
  const url = request.nextUrl;
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);

  const { data, count, error } = await supabase
    .from('feedback')
    .select('id, resource_name, type, message, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error || !data) return NextResponse.json({ items: [], total: 0, offset, limit });

  return NextResponse.json({ items: data, total: count ?? data.length, offset, limit });
}

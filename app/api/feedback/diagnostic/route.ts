import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/ticket-lock';
import { checkAdminSession } from '@/lib/admin-auth';
import { graphMailConfigured } from '@/lib/graph-mail';

// Diagnóstico del envío de correo vía Microsoft Graph — sendGraphMail() es
// fire-and-forget y traga cualquier error a propósito (para no tumbar la
// respuesta de quien lo llama), así que no hay forma de ver por qué falla desde
// ahí. Este endpoint repite los mismos pasos (token + sendMail) pero exponiendo
// el error real de Azure/Graph en cada paso.
export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await checkAdminSession(request))) return NextResponse.json({ error: 'admin session required' }, { status: 403 });

  const envCheck = {
    MS_GRAPH_TENANT_ID: Boolean(process.env.MS_GRAPH_TENANT_ID),
    MS_GRAPH_CLIENT_ID: Boolean(process.env.MS_GRAPH_CLIENT_ID),
    MS_GRAPH_CLIENT_SECRET: Boolean(process.env.MS_GRAPH_CLIENT_SECRET),
    MS_GRAPH_SENDER_EMAIL: Boolean(process.env.MS_GRAPH_SENDER_EMAIL),
    FEEDBACK_EMAIL_TO: Boolean(process.env.FEEDBACK_EMAIL_TO),
  };

  if (!graphMailConfigured()) {
    return NextResponse.json({ configured: false, envCheck, error: 'Faltan variables de entorno — revisa envCheck' });
  }

  // 1. Token
  let tokenStatus = 0;
  let tokenBody = '';
  let accessToken: string | null = null;
  try {
    const tenantId = process.env.MS_GRAPH_TENANT_ID!;
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MS_GRAPH_CLIENT_ID!,
        client_secret: process.env.MS_GRAPH_CLIENT_SECRET!,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });
    tokenStatus = res.status;
    const raw = await res.text();
    tokenBody = raw.slice(0, 500);
    if (res.ok) {
      try { accessToken = JSON.parse(raw)?.access_token ?? null; } catch { /* noop */ }
    }
  } catch (e) {
    tokenBody = String(e);
  }

  if (!accessToken) {
    return NextResponse.json({
      configured: true, envCheck,
      step: 'token',
      token: { status: tokenStatus, bodySnippet: tokenBody },
      error: 'No se pudo obtener el token — revisa el detalle de "token" arriba (client secret vencido/incorrecto, tenant id, etc).',
    });
  }

  // 2. Envío de prueba
  const sender = process.env.MS_GRAPH_SENDER_EMAIL!;
  const toRaw = process.env.FEEDBACK_EMAIL_TO ?? '';
  const to = toRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!to.length) {
    return NextResponse.json({ configured: true, envCheck, step: 'send', error: 'FEEDBACK_EMAIL_TO está vacía o mal formada' });
  }

  let sendStatus = 0;
  let sendBody = '';
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: 'CoView — correo de prueba (diagnóstico)',
          body: { contentType: 'HTML', content: '<p>Si ves esto, el envío por Microsoft Graph está funcionando.</p>' },
          toRecipients: to.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: false,
      }),
    });
    sendStatus = res.status;
    sendBody = (await res.text()).slice(0, 500);
  } catch (e) {
    sendBody = String(e);
  }

  return NextResponse.json({
    configured: true, envCheck,
    step: 'send',
    sender, to,
    token: { status: tokenStatus, ok: true },
    send: { status: sendStatus, ok: sendStatus === 202 || sendStatus === 200, bodySnippet: sendBody },
  });
}

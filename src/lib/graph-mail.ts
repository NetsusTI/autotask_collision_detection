// Envío de correo vía Microsoft Graph (buzón de M365 de Netsus) — client credentials
// flow con una app registrada en Azure AD con el permiso de aplicación Mail.Send.
// Sin SDK: dos fetch simples (token + sendMail), mismo estilo que el resto del
// proyecto usa para Autotask y los webhooks de Teams.

import { redis } from '@/lib/ticket-lock';

const TOKEN_CACHE_KEY = 'msgraph:token';

export function graphMailConfigured(): boolean {
  return Boolean(
    process.env.MS_GRAPH_TENANT_ID &&
    process.env.MS_GRAPH_CLIENT_ID &&
    process.env.MS_GRAPH_CLIENT_SECRET &&
    process.env.MS_GRAPH_SENDER_EMAIL,
  );
}

export function defaultSender(): string | undefined {
  return process.env.MS_GRAPH_SENDER_EMAIL;
}

async function getAccessToken(): Promise<string | null> {
  const cached = await redis.get<string>(TOKEN_CACHE_KEY);
  if (cached) return cached;

  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return null;

  try {
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const token: string | undefined = data?.access_token;
    const expiresIn: number = data?.expires_in ?? 3600;
    if (!token) return null;
    // Cachea un poco por debajo del vencimiento real para no usar un token a punto
    // de expirar en un request que está por salir.
    await redis.set(TOKEN_CACHE_KEY, token, { ex: Math.max(60, expiresIn - 120) });
    return token;
  } catch {
    return null;
  }
}

// Envía un correo vía Graph, desde `from` si se especifica (debe ser un buzón real
// del tenant — Mail.Send de aplicación permite enviar "como" cualquier usuario de
// la organización) o desde MS_GRAPH_SENDER_EMAIL como respaldo. Nunca lanza —
// devuelve false ante cualquier error (config faltante, token, envío), mismo
// contrato que createTicketNote/sendTeamsWebhook: se llama fire-and-forget, un
// fallo acá no puede tumbar la respuesta HTTP de quien lo dispara.
export async function sendGraphMail(to: string[], subject: string, htmlBody: string, from?: string | null): Promise<boolean> {
  if (!graphMailConfigured() || !to.length) return false;
  const sender = from || process.env.MS_GRAPH_SENDER_EMAIL!;
  try {
    const token = await getAccessToken();
    if (!token) return false;

    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: htmlBody },
          toRecipients: to.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: false,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

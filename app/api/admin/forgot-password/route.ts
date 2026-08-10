import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/ticket-lock';
import { createResetCode, isResetRateLimited, registerResetRequest } from '@/lib/admin-auth';

// Sin sistema de usuarios (contraseña única compartida), la recuperación no puede
// verificar identidad por email. El código de un solo uso se manda al mismo webhook
// de Teams que ya usa el equipo para las alertas de colisión — canal que solo el
// equipo interno ve. Sin webhook configurado no hay forma de recuperarla desde acá.
export async function POST(request: NextRequest) {
  if (await isResetRateLimited(request)) {
    return NextResponse.json({ error: 'demasiados intentos, espera unos minutos' }, { status: 429 });
  }
  await registerResetRequest(request);

  const webhookUrl = await redis.get<string>('config:teams_webhook');
  if (!webhookUrl) {
    return NextResponse.json({ sent: false, reason: 'no_webhook' });
  }

  const code = await createResetCode();
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor: '3867E9',
        summary: 'Código de recuperación — Panel Admin CoView',
        sections: [{
          activityTitle: '🔑 Recuperación de contraseña',
          activitySubtitle: 'Alguien solicitó restablecer la contraseña del panel admin de CoView',
          facts: [
            { name: 'Código', value: code },
            { name: 'Válido por', value: '10 minutos' },
            { name: 'Hora', value: new Date().toLocaleString('es-CL') },
          ],
          markdown: true,
        }],
      }),
    });
  } catch {
    return NextResponse.json({ sent: false, reason: 'webhook_error' });
  }

  return NextResponse.json({ sent: true });
}

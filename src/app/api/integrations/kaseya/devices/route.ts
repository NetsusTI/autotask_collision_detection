import { NextRequest, NextResponse } from 'next/server';
import {
  getKaseyaDevices,
  getITGlueClients,
  syncKaseyaToITGlue,
} from '@/lib/integrations/kaseya-itglue';

// GET /api/integrations/kaseya/devices?clientId=xxx
export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get('clientId');

    if (!clientId) {
      return NextResponse.json(
        { error: 'clientId requerido' },
        { status: 400 }
      );
    }

    const devices = await getKaseyaDevices(clientId);
    return NextResponse.json(devices);
  } catch (error) {
    console.error('Error obteniendo dispositivos Kaseya:', error);
    return NextResponse.json(
      { error: 'Error obteniendo dispositivos' },
      { status: 500 }
    );
  }
}

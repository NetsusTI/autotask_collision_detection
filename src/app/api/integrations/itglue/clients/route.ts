import { NextRequest, NextResponse } from 'next/server';
import { getITGlueClients } from '@/lib/integrations/kaseya-itglue';

// GET /api/integrations/itglue/clients
export async function GET(request: NextRequest) {
  try {
    const clients = await getITGlueClients();
    return NextResponse.json(clients);
  } catch (error) {
    console.error('Error obteniendo clientes IT Glue:', error);
    return NextResponse.json(
      { error: 'Error obteniendo clientes' },
      { status: 500 }
    );
  }
}

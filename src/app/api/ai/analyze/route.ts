import { NextRequest, NextResponse } from 'next/server';
import { analyzePerformance, predictFailures, optimizeCosts, analyzeSecurity, generateReport } from '@/lib/ai/analysis';

// POST /api/ai/analyze
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    let result;

    switch (type) {
      case 'performance':
        result = await analyzePerformance(data);
        break;
      case 'failures':
        result = await predictFailures(data);
        break;
      case 'costs':
        result = await optimizeCosts(data);
        break;
      case 'security':
        result = await analyzeSecurity(data);
        break;
      default:
        return NextResponse.json(
          { error: 'Tipo de análisis no válido' },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error en análisis de IA:', error);
    return NextResponse.json(
      { error: 'Error procesando análisis' },
      { status: 500 }
    );
  }
}

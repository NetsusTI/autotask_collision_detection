import { NextRequest, NextResponse } from 'next/server';
import { generateReport } from '@/lib/ai/analysis';

// POST /api/reports/generate
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportType, data } = body;

    if (!['executive', 'technical', 'operational'].includes(reportType)) {
      return NextResponse.json(
        { error: 'Tipo de reporte no válido' },
        { status: 400 }
      );
    }

    const report = await generateReport(
      data,
      reportType as 'executive' | 'technical' | 'operational'
    );

    return NextResponse.json({
      report,
      generatedAt: new Date(),
      reportType,
    });
  } catch (error) {
    console.error('Error generando reporte:', error);
    return NextResponse.json(
      { error: 'Error generando reporte' },
      { status: 500 }
    );
  }
}

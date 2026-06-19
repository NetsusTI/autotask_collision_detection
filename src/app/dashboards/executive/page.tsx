'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ExecutiveDashboard } from '@/components/dashboards/executive-dashboard';
import {
  TrendingUp,
  DollarSign,
  Users,
  Zap,
} from 'lucide-react';

// Datos mock para demostración
const mockExecutiveData = {
  totalRevenue: 852000,
  revenueGrowth: 12,
  totalClients: 45,
  avgClientValue: 18933,
  profitMargin: 38,
  revenueByClient: [
    { name: 'Acme Corp', value: 28 },
    { name: 'TechStart', value: 18 },
    { name: 'Global Inc', value: 22 },
    { name: 'FastCorp', value: 12 },
    { name: 'Otros', value: 20 },
  ],
  profitTrend: [
    { month: 'Ene', profit: 18000, expenses: 27000 },
    { month: 'Feb', profit: 20800, expenses: 31200 },
    { month: 'Mar', profit: 19200, expenses: 28800 },
    { month: 'Abr', profit: 24400, expenses: 36600 },
    { month: 'May', profit: 23600, expenses: 35400 },
    { month: 'Jun', profit: 26800, expenses: 40200 },
  ],
  kpis: [
    {
      label: 'MRR (Ingresos Mensual)',
      value: '$71,000',
      change: 12,
      icon: <DollarSign className="w-8 h-8 text-green-600" />,
    },
    {
      label: 'Cliente Acquisition Cost',
      value: '$2,100',
      change: -5,
      icon: <Users className="w-8 h-8 text-blue-600" />,
    },
    {
      label: 'LTV / CAC Ratio',
      value: '9.0x',
      change: 8,
      icon: <TrendingUp className="w-8 h-8 text-purple-600" />,
    },
    {
      label: 'Margin %',
      value: '38%',
      change: 3,
      icon: <Zap className="w-8 h-8 text-orange-600" />,
    },
  ],
};

export default function ExecutiveDashboardPage() {
  return (
    <div>
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Panel Ejecutivo</h1>
          <div className="flex gap-2">
            <button className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Descargar PDF
            </button>
            <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Programar Reporte
            </button>
          </div>
        </div>
      </header>

      {/* Dashboard */}
      <ExecutiveDashboard {...mockExecutiveData} />
    </div>
  );
}

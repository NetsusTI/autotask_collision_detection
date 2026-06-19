'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MSPDashboard } from '@/components/dashboards/msp-dashboard';

// Datos mock para demostración
const mockMSPData = {
  totalClients: 45,
  activeAlerts: 7,
  avgResponseTime: 12,
  tasksCompleted: 234,
  revenueData: [
    { month: 'Ene', revenue: 45000, target: 50000 },
    { month: 'Feb', revenue: 52000, target: 50000 },
    { month: 'Mar', revenue: 48000, target: 50000 },
    { month: 'Abr', revenue: 61000, target: 55000 },
    { month: 'May', revenue: 59000, target: 55000 },
    { month: 'Jun', revenue: 67000, target: 60000 },
  ],
  clientMetrics: [
    { name: 'Acme Corp', tickets: 12, devices: 45 },
    { name: 'TechStart', tickets: 8, devices: 32 },
    { name: 'Global Inc', tickets: 15, devices: 58 },
    { name: 'FastCorp', tickets: 5, devices: 18 },
    { name: 'WebSolutions', tickets: 10, devices: 28 },
  ],
  systemHealth: [
    { name: 'Kaseya Platform', status: 'healthy' as const, percentage: 99 },
    { name: 'IT Glue Sync', status: 'healthy' as const, percentage: 98 },
    { name: 'Backup System', status: 'healthy' as const, percentage: 97 },
    { name: 'Security Scan', status: 'warning' as const, percentage: 85 },
  ],
};

export default function MSPDashboardPage() {
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
          <h1 className="text-xl font-bold text-gray-900">Panel MSP</h1>
          <div className="flex gap-2">
            <button className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Exportar
            </button>
            <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Generar Reporte
            </button>
          </div>
        </div>
      </header>

      {/* Dashboard */}
      <MSPDashboard {...mockMSPData} />
    </div>
  );
}

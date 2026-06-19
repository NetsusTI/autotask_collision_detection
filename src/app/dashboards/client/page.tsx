'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ClientDashboard } from '@/components/dashboards/client-dashboard';

// Datos mock para demostración
const mockClientData = {
  clientName: 'Acme Corporation',
  metrics: [
    {
      label: 'Dispositivos Monitoreados',
      value: 42,
      change: 5,
      icon: '🖥️',
      status: 'good' as const,
    },
    {
      label: 'Disponibilidad',
      value: '99.8%',
      change: 0.2,
      icon: '⬆️',
      status: 'good' as const,
    },
    {
      label: 'Tickets Abiertos',
      value: 3,
      change: -2,
      icon: '📋',
      status: 'good' as const,
    },
    {
      label: 'Alertas Activas',
      value: 1,
      change: -1,
      icon: '⚠️',
      status: 'warning' as const,
    },
  ],
  performanceData: [
    { date: 'Lun', cpu: 45, memory: 62 },
    { date: 'Mar', cpu: 52, memory: 68 },
    { date: 'Mié', cpu: 48, memory: 65 },
    { date: 'Jue', cpu: 65, memory: 78 },
    { date: 'Vie', cpu: 58, memory: 72 },
    { date: 'Sab', cpu: 42, memory: 55 },
    { date: 'Dom', cpu: 38, memory: 48 },
  ],
  costData: [
    { name: 'Licencias', value: 2500 },
    { name: 'Soporte', value: 1800 },
    { name: 'Infraestructura', value: 3200 },
    { name: 'Otros', value: 800 },
  ],
  uptime: 99.82,
  ticketStats: {
    open: 3,
    inProgress: 5,
    resolved: 127,
  },
};

export default function ClientDashboardPage() {
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
          <h1 className="text-xl font-bold text-gray-900">Panel del Cliente</h1>
          <div className="w-8 h-8 bg-blue-600 rounded-full" />
        </div>
      </header>

      {/* Dashboard */}
      <ClientDashboard {...mockClientData} />
    </div>
  );
}

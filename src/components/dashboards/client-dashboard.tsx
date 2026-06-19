'use client';

import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  AlertCircle,
  TrendingUp,
  DollarSign,
  Zap,
  Shield,
} from 'lucide-react';

interface DashboardMetric {
  label: string;
  value: string | number;
  change: number;
  icon: React.ReactNode;
  status: 'good' | 'warning' | 'critical';
}

interface DashboardProps {
  clientName: string;
  metrics: DashboardMetric[];
  performanceData: any[];
  costData: any[];
  uptime: number;
  ticketStats: {
    open: number;
    inProgress: number;
    resolved: number;
  };
}

export function ClientDashboard({
  clientName,
  metrics,
  performanceData,
  costData,
  uptime,
  ticketStats,
}: DashboardProps) {
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-6 p-6 bg-gray-50">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{clientName}</h1>
        <p className="text-gray-600 mt-1">Dashboard de Operaciones</p>
      </div>

      {/* Métricas Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-lg border-2 ${
              metric.status === 'good'
                ? 'bg-green-50 border-green-200'
                : metric.status === 'warning'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{metric.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {metric.value}
                </p>
              </div>
              <div className="text-2xl">{metric.icon}</div>
            </div>
            <p
              className={`text-sm mt-2 ${
                metric.change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {metric.change >= 0 ? '↑' : '↓'} {Math.abs(metric.change)}%
            </p>
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Trend */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">
            Performance (últimos 7 días)
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke="#3b82f6"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="memory"
                stroke="#10b981"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cost Analysis */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">
            Costo Mensual por Categoría
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={costData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: $${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {costData.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ticket Stats */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold mb-4 text-gray-900">
          Estado de Tickets
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-600">
              {ticketStats.open}
            </p>
            <p className="text-sm text-gray-600">Abiertos</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-yellow-600">
              {ticketStats.inProgress}
            </p>
            <p className="text-sm text-gray-600">En Progreso</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">
              {ticketStats.resolved}
            </p>
            <p className="text-sm text-gray-600">Resueltos</p>
          </div>
        </div>
      </div>

      {/* Uptime Status */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-6 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Disponibilidad del Sistema</h3>
            <p className="text-emerald-100 mt-1">SLA Target: 99.9%</p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold">{uptime.toFixed(2)}%</p>
            <p className="text-sm text-emerald-100">Este mes</p>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TrendingUp, DollarSign, Users, Zap } from 'lucide-react';

interface ExecutiveDashboardProps {
  totalRevenue: number;
  revenueGrowth: number;
  totalClients: number;
  avgClientValue: number;
  profitMargin: number;
  revenueByClient: any[];
  profitTrend: any[];
  kpis: {
    label: string;
    value: string | number;
    change: number;
    icon: React.ReactNode;
  }[];
}

export function ExecutiveDashboard({
  totalRevenue,
  revenueGrowth,
  totalClients,
  avgClientValue,
  profitMargin,
  revenueByClient,
  profitTrend,
  kpis,
}: ExecutiveDashboardProps) {
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-6 p-6 bg-gray-50">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Dashboard Ejecutivo
        </h1>
        <p className="text-gray-600 mt-1">Métricas de Negocio</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white p-6 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">{kpi.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {kpi.value}
                </p>
              </div>
              <div className="text-2xl">{kpi.icon}</div>
            </div>
            <p
              className={`text-sm mt-2 ${
                kpi.change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {kpi.change >= 0 ? '↑' : '↓'} {Math.abs(kpi.change)}%
            </p>
          </div>
        ))}
      </div>

      {/* Main Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-lg">
          <h3 className="text-lg font-semibold">Ingresos Totales</h3>
          <p className="text-4xl font-bold mt-2">${totalRevenue.toLocaleString()}</p>
          <p className="text-blue-100 text-sm mt-2">
            ↑ {revenueGrowth}% vs período anterior
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-lg">
          <h3 className="text-lg font-semibold">Margen de Ganancia</h3>
          <p className="text-4xl font-bold mt-2">{profitMargin}%</p>
          <p className="text-green-100 text-sm mt-2">Del total de ingresos</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-lg">
          <h3 className="text-lg font-semibold">Valor Promedio Cliente</h3>
          <p className="text-4xl font-bold mt-2">${avgClientValue.toLocaleString()}</p>
          <p className="text-purple-100 text-sm mt-2">
            Con {totalClients} clientes activos
          </p>
        </div>
      </div>

      {/* Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Client */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">
            Top Clientes por Ingresos
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={revenueByClient}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {revenueByClient.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Profit Trend */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">
            Tendencia de Ganancias
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={profitTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `$${value}`} />
              <Legend />
              <Line
                type="monotone"
                dataKey="profit"
                stroke="#10b981"
                dot={false}
                name="Ganancias"
              />
              <Line
                type="monotone"
                dataKey="expenses"
                stroke="#ef4444"
                dot={false}
                name="Gastos"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold mb-4 text-gray-900">
          Resumen Ejecutivo
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-gray-600 text-sm">Clientes Activos</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalClients}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Ingresos Mensuales</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              ${(totalRevenue / 12).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Costo Adquisición</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">
              $
              {(totalRevenue / 12 / totalClients).toLocaleString('es-AR', {
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">NPS Score</p>
            <p className="text-2xl font-bold text-green-600 mt-1">42</p>
          </div>
        </div>
      </div>
    </div>
  );
}

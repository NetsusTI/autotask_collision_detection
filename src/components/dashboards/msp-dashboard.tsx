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
import {
  Users,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle,
  Activity,
} from 'lucide-react';

interface MSPDashboardProps {
  totalClients: number;
  activeAlerts: number;
  avgResponseTime: number;
  tasksCompleted: number;
  revenueData: any[];
  clientMetrics: any[];
  systemHealth: {
    name: string;
    status: 'healthy' | 'warning' | 'critical';
    percentage: number;
  }[];
}

export function MSPDashboard({
  totalClients,
  activeAlerts,
  avgResponseTime,
  tasksCompleted,
  revenueData,
  clientMetrics,
  systemHealth,
}: MSPDashboardProps) {
  const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'critical':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6 p-6 bg-gray-50">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard MSP</h1>
        <p className="text-gray-600 mt-1">Vista General de Operaciones</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg border border-gray-200 flex items-center">
          <div className="flex-1">
            <p className="text-gray-600 text-sm">Total Clientes</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {totalClients}
            </p>
          </div>
          <Users className="w-12 h-12 text-blue-500 opacity-20" />
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 flex items-center">
          <div className="flex-1">
            <p className="text-gray-600 text-sm">Alertas Activas</p>
            <p className="text-3xl font-bold text-red-600 mt-1">
              {activeAlerts}
            </p>
          </div>
          <AlertTriangle className="w-12 h-12 text-red-500 opacity-20" />
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 flex items-center">
          <div className="flex-1">
            <p className="text-gray-600 text-sm">Tiempo Respuesta Promedio</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">
              {avgResponseTime}m
            </p>
          </div>
          <Clock className="w-12 h-12 text-blue-500 opacity-20" />
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 flex items-center">
          <div className="flex-1">
            <p className="text-gray-600 text-sm">Tareas Completadas</p>
            <p className="text-3xl font-bold text-green-600 mt-1">
              {tasksCompleted}
            </p>
          </div>
          <CheckCircle className="w-12 h-12 text-green-500 opacity-20" />
        </div>
      </div>

      {/* Revenue Trend */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold mb-4 text-gray-900">
          Ingresos (últimos 12 meses)
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(value) => `$${value}`} />
            <Legend />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#3b82f6"
              dot={false}
              name="Ingresos"
            />
            <Line
              type="monotone"
              dataKey="target"
              stroke="#10b981"
              dot={false}
              strokeDasharray="5 5"
              name="Target"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Client Metrics & System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cliente Metrics */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">
            Top Clientes por Actividad
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={clientMetrics}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="tickets" fill="#3b82f6" />
              <Bar dataKey="devices" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* System Health */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">
            Salud de Sistemas
          </h2>
          <div className="space-y-3">
            {systemHealth.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{item.name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        item.status === 'healthy'
                          ? 'bg-green-500'
                          : item.status === 'warning'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                      }`}
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${getStatusColor(item.status)}`}>
                    {item.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

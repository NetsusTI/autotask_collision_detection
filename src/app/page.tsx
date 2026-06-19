'use client';

import Link from 'next/link';
import {
  BarChart3,
  Settings,
  FileText,
  Zap,
  Shield,
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
} from 'lucide-react';

export default function Home() {
  const features = [
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: 'Dashboards Inteligentes',
      description:
        'Dashboards en tiempo real para clientes, MSP y ejecutivos con análisis de IA',
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: 'Plantillas Automáticas',
      description:
        'Plantillas de IT Glue y Kaseya para documentación y automatización',
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'IA Predictiva',
      description: 'Predicción de fallos antes de que ocurran con análisis IA',
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: 'Optimización de Costos',
      description: 'Identifica oportunidades de ahorro con recomendaciones IA',
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: 'Análisis de Seguridad',
      description: 'Análisis de seguridad profundo con recomendaciones IA',
    },
    {
      icon: <Settings className="w-6 h-6" />,
      title: 'Integración Completa',
      description:
        'Integración seamless con Kaseya e IT Glue para workflows unificados',
    },
  ];

  const dashboards = [
    {
      name: 'Panel Cliente',
      description: 'Vista de operaciones del cliente',
      href: '/dashboards/client',
      color: 'from-blue-500 to-blue-600',
    },
    {
      name: 'Panel MSP',
      description: 'Vista operacional del MSP',
      href: '/dashboards/msp',
      color: 'from-green-500 to-green-600',
    },
    {
      name: 'Panel Ejecutivo',
      description: 'Métricas de negocio',
      href: '/dashboards/executive',
      color: 'from-purple-500 to-purple-600',
    },
  ];

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">Netsus</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/dashboards/client"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Dashboards
            </Link>
            <Link
              href="/templates"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Plantillas
            </Link>
            <Link
              href="#"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              Iniciar Sesión
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-24 pb-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Dashboard Integrado Kaseya + IT Glue con IA
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Plantillas, dashboards y reportes automáticos con análisis de
            inteligencia artificial para optimizar tu MSP
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/dashboards/msp"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Ir a Dashboards
            </Link>
            <Link
              href="/templates"
              className="px-6 py-3 border-2 border-gray-300 text-gray-900 rounded-lg hover:border-gray-400 font-medium"
            >
              Ver Plantillas
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Características Principales
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="bg-white p-6 rounded-lg border border-gray-200 hover:border-blue-300 transition"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 mb-4">
                  {feature.icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboards Preview */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Acceso a Dashboards
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {dashboards.map((dash, idx) => (
              <Link
                key={idx}
                href={dash.href}
                className={`p-6 rounded-lg text-white bg-gradient-to-br ${dash.color} hover:shadow-lg transition cursor-pointer`}
              >
                <h3 className="text-xl font-semibold mb-2">{dash.name}</h3>
                <p className="text-white text-opacity-90 mb-4">
                  {dash.description}
                </p>
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  Acceder <TrendingUp className="w-4 h-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Transforma tu MSP con IA
          </h2>
          <p className="text-lg text-blue-100 mb-8">
            Automatiza operaciones, optimiza costos y mejora la experiencia del
            cliente con plantillas y análisis inteligentes
          </p>
          <Link
            href="/dashboards/msp"
            className="inline-block px-8 py-3 bg-white text-blue-600 rounded-lg hover:bg-gray-100 font-semibold"
          >
            Comenzar Ahora
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <p>
            © 2026 Netsus - Dashboard Integrado Kaseya + IT Glue con IA
          </p>
        </div>
      </footer>
    </main>
  );
}

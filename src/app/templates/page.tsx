'use client';

import Link from 'next/link';
import { ArrowLeft, Copy, Download } from 'lucide-react';
import { ITGLUE_TEMPLATES } from '@/lib/templates/it-glue-templates';
import { KASEYA_TEMPLATES } from '@/lib/templates/kaseya-templates';

export default function TemplatesPage() {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copiado al portapapeles');
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
          <h1 className="text-xl font-bold text-gray-900">Plantillas</h1>
          <div className="w-8 h-8" />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* IT Glue Templates */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">
            Plantillas IT Glue
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(ITGLUE_TEMPLATES).map(([key, template]: any) => (
              <div
                key={key}
                className="bg-white p-6 rounded-lg border border-gray-200 hover:border-blue-300 transition"
              >
                <h3 className="font-semibold text-gray-900 mb-3">
                  {template.name}
                </h3>

                {template.fields && (
                  <div>
                    <p className="text-sm text-gray-600 mb-3">Campos:</p>
                    <ul className="space-y-2 mb-4">
                      {Object.entries(template.fields)
                        .slice(0, 4)
                        .map(([fieldKey, fieldName]: any) => (
                          <li
                            key={fieldKey}
                            className="text-sm text-gray-700 flex items-center gap-2"
                          >
                            <span className="w-2 h-2 bg-blue-600 rounded-full" />
                            {fieldName}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                {template.sections && (
                  <div>
                    <p className="text-sm text-gray-600 mb-3">Secciones:</p>
                    <ul className="space-y-2 mb-4">
                      {template.sections.map(
                        (section: any, idx: number) => (
                          <li
                            key={idx}
                            className="text-sm text-gray-700 flex items-center gap-2"
                          >
                            <span className="w-2 h-2 bg-blue-600 rounded-full" />
                            {section.title}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                <button
                  onClick={() =>
                    copyToClipboard(JSON.stringify(template, null, 2))
                  }
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  <Copy className="w-4 h-4" />
                  Copiar JSON
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Kaseya Templates */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-8">
            Plantillas Kaseya
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(KASEYA_TEMPLATES).map(([key, template]: any) => (
              <div
                key={key}
                className="bg-white p-6 rounded-lg border border-gray-200 hover:border-green-300 transition"
              >
                <h3 className="font-semibold text-gray-900 mb-3">
                  {template.name}
                </h3>

                {template.script && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Script:</p>
                    <pre className="bg-gray-100 p-3 rounded text-xs text-gray-700 overflow-x-auto mb-3">
                      {template.script.slice(0, 150)}...
                    </pre>
                  </div>
                )}

                {template.metrics && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Métricas:</p>
                    <ul className="space-y-1 mb-3">
                      {template.metrics
                        .slice(0, 3)
                        .map((metric: any, idx: number) => (
                          <li
                            key={idx}
                            className="text-sm text-gray-700 flex items-center gap-2"
                          >
                            <span className="w-2 h-2 bg-green-600 rounded-full" />
                            {metric.name} (Threshold: {metric.threshold})
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={() =>
                    copyToClipboard(JSON.stringify(template, null, 2))
                  }
                  className="flex items-center gap-2 text-sm text-green-600 hover:text-green-700"
                >
                  <Copy className="w-4 h-4" />
                  Copiar JSON
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

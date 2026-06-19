# Netsus - Dashboard Integrado Kaseya + IT Glue con IA

Dashboard enterprise para MSPs con análisis de inteligencia artificial, plantillas automáticas y reportes inteligentes.

## 🚀 Características Principales

### Dashboards
- **Panel Cliente**: Vista de operaciones con KPIs, performance y tickets
- **Panel MSP**: Dashboard operacional con ingresos, alertas y salud de sistemas
- **Panel Ejecutivo**: Métricas de negocio, ROI y tendencias

### Plantillas
- **IT Glue**: Documentación, procedimientos, credenciales, inventario
- **Kaseya**: Automatización, monitoreo, patching, backups, detección de amenazas

### IA Integrada
- Análisis de Performance automático
- Predicción de Fallos antes de ocurrir
- Optimización de Costos con oportunidades de ahorro
- Análisis de Seguridad y vulnerabilidades
- Generación de Reportes automáticos

## 🛠️ Instalación

```bash
cd /home/ricardoillanes/netsus
npm install
```

## ⚙️ Configuración

Edita `.env.local` con tus credenciales (opcional):

```env
OPENAI_API_KEY=tu_clave_aqui
KASEYA_API_KEY=tu_clave_aqui
ITGLUE_API_KEY=tu_clave_aqui
```

## 🎯 Uso

### Desarrollo
```bash
npm run dev
```
Accede a http://localhost:3000

### Compilar para Producción
```bash
npm run build
npm start
```

## 📊 Dashboards

- **Cliente**: /dashboards/client
- **MSP**: /dashboards/msp
- **Ejecutivo**: /dashboards/executive
- **Plantillas**: /templates

## 📁 Estructura

```
src/
├── app/                  # Páginas y APIs
├── components/           # Componentes React
├── lib/
│   ├── ai/              # Módulos de análisis IA
│   ├── integrations/    # Kaseya e IT Glue
│   └── templates/       # Definiciones de plantillas
└── config/              # Configuración global
```

## 🤖 IA Features

- **Análisis de Performance**: CPU, memoria, disk
- **Predicción de Fallos**: Identifica componentes en riesgo
- **Optimización de Costos**: ROI estimado por oportunidad
- **Análisis de Seguridad**: Score y vulnerabilidades
- **Reportes Automáticos**: Ejecutivo, técnico, operacional

## 📚 Tecnologías

- Next.js 16 + React
- TypeScript
- Tailwind CSS
- Recharts
- OpenAI API
- Axios

## 📝 Notas

- El proyecto funciona con datos simulados si las APIs no están configuradas
- Fallback automático a simulador para OpenAI si no hay API key
- Compatible con Kaseya e IT Glue cuando están configurados

## 🚀 Deploy

Optimizado para Vercel. Configura variables de entorno en Vercel Dashboard.

---

Desarrollado por Netsus - 2026

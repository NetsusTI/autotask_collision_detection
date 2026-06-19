// Configuración global
export const APP_CONFIG = {
  name: 'Netsus - MSP Dashboard',
  version: '1.0.0',
  description: 'Dashboard integrado Kaseya + IT Glue con IA',
};

// Roles de usuarios
export const USER_ROLES = {
  ADMIN: 'admin',
  MSP_MANAGER: 'msp_manager',
  CLIENT: 'client',
  TECHNICIAN: 'technician',
};

// SLA defaults
export const SLA_DEFAULTS = {
  RESPONSE_TIME: 4, // horas
  RESOLUTION_TIME: 24, // horas
  UPTIME_TARGET: 99.9, // %
};

// Intervalos de análisis de IA
export const AI_ANALYSIS_INTERVALS = {
  REAL_TIME: 5, // minutos
  HOURLY: 60, // minutos
  DAILY: 1440, // minutos
};

// Temas de reportes
export const REPORT_THEMES = {
  OPERATIONAL: 'operational',
  FINANCIAL: 'financial',
  SECURITY: 'security',
  PERFORMANCE: 'performance',
};

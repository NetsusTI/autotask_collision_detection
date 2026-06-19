// Plantillas de Kaseya para automatización

export const KASEYA_TEMPLATES = {
  // Script de Provisioning Automatizado
  PROVISIONING_AUTOMATION: {
    name: 'Provisioning Automatizado',
    script: `
      # Script de provisioning inicial
      1. Crear usuario administrativo
      2. Configurar Windows Updates
      3. Instalar antivirus
      4. Configurar backup automático
      5. Habilitar Remote Desktop
      6. Agregar a dominio
    `,
    triggers: ['on_new_client', 'on_device_added'],
    actions: [
      'run_script',
      'send_notification',
      'create_ticket',
    ],
  },

  // Script de Monitoreo de Performance
  PERFORMANCE_MONITORING: {
    name: 'Monitoreo de Performance',
    metrics: [
      {
        name: 'CPU Usage',
        threshold: 80,
        action: 'alert',
      },
      {
        name: 'Memory Usage',
        threshold: 85,
        action: 'alert',
      },
      {
        name: 'Disk Usage',
        threshold: 90,
        action: 'alert_critical',
      },
      {
        name: 'Network Latency',
        threshold: 150,
        action: 'alert',
      },
    ],
  },

  // Script de Patching Automático
  PATCH_MANAGEMENT: {
    name: 'Gestión de Parches',
    policies: [
      {
        name: 'Critical Updates Weekly',
        schedule: 'every_sunday_02:00',
        severity: 'critical',
        auto_approve: true,
      },
      {
        name: 'Monthly Updates',
        schedule: 'first_sunday_03:00',
        severity: 'high,medium',
        auto_approve: false,
      },
    ],
  },

  // Script de Backup Automático
  BACKUP_AUTOMATION: {
    name: 'Automatización de Backups',
    schedule: 'daily_midnight',
    retention_days: 30,
    backup_targets: [
      'user_documents',
      'database_data',
      'configuration_files',
    ],
    verification: 'enabled',
    notification_on_failure: true,
  },

  // Script de Detección de Amenazas
  THREAT_DETECTION: {
    name: 'Detección de Amenazas',
    checks: [
      'malware_scan',
      'firewall_rules_verification',
      'open_ports_check',
      'suspicious_process_detection',
      'failed_login_attempts',
    ],
    alert_thresholds: {
      malware_found: 'critical',
      suspicious_activity: 'high',
      failed_logins: 5,
    },
  },

  // Script de Reportes Automáticos
  AUTOMATED_REPORTS: {
    name: 'Reportes Automáticos',
    schedule: 'weekly',
    recipients: 'client_contacts',
    content: [
      'system_uptime',
      'security_status',
      'patch_status',
      'backup_status',
      'pending_tasks',
    ],
  },

  // Workflow de Respuesta a Incidentes
  INCIDENT_RESPONSE: {
    name: 'Respuesta a Incidentes',
    workflow: [
      {
        step: 1,
        action: 'detect_alert',
      },
      {
        step: 2,
        action: 'gather_diagnostics',
      },
      {
        step: 3,
        action: 'create_support_ticket',
      },
      {
        step: 4,
        action: 'notify_technician',
      },
      {
        step: 5,
        action: 'escalate_if_critical',
      },
    ],
  },
};

// Interfaz para automation de Kaseya
export interface KaseyaAutomation {
  id: string;
  name: string;
  type: 'script' | 'workflow' | 'policy';
  enabled: boolean;
  clientIds: string[];
  schedule?: string;
  lastRun?: Date;
  nextRun?: Date;
  status: 'active' | 'inactive' | 'error';
}

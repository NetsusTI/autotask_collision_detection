// Plantillas de IT Glue para documentación de clientes

export const ITGLUE_TEMPLATES = {
  // Plantilla de Cliente
  CLIENT_PROFILE: {
    name: 'Perfil de Cliente',
    fields: {
      company_name: 'Nombre de la Empresa',
      industry: 'Industria',
      contact_person: 'Persona de Contacto',
      email: 'Email Corporativo',
      phone: 'Teléfono',
      address: 'Dirección',
      account_manager: 'Gerente de Cuenta',
      contract_start: 'Fecha de Inicio',
      contract_end: 'Fecha de Vencimiento',
      sla_level: 'Nivel de SLA',
      monthly_cost: 'Costo Mensual',
      notes: 'Notas',
    },
  },

  // Plantilla de Documento de Procedimientos
  PROCEDURES_DOCUMENTATION: {
    name: 'Procedimientos y Procesos',
    sections: [
      {
        title: 'Procedimientos de Provisioning',
        content: `
          1. Verificación de requisitos del cliente
          2. Creación de cuenta en Kaseya
          3. Instalación de agente en dispositivos
          4. Configuración inicial de monitoreo
          5. Capacitación del usuario
        `,
      },
      {
        title: 'Procedimientos de Soporte',
        content: `
          1. Recepción de ticket
          2. Diagnóstico inicial
          3. Escalación si es necesario
          4. Resolución
          5. Cierre de ticket
        `,
      },
    ],
  },

  // Plantilla de Credenciales Seguras
  CREDENTIALS_VAULT: {
    name: 'Bóveda de Credenciales',
    fields: {
      resource_name: 'Nombre del Recurso',
      resource_type: 'Tipo (DB, Server, App, etc)',
      username: 'Usuario',
      password: 'Contraseña',
      access_url: 'URL de Acceso',
      expiration_date: 'Fecha de Expiración',
      backup_contact: 'Contacto de Respaldo',
    },
  },

  // Plantilla de Activos de TI
  HARDWARE_INVENTORY: {
    name: 'Inventario de Hardware',
    fields: {
      device_name: 'Nombre del Dispositivo',
      device_type: 'Tipo (PC, Laptop, Servidor, etc)',
      serial_number: 'Número de Serie',
      ip_address: 'Dirección IP',
      mac_address: 'Dirección MAC',
      os: 'Sistema Operativo',
      installed_software: 'Software Instalado',
      warranty_expiration: 'Expiración de Garantía',
      last_update: 'Última Actualización',
      location: 'Ubicación',
    },
  },

  // Plantilla de Contactos de Emergencia
  EMERGENCY_CONTACTS: {
    name: 'Contactos de Emergencia',
    fields: {
      contact_name: 'Nombre del Contacto',
      role: 'Rol',
      phone: 'Teléfono',
      email: 'Email',
      availability: 'Disponibilidad',
      escalation_level: 'Nivel de Escalación',
    },
  },

  // Plantilla de Change Log
  CHANGE_LOG: {
    name: 'Registro de Cambios',
    fields: {
      date: 'Fecha',
      change_description: 'Descripción del Cambio',
      changed_by: 'Realizado por',
      impact: 'Impacto (Alto/Medio/Bajo)',
      approval_status: 'Estado de Aprobación',
      rollback_plan: 'Plan de Reversión',
    },
  },
};

// Interfaz para documento de IT Glue
export interface ITGlueDocument {
  id: string;
  templateId: string;
  clientId: string;
  data: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  version: number;
}

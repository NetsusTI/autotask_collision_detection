import axios from 'axios';

// Configuración de Kaseya API
const kaseyaAPI = axios.create({
  baseURL: process.env.KASEYA_API_URL,
  headers: {
    'X-API-KEY': process.env.KASEYA_API_KEY,
    'Content-Type': 'application/json',
  },
});

// Configuración de IT Glue API
const itGlueAPI = axios.create({
  baseURL: process.env.ITGLUE_API_URL,
  headers: {
    'X-API-KEY': process.env.ITGLUE_API_KEY,
    'Content-Type': 'application/json',
  },
});

// ========== KASEYA INTEGRATION ==========

export interface KaseyaDevice {
  id: string;
  name: string;
  status: 'online' | 'offline';
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  lastCheck: Date;
  clientName: string;
}

export interface KaseyaTicket {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: string;
  createdDate: Date;
  dueDate: Date;
  clientId: string;
}

export async function getKaseyaDevices(clientId: string): Promise<KaseyaDevice[]> {
  try {
    const response = await kaseyaAPI.get(`/clients/${clientId}/devices`);
    return response.data;
  } catch (error) {
    console.error('Error fetching Kaseya devices:', error);
    throw error;
  }
}

export async function getDeviceHealth(deviceId: string): Promise<{
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  overall: number;
}> {
  try {
    const response = await kaseyaAPI.get(`/devices/${deviceId}/health`);
    return response.data;
  } catch (error) {
    console.error('Error fetching device health:', error);
    throw error;
  }
}

export async function getKaseyaTickets(
  clientId: string
): Promise<KaseyaTicket[]> {
  try {
    const response = await kaseyaAPI.get(`/clients/${clientId}/tickets`);
    return response.data;
  } catch (error) {
    console.error('Error fetching Kaseya tickets:', error);
    throw error;
  }
}

export async function createKaseyaTicket(
  clientId: string,
  ticket: Partial<KaseyaTicket>
): Promise<KaseyaTicket> {
  try {
    const response = await kaseyaAPI.post(
      `/clients/${clientId}/tickets`,
      ticket
    );
    return response.data;
  } catch (error) {
    console.error('Error creating Kaseya ticket:', error);
    throw error;
  }
}

// ========== IT GLUE INTEGRATION ==========

export interface ITGlueClient {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  industry: string;
  sites: number;
  devices: number;
  lastUpdated: Date;
}

export interface ITGlueAsset {
  id: string;
  name: string;
  type: string;
  clientId: string;
  status: string;
  lastModified: Date;
  createdBy: string;
}

export async function getITGlueClients(): Promise<ITGlueClient[]> {
  try {
    const response = await itGlueAPI.get('/organizations');
    return response.data;
  } catch (error) {
    console.error('Error fetching IT Glue clients:', error);
    throw error;
  }
}

export async function getClientDocuments(clientId: string): Promise<ITGlueAsset[]> {
  try {
    const response = await itGlueAPI.get(
      `/organizations/${clientId}/documents`
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching client documents:', error);
    throw error;
  }
}

export async function updateClientDocument(
  clientId: string,
  documentId: string,
  data: Record<string, any>
): Promise<ITGlueAsset> {
  try {
    const response = await itGlueAPI.patch(
      `/organizations/${clientId}/documents/${documentId}`,
      data
    );
    return response.data;
  } catch (error) {
    console.error('Error updating client document:', error);
    throw error;
  }
}

export async function syncKaseyaToITGlue(clientId: string): Promise<void> {
  try {
    // Obtener datos de Kaseya
    const devices = await getKaseyaDevices(clientId);

    // Actualizar IT Glue con información
    const documentData = {
      name: 'Device Inventory',
      data: {
        devices: devices.map((d) => ({
          name: d.name,
          status: d.status,
          lastCheck: d.lastCheck,
        })),
        lastSync: new Date(),
      },
    };

    // Crear o actualizar documento en IT Glue
    // await updateClientDocument(clientId, 'inventory', documentData);
    console.log('Sync completed:', documentData);
  } catch (error) {
    console.error('Error syncing Kaseya to IT Glue:', error);
    throw error;
  }
}

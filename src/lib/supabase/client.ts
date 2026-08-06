// Cliente de Supabase — solo server-side, con la service_role key (se salta RLS
// a propósito; las tablas tienen RLS activado sin políticas para bloquear cualquier
// acceso vía anon key). Nunca importar este archivo desde código que corra en el browser.
import { createClient } from '@supabase/supabase-js';

// createClient revienta de forma síncrona si la URL viene vacía (a diferencia de
// Redis.fromEnv(), que solo loguea una advertencia) — eso tumbaría el build entero
// de Next.js si algún entorno (preview, build sin secrets) no tiene las env vars.
// Con un fallback, el módulo carga igual y solo las llamadas de red fallan en runtime.
// La página "Data API" del dashboard muestra la URL con `/rest/v1/` al final, pero
// createClient agrega ese prefijo por su cuenta — pegarla tal cual deja las consultas
// apuntando a /rest/v1/rest/v1/{tabla}, que PostgREST rechaza con PGRST125.
function normalizeSupabaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
}

export const supabase = createClient(
  normalizeSupabaseUrl(process.env.SUPABASE_URL || 'https://placeholder.supabase.co'),
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder',
  { auth: { persistSession: false } },
);

export interface ResourceRow {
  id: string;
  autotask_resource_id: number | null;
  name: string;
  email: string | null;
  role: string | null;
  active: boolean;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  resource_name: string;
  resource_id: string | null;
  type: string;
  title: string;
  body: string;
  ticket_id: string | null;
  ticket_number: string | null;
  ticket_url: string | null;
  read: boolean;
  created_at: string;
}

export interface CollisionHistoryRow {
  id: string;
  ticket_id: string;
  ticket_number: string | null;
  ticket_url: string | null;
  users: string[];
  duration_ms: number | null;
  created_at: string;
}

export interface CollisionParticipantRow {
  collision_id: string;
  resource_id: string;
}

export type FeedbackType = 'mejorar' | 'agregar' | 'quitar' | 'otro';

export interface FeedbackRow {
  id: string;
  resource_name: string;
  resource_id: string | null;
  type: FeedbackType;
  message: string;
  created_at: string;
}

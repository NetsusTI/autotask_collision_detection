-- collision_history: una fila por colisión detectada (ver app/api/presence/[id]/route.ts,
-- POST inserta con duration_ms null, DELETE la completa al resolverse). Leída por
-- GET /api/presence/history para el tab "Historial" del panel admin.
--
-- collision_participants: una colisión puede tener varios técnicos a la vez (la columna
-- `users` guarda los nombres tal como se vieron en el momento), así que la relación con
-- resources es muchos-a-muchos → tabla puente. Solo se registra ahí a los participantes
-- que resuelven a un técnico conocido; `users` no depende de eso y siempre queda completo.

CREATE TABLE IF NOT EXISTS collision_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      text NOT NULL,
  ticket_number  text,
  ticket_url     text,
  users          jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms    int4,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Por si la tabla ya existía desde antes sin este default (dashboard).
ALTER TABLE collision_history ALTER COLUMN created_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_collision_history_ticket_id  ON collision_history (ticket_id);
CREATE INDEX IF NOT EXISTS idx_collision_history_created_at ON collision_history (created_at DESC);

ALTER TABLE collision_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS collision_participants (
  collision_id uuid NOT NULL REFERENCES collision_history(id) ON DELETE CASCADE,
  resource_id  uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  PRIMARY KEY (collision_id, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_collision_participants_resource_id ON collision_participants (resource_id);

ALTER TABLE collision_participants ENABLE ROW LEVEL SECURITY;

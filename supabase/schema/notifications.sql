-- notifications: copia durable del feed central (n1–n5, ping, colisión, liberación).
-- Una fila por técnico destinatario (ver logCentralNotification en src/lib/notif-poll.ts).
-- Leída por GET /api/notifications/log, que reagrupa filas del mismo evento en un solo
-- item con targets[] para el tab "Centro de Notificaciones" del panel admin.

CREATE TABLE IF NOT EXISTS notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_name  text NOT NULL,
  resource_id    uuid REFERENCES resources(id),
  type           text NOT NULL,
  title          text NOT NULL,
  body           text NOT NULL,
  ticket_id      text,
  ticket_number  text,
  ticket_url     text,
  read           boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Por si la tabla ya existía desde antes sin estas columnas/default (dashboard).
ALTER TABLE notifications ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES resources(id);

CREATE INDEX IF NOT EXISTS idx_notifications_resource_name ON notifications (resource_name);
CREATE INDEX IF NOT EXISTS idx_notifications_resource_id    ON notifications (resource_id);
CREATE INDEX IF NOT EXISTS idx_notifications_ticket_id      ON notifications (ticket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at     ON notifications (created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

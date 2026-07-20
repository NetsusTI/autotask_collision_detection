-- feedback: comentarios de técnicos (mejorar / agregar / quitar / otro), enviados desde
-- el side panel de la extensión. Ver POST/GET /api/feedback. A diferencia de
-- notifications/collision_history, no tiene respaldo en Redis — si resource_id no
-- resuelve a un técnico conocido y activo, el endpoint rechaza el envío (403) en vez
-- de guardarlo, para que nadie externo quede registrado con un nombre inventado.

CREATE TABLE IF NOT EXISTS feedback (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_name  text NOT NULL,
  resource_id    uuid REFERENCES resources(id),
  type           text NOT NULL CHECK (type IN ('mejorar', 'agregar', 'quitar', 'otro')),
  message        text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES resources(id);

CREATE INDEX IF NOT EXISTS idx_feedback_resource_id ON feedback (resource_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at  ON feedback (created_at DESC);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

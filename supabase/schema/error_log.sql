-- error_log: rastro de errores que hoy se tragan en silencio a propósito (fire-
-- and-forget en webhooks/notas/correo — un fallo ahí nunca debe tumbar la
-- respuesta real al usuario). Sin esta tabla, un fallo persistente (ej. el
-- client secret de Graph vencido) no se nota hasta que alguien reporta "no me
-- llegó el correo" — con esto queda visible en el panel admin.
-- Ver src/lib/error-log.ts (logError, fire-and-forget, nunca lanza).

CREATE TABLE IF NOT EXISTS error_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source     text NOT NULL,   -- ej. 'graph-mail', 'presence:collision-insert'
  message    text NOT NULL,
  detail     text,            -- stack/mensaje crudo, truncado
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_log_created_at ON error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_source      ON error_log (source);

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

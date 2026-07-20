-- resources: roster de técnicos. Se sincroniza desde Autotask (ver
-- src/lib/resources.ts → syncResourcesFromAutotask, expuesto en
-- POST /api/resources/sync). Es la tabla contra la que se valida que un nombre
-- que llega desde la extensión corresponda a un técnico real y activo.

CREATE TABLE IF NOT EXISTS resources (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autotask_resource_id  int4 UNIQUE,
  name                  text NOT NULL,
  email                 text,
  role                  text,
  active                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Por si la tabla ya existía desde antes sin estos defaults/constraint (dashboard).
ALTER TABLE resources ALTER COLUMN created_at SET DEFAULT now();
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resources_autotask_resource_id_key'
  ) THEN
    ALTER TABLE resources ADD CONSTRAINT resources_autotask_resource_id_key UNIQUE (autotask_resource_id);
  END IF;
END $$;

-- Resolver "nombre escrito/detectado" → resources.id rápido y sin problemas de mayúsculas.
CREATE INDEX IF NOT EXISTS idx_resources_name_lower ON resources (lower(name));

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

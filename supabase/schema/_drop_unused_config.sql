-- La tabla `config` no la usa ningún código (el config real del poller n1–n5 y del
-- webhook de Teams vive en Redis, en claves config:*). Corre esto en el SQL Editor de
-- Supabase solo si confirmas que no la necesitas para nada más.

DROP TABLE IF EXISTS config;

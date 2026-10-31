-- Pulido: búsqueda sin acentos y rápida, y bloqueo de intentos de login.

create extension if not exists pg_trgm;

-- Minúsculas y sin acentos, para buscar "pañuelo" escribiendo "panuelo".
create or replace function normalizar(t text) returns text
language sql immutable parallel safe
as $$ select lower(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) $$;

create index productos_busqueda_nombre on productos using gin (normalizar(nombre) gin_trgm_ops);
create index productos_busqueda_codigo on productos using gin (normalizar(codigo) gin_trgm_ops);

-- Intentos fallidos de ingreso (para frenar a quien prueba contraseñas).
create table intentos_login (
  id bigserial primary key,
  usuario text not null,
  creado timestamptz not null default now()
);
create index intentos_login_usuario on intentos_login (usuario, creado desc);

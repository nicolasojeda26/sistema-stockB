-- Claves internas que el sistema genera solo la primera vez que las necesita
-- (cuando no se configuraron SESSION_SECRET / CLAVE_CIFRADO en el hosting).
create table secretos (
  nombre text primary key,
  valor text not null check (length(valor) >= 32),
  creado timestamptz not null default now()
);

-- En Supabase: que nadie las pueda leer por la API pública.
alter table secretos enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on secretos from anon, authenticated';
  end if;
end $$;

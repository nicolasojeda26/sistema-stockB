-- Canal interno para pedir ayuda, informes específicos o mejoras.
create table solicitudes (
  id serial primary key,
  usuario_id int not null references usuarios(id) on delete restrict,
  sucursal_id int references sucursales(id) on delete set null,
  tipo text not null check (tipo in ('ayuda', 'informe', 'mejora')),
  asunto text not null check (length(asunto) between 3 and 120),
  detalle text not null check (length(detalle) between 5 and 2000),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'resuelta')),
  respuesta text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index solicitudes_estado_fecha on solicitudes (estado, creado desc);
create index solicitudes_usuario_fecha on solicitudes (usuario_id, creado desc);
alter table solicitudes enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on solicitudes from anon, authenticated;
    revoke all on solicitudes_id_seq from anon, authenticated;
  end if;
end $$;

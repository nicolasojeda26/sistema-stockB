-- Servicio técnico: equipos que entran a reparar, su estado y el cobro al retirarlos.
create table reparaciones (
  id serial primary key,
  sucursal_id int not null references sucursales(id),
  cliente_nombre text not null check (length(cliente_nombre) between 1 and 120),
  cliente_telefono text check (length(cliente_telefono) <= 40),
  equipo text not null check (length(equipo) between 1 and 120),
  imei text check (length(imei) <= 40),
  falla text not null check (length(falla) between 1 and 1000),
  -- Cómo se recibió: rayas, con funda, sin chip, etc.
  estado_equipo text check (length(estado_equipo) <= 1000),
  presupuesto numeric(14, 2) check (presupuesto >= 0),
  -- Lo que se cobra al retirarlo (lo pone el técnico al terminar).
  precio numeric(14, 2) check (precio >= 0),
  diagnostico text check (length(diagnostico) <= 1000),
  prometido date,
  estado text not null default 'ingresado'
    check (estado in ('ingresado', 'en_reparacion', 'listo', 'sin_reparacion', 'entregado', 'cancelado')),
  recibido_por int references usuarios(id) on delete set null,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  listo_en timestamptz,
  entregado_en timestamptz,
  entregado_por int references usuarios(id) on delete set null,
  venta_id int references ventas(id) on delete set null
);
create index reparaciones_sucursal_estado on reparaciones (sucursal_id, estado, creado desc);
create index reparaciones_creado on reparaciones (creado desc);
create index reparaciones_venta on reparaciones (venta_id);

create table reparacion_eventos (
  id bigserial primary key,
  reparacion_id int not null references reparaciones(id) on delete cascade,
  estado text not null,
  nota text,
  usuario_id int references usuarios(id) on delete set null,
  creado timestamptz not null default now()
);
create index reparacion_eventos_rep on reparacion_eventos (reparacion_id, creado);

insert into ajustes (clave, valor) values (
  'condiciones_reparacion',
  'El presupuesto puede cambiar al revisar el equipo; se consulta antes de reparar. Pasados 90 días de avisado que está listo, el equipo se considera abandonado. MegaCel+ no se hace responsable por la información guardada en el equipo.'
) on conflict (clave) do nothing;

-- Quien vende en los locales también recibe equipos.
update roles set permisos = array_append(permisos, 'reparaciones')
where sistema and base = 'vendedora' and not ('reparaciones' = any(permisos));

alter table reparaciones enable row level security;
alter table reparacion_eventos enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on reparaciones, reparacion_eventos from anon, authenticated;
    revoke all on reparaciones_id_seq, reparacion_eventos_id_seq from anon, authenticated;
  end if;
end $$;

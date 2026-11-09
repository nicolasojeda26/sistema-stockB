-- Pedidos de las sucursales al depósito y envíos con confirmación de lo que llega.

-- Depósito interno "En camino": lo enviado queda acá hasta que la sucursal lo cuenta y confirma.
alter table depositos add column es_transito boolean not null default false;
create unique index depositos_transito_unico on depositos (es_transito) where es_transito;
insert into depositos (nombre, sucursal_id, es_principal, es_transito) values ('En camino', null, false, true);

create table pedidos (
  id serial primary key,
  sucursal_id int not null references sucursales(id) on delete restrict,
  -- Depósito de la sucursal donde tiene que llegar.
  deposito_id int not null references depositos(id) on delete restrict,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'parcial', 'enviado', 'cancelado')),
  nota text,
  usuario_id int references usuarios(id) on delete set null,
  creado timestamptz not null default now(),
  cerrado_en timestamptz
);
create index pedidos_estado on pedidos (estado, creado);

create table pedido_items (
  id serial primary key,
  pedido_id int not null references pedidos(id) on delete cascade,
  producto_id int not null references productos(id) on delete restrict,
  cantidad int not null check (cantidad > 0),
  enviada int not null default 0 check (enviada >= 0),
  unique (pedido_id, producto_id)
);

create table envios (
  id serial primary key,
  origen_id int not null references depositos(id) on delete restrict,
  destino_id int not null references depositos(id) on delete restrict,
  pedido_id int references pedidos(id) on delete set null,
  estado text not null default 'en_camino' check (estado in ('en_camino', 'recibido', 'con_diferencias', 'cancelado')),
  nota text,
  enviado_por int references usuarios(id) on delete set null,
  creado timestamptz not null default now(),
  recibido_por int references usuarios(id) on delete set null,
  recibido_en timestamptz,
  nota_recepcion text,
  -- Diferencias (faltantes o sobrantes): la administración decide qué pasó.
  resuelto_en timestamptz,
  resuelto_por int references usuarios(id) on delete set null,
  resolucion text,
  check (origen_id <> destino_id)
);
create index envios_estado on envios (estado, creado);
create index envios_destino on envios (destino_id, estado);

create table envio_items (
  id serial primary key,
  envio_id int not null references envios(id) on delete cascade,
  producto_id int not null references productos(id) on delete restrict,
  enviada int not null check (enviada > 0),
  recibida int check (recibida >= 0),
  unique (envio_id, producto_id)
);

do $$
declare t text;
begin
  foreach t in array array['pedidos', 'pedido_items', 'envios', 'envio_items'] loop
    execute format('alter table %I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on %I from anon, authenticated', t);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all sequences in schema public from anon, authenticated;
  end if;
end $$;

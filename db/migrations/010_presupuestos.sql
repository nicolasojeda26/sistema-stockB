-- Presupuestos comerciales: cotizan sin tocar caja ni stock.
create table presupuestos (
  id serial primary key,
  sucursal_id int not null references sucursales(id) on delete restrict,
  usuario_id int not null references usuarios(id) on delete restrict,
  cliente_id int references clientes(id) on delete set null,
  creado timestamptz not null default now(),
  valido_hasta date,
  estado text not null default 'abierto' check (estado in ('abierto', 'aceptado', 'rechazado', 'cancelado')),
  descuento_global numeric(5, 2) not null default 0 check (descuento_global between 0 and 100),
  total numeric(14, 2) not null check (total >= 0),
  nota text
);
create index presupuestos_sucursal_fecha on presupuestos (sucursal_id, creado desc);
create index presupuestos_cliente on presupuestos (cliente_id, creado desc) where cliente_id is not null;

create table presupuesto_items (
  id serial primary key,
  presupuesto_id int not null references presupuestos(id) on delete cascade,
  producto_id int references productos(id) on delete set null,
  codigo text not null,
  nombre text not null,
  cantidad int not null check (cantidad > 0),
  precio numeric(14, 2) not null check (precio >= 0),
  descuento_pct numeric(5, 2) not null default 0 check (descuento_pct between 0 and 100)
);
create index presupuesto_items_presupuesto on presupuesto_items (presupuesto_id, id);

alter table presupuestos enable row level security;
alter table presupuesto_items enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on presupuestos, presupuesto_items from anon, authenticated;
    revoke all on presupuestos_id_seq, presupuesto_items_id_seq from anon, authenticated;
  end if;
end $$;

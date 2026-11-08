-- Etapa 8: proveedores, compras con factura, cuenta corriente con proveedores y gastos.

create table proveedores (
  id serial primary key,
  nombre text not null,
  cuit text,
  condicion_iva smallint,
  telefono text,
  email text,
  contacto text,
  notas text,
  activo boolean not null default true,
  creado timestamptz not null default now()
);
create unique index proveedores_nombre on proveedores (lower(nombre));
create unique index proveedores_cuit on proveedores (cuit) where cuit is not null;

-- Factura (o remito) de compra: ingresa la mercadería y suma a la cuenta del proveedor.
create table compras (
  id serial primary key,
  proveedor_id int not null references proveedores(id) on delete restrict,
  deposito_id int not null references depositos(id) on delete restrict,
  fecha date not null,
  tipo_comprobante text not null check (tipo_comprobante in ('A', 'B', 'C', 'X')),
  numero text,
  neto numeric(14, 2) not null,
  iva numeric(14, 2) not null default 0,
  percepciones numeric(14, 2) not null default 0,
  total numeric(14, 2) not null check (total >= 0),
  operacion_id bigint references operaciones_stock(id) on delete set null,
  actualizo_costos boolean not null default false,
  nota text,
  estado text not null default 'registrada' check (estado in ('registrada', 'anulada')),
  anulada_en timestamptz,
  anulada_por int references usuarios(id) on delete set null,
  usuario_id int references usuarios(id) on delete set null,
  creado timestamptz not null default now()
);
create unique index compras_comprobante on compras (proveedor_id, tipo_comprobante, numero) where numero is not null and estado = 'registrada';
create index compras_fecha on compras (fecha desc);

create table compra_items (
  id serial primary key,
  compra_id int not null references compras(id) on delete cascade,
  producto_id int not null references productos(id) on delete restrict,
  cantidad int not null check (cantidad > 0),
  costo numeric(14, 2) not null check (costo >= 0)
);
create index compra_items_compra on compra_items (compra_id);

-- Cuenta corriente con proveedores: positivo = le debemos; negativo = saldo a nuestro favor.
create table proveedor_movimientos (
  id bigserial primary key,
  proveedor_id int not null references proveedores(id) on delete restrict,
  creado timestamptz not null default now(),
  fecha date not null default current_date,
  tipo text not null check (tipo in ('compra', 'pago', 'nota_credito', 'ajuste', 'anulacion')),
  monto numeric(14, 2) not null check (monto <> 0),
  compra_id int references compras(id) on delete set null,
  medio text check (medio in ('efectivo', 'transferencia', 'cheque', 'debito', 'credito')),
  -- Si se pagó con efectivo de una caja, el retiro queda vinculado.
  movimiento_caja_id int references movimientos_caja(id) on delete set null,
  nota text,
  usuario_id int references usuarios(id) on delete set null
);
create index proveedor_movimientos_proveedor on proveedor_movimientos (proveedor_id, creado desc);

create table gastos (
  id serial primary key,
  sucursal_id int references sucursales(id) on delete restrict,
  fecha date not null default current_date,
  categoria text not null,
  descripcion text,
  monto numeric(14, 2) not null check (monto > 0),
  medio text not null check (medio in ('efectivo', 'transferencia', 'debito', 'credito', 'cheque')),
  movimiento_caja_id int references movimientos_caja(id) on delete set null,
  proveedor_id int references proveedores(id) on delete set null,
  anulado boolean not null default false,
  usuario_id int references usuarios(id) on delete set null,
  creado timestamptz not null default now()
);
create index gastos_fecha on gastos (fecha desc);

insert into ajustes (clave, valor) values
  ('categorias_gasto', 'Alquiler, Sueldos, Servicios (luz/agua/internet), Impuestos, Limpieza, Bolsas y packaging, Publicidad, Comisiones de tarjeta, Mantenimiento, Otros')
on conflict (clave) do nothing;

do $$
declare t text;
begin
  foreach t in array array['proveedores', 'compras', 'compra_items', 'proveedor_movimientos', 'gastos'] loop
    execute format('alter table %I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on %I from anon, authenticated', t);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all sequences in schema public from anon, authenticated;
  end if;
end $$;

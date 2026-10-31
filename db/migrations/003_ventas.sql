-- Etapa 3: caja diaria y ventas.

-- Datos del negocio para tickets y, más adelante, facturas.
create table ajustes (
  clave text primary key,
  valor text not null
);
insert into ajustes (clave, valor) values
  ('nombre_negocio', 'Mi negocio'),
  ('pie_ticket', '¡Gracias por tu compra! Cambios dentro de los 30 días con este ticket.'),
  ('ancho_ticket', '80');

-- Tope de descuento que puede hacer cada usuario (%). Las administradoras no tienen tope.
alter table usuarios add column descuento_max numeric(5, 2) not null default 10 check (descuento_max between 0 and 100);

create table cajas (
  id serial primary key,
  sucursal_id int not null references sucursales(id) on delete restrict,
  usuario_id int not null references usuarios(id) on delete restrict,
  abierta timestamptz not null default now(),
  monto_inicial numeric(14, 2) not null default 0 check (monto_inicial >= 0),
  cerrada timestamptz,
  cerrada_por int references usuarios(id) on delete set null,
  -- Foto del cierre: lo que debía haber y lo que se contó.
  efectivo_esperado numeric(14, 2),
  efectivo_contado numeric(14, 2),
  nota_cierre text,
  check ((cerrada is null) = (efectivo_contado is null))
);
-- Cada usuario tiene a lo sumo una caja abierta.
create unique index cajas_una_abierta on cajas (usuario_id) where cerrada is null;
create index cajas_sucursal on cajas (sucursal_id, abierta desc);

-- Plata que entra o sale de la caja sin ser venta (cambio, pago a un proveedor, retiro).
create table movimientos_caja (
  id serial primary key,
  caja_id int not null references cajas(id) on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'retiro')),
  monto numeric(14, 2) not null check (monto > 0),
  motivo text not null,
  usuario_id int references usuarios(id) on delete set null,
  creado timestamptz not null default now()
);

create table ventas (
  id serial primary key,
  sucursal_id int not null references sucursales(id) on delete restrict,
  deposito_id int not null references depositos(id) on delete restrict,
  caja_id int not null references cajas(id) on delete restrict,
  usuario_id int references usuarios(id) on delete set null,
  creado timestamptz not null default now(),
  subtotal numeric(14, 2) not null,
  descuento numeric(14, 2) not null default 0,
  total numeric(14, 2) not null check (total >= 0),
  descuento_global_pct numeric(5, 2) not null default 0,
  efectivo_recibido numeric(14, 2),
  vuelto numeric(14, 2) not null default 0,
  estado text not null default 'completada' check (estado in ('completada', 'anulada')),
  anulada_en timestamptz,
  anulada_por int references usuarios(id) on delete set null,
  motivo_anulacion text,
  check ((estado = 'anulada') = (anulada_en is not null))
);
create index ventas_creado on ventas (creado desc);
create index ventas_caja on ventas (caja_id);
create index ventas_sucursal on ventas (sucursal_id, creado desc);

create table venta_items (
  id serial primary key,
  venta_id int not null references ventas(id) on delete cascade,
  producto_id int references productos(id) on delete set null,
  -- Copia de los datos al momento de la venta (el producto puede cambiar después).
  codigo text not null,
  nombre text not null,
  cantidad int not null check (cantidad > 0),
  precio_unitario numeric(14, 2) not null,
  descuento_pct numeric(5, 2) not null default 0 check (descuento_pct between 0 and 100),
  subtotal numeric(14, 2) not null
);
create index venta_items_venta on venta_items (venta_id);
create index venta_items_producto on venta_items (producto_id);

create table venta_pagos (
  id serial primary key,
  venta_id int not null references ventas(id) on delete cascade,
  medio text not null check (medio in ('efectivo', 'transferencia', 'debito', 'credito')),
  monto numeric(14, 2) not null check (monto > 0),
  cuotas int check (cuotas is null or cuotas between 1 and 24),
  referencia text
);
create index venta_pagos_venta on venta_pagos (venta_id);

alter table movimientos_stock add column venta_id int references ventas(id) on delete set null;

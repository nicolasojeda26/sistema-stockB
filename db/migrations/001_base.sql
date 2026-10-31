-- Etapa 1: sucursales, depósitos, usuarios, categorías, productos y stock.

create table sucursales (
  id serial primary key,
  nombre text not null unique,
  direccion text,
  activa boolean not null default true,
  creado timestamptz not null default now()
);

-- Un depósito puede pertenecer a una sucursal (el salón, la trastienda)
-- o ser independiente (depósito central).
create table depositos (
  id serial primary key,
  nombre text not null,
  sucursal_id int references sucursales(id) on delete restrict,
  -- El depósito del que descuenta las ventas de la sucursal.
  es_principal boolean not null default false,
  activo boolean not null default true,
  creado timestamptz not null default now(),
  unique (sucursal_id, nombre)
);
create unique index depositos_principal_unico on depositos (sucursal_id) where es_principal;
create unique index depositos_central_nombre on depositos (nombre) where sucursal_id is null;

create table usuarios (
  id serial primary key,
  usuario text not null unique check (usuario = lower(usuario) and usuario ~ '^[a-z0-9._-]{3,30}$'),
  nombre text not null,
  password_hash text not null,
  rol text not null check (rol in ('admin', 'vendedora')),
  -- Las vendedoras trabajan en una sucursal; la administradora ve todas.
  sucursal_id int references sucursales(id) on delete restrict,
  activo boolean not null default true,
  -- Se incrementa al cambiar la contraseña o desactivar: invalida sesiones abiertas.
  version_sesion int not null default 1,
  creado timestamptz not null default now(),
  check (rol = 'admin' or sucursal_id is not null)
);

create table categorias (
  id serial primary key,
  nombre text not null,
  activa boolean not null default true,
  creado timestamptz not null default now()
);
create unique index categorias_nombre on categorias (lower(nombre));

create table productos (
  id serial primary key,
  codigo text not null check (length(trim(codigo)) > 0),
  nombre text not null check (length(trim(nombre)) > 0),
  categoria_id int references categorias(id) on delete set null,
  costo numeric(14, 2) not null default 0 check (costo >= 0),
  precio numeric(14, 2) not null default 0 check (precio >= 0),
  stock_minimo int not null default 0 check (stock_minimo >= 0),
  activo boolean not null default true,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create unique index productos_codigo on productos (lower(codigo));
create index productos_nombre on productos (lower(nombre) text_pattern_ops);

create table stock (
  producto_id int not null references productos(id) on delete cascade,
  deposito_id int not null references depositos(id) on delete restrict,
  cantidad int not null default 0,
  primary key (producto_id, deposito_id)
);

-- Todo cambio de stock queda registrado.
create table movimientos_stock (
  id bigserial primary key,
  producto_id int not null references productos(id) on delete cascade,
  deposito_id int not null references depositos(id) on delete restrict,
  cantidad int not null check (cantidad <> 0),
  tipo text not null check (tipo in ('carga_inicial', 'ingreso', 'venta', 'transferencia', 'ajuste', 'devolucion')),
  motivo text,
  usuario_id int references usuarios(id) on delete set null,
  creado timestamptz not null default now()
);
create index movimientos_producto on movimientos_stock (producto_id, creado desc);

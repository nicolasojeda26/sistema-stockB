-- Etapa 2: ingresos, transferencias y ajustes agrupados en operaciones,
-- historial de precios y códigos internos para productos sin código de barras.

create table operaciones_stock (
  id bigserial primary key,
  tipo text not null check (tipo in ('ingreso', 'transferencia', 'ajuste')),
  -- Ingreso y ajuste usan solo destino; la transferencia, origen y destino.
  deposito_origen_id int references depositos(id) on delete restrict,
  deposito_destino_id int not null references depositos(id) on delete restrict,
  motivo text,
  nota text,
  usuario_id int references usuarios(id) on delete set null,
  creado timestamptz not null default now(),
  check ((tipo = 'transferencia') = (deposito_origen_id is not null)),
  check (deposito_origen_id is distinct from deposito_destino_id)
);
create index operaciones_creado on operaciones_stock (creado desc);

alter table movimientos_stock add column operacion_id bigint references operaciones_stock(id) on delete cascade;
create index movimientos_operacion on movimientos_stock (operacion_id);
create index movimientos_deposito on movimientos_stock (deposito_id, creado desc);

-- Historial de precios: lo llena un trigger, venga el cambio de donde venga.
create table cambios_precio (
  id bigserial primary key,
  producto_id int not null references productos(id) on delete cascade,
  precio_anterior numeric(14, 2) not null,
  precio_nuevo numeric(14, 2) not null,
  costo_anterior numeric(14, 2) not null,
  costo_nuevo numeric(14, 2) not null,
  origen text,
  usuario_id int references usuarios(id) on delete set null,
  creado timestamptz not null default now()
);
create index cambios_precio_producto on cambios_precio (producto_id, creado desc);

create function registrar_cambio_precio() returns trigger language plpgsql as $$
begin
  if new.precio is distinct from old.precio or new.costo is distinct from old.costo then
    insert into cambios_precio (producto_id, precio_anterior, precio_nuevo, costo_anterior, costo_nuevo, origen, usuario_id)
    values (new.id, old.precio, new.precio, old.costo, new.costo,
            nullif(current_setting('app.origen', true), ''),
            nullif(current_setting('app.usuario_id', true), '')::int);
  end if;
  return new;
end $$;

create trigger productos_cambio_precio after update of precio, costo on productos
  for each row execute function registrar_cambio_precio();

-- Códigos internos EAN-13 del rango de uso interno (empiezan con 2).
create sequence codigo_interno_seq start 1;

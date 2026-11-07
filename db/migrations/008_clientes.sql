-- Clientas con cuenta corriente, cambios de prenda y apartados con seña.

-- Fichas de clientas: el documento pasa a ser opcional (muchas solo dejan nombre y teléfono).
alter table clientes
  alter column doc_nro drop not null,
  alter column doc_tipo set default 99,
  alter column condicion_iva set default 5,
  add column telefono text,
  add column email text,
  add column notas text,
  add column limite_credito numeric(14, 2) not null default 0 check (limite_credito >= 0),
  add column activo boolean not null default true;
create index clientes_nombre on clientes using gin (normalizar(nombre) gin_trgm_ops);
create index clientes_telefono on clientes (telefono);

-- Cuenta corriente: positivo = la clienta debe; negativo = tiene saldo a favor.
create table cuenta_movimientos (
  id bigserial primary key,
  cliente_id int not null references clientes(id) on delete restrict,
  creado timestamptz not null default now(),
  tipo text not null check (tipo in ('venta', 'pago', 'devolucion', 'cambio', 'ajuste')),
  monto numeric(14, 2) not null check (monto <> 0),
  venta_id int references ventas(id) on delete set null,
  devolucion_id int references devoluciones(id) on delete set null,
  caja_id int references cajas(id) on delete set null,
  medio text check (medio in ('efectivo', 'transferencia', 'debito', 'credito')),
  nota text,
  usuario_id int references usuarios(id) on delete set null
);
create index cuenta_movimientos_cliente on cuenta_movimientos (cliente_id, creado desc);
create index cuenta_movimientos_caja on cuenta_movimientos (caja_id) where caja_id is not null;

alter table ventas
  add column cliente_id int references clientes(id) on delete set null,
  -- Apartado con seña: la prenda queda separada hasta que la retiran.
  add column para_retirar boolean not null default false,
  add column retirada_en timestamptz;
create index ventas_cliente on ventas (cliente_id, creado desc) where cliente_id is not null;
create index ventas_para_retirar on ventas (sucursal_id) where para_retirar;

alter table devoluciones add column cliente_id int references clientes(id) on delete set null;

-- Nuevos medios:
--  cuenta_corriente: se carga a la cuenta de la clienta (fiado, o usa su saldo a favor).
--  cambio: lo que se devolvió en un cambio de prenda paga la venta nueva (no mueve plata).
alter table venta_pagos drop constraint venta_pagos_medio_check;
alter table venta_pagos add constraint venta_pagos_medio_check
  check (medio in ('efectivo', 'transferencia', 'debito', 'credito', 'cuenta_corriente', 'cambio'));
alter table devoluciones drop constraint devoluciones_medio_check;
alter table devoluciones add constraint devoluciones_medio_check
  check (medio in ('efectivo', 'transferencia', 'debito', 'credito', 'cuenta_corriente', 'cambio'));

alter table cuenta_movimientos enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on cuenta_movimientos from anon, authenticated';
    execute 'revoke all on cuenta_movimientos_id_seq from anon, authenticated';
  end if;
end $$;

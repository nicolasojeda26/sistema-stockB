-- Etapa 4: factura electrónica (ARCA), notas de crédito y devoluciones.

-- Datos fiscales del negocio (una sola fila).
create table config_fiscal (
  id int primary key default 1 check (id = 1),
  cuit text,
  razon_social text,
  condicion_iva text check (condicion_iva in ('RI', 'MT', 'EX')),
  inicio_actividades date,
  domicilio text,
  iibb text,
  -- desactivada: no se factura · simulacion: comprobantes de prueba sin validez · homologacion/produccion: ARCA.
  modo text not null default 'desactivada' check (modo in ('desactivada', 'simulacion', 'homologacion', 'produccion')),
  clave_privada text, -- cifrada
  pedido_certificado text, -- CSR para subir a ARCA
  certificado text,
  certificado_vence timestamptz,
  facturar_automatico boolean not null default false,
  -- RG 5700/2025: desde este monto hay que identificar al consumidor final.
  identificar_desde numeric(14, 2) not null default 10000000
);
insert into config_fiscal (id) values (1);

alter table sucursales add column punto_venta int check (punto_venta between 1 and 99998);
create unique index sucursales_punto_venta on sucursales (punto_venta) where punto_venta is not null;

-- Token y firma del WSAA (valen ~12 h y ARCA no da otro mientras haya uno vigente).
create table arca_credenciales (
  ambiente text not null,
  servicio text not null,
  token text not null,
  sign text not null,
  vence timestamptz not null,
  primary key (ambiente, servicio)
);

create table clientes (
  id serial primary key,
  doc_tipo int not null,
  doc_nro text not null,
  nombre text not null,
  condicion_iva int not null,
  domicilio text,
  creado timestamptz not null default now(),
  unique (doc_tipo, doc_nro)
);

create table devoluciones (
  id serial primary key,
  venta_id int not null references ventas(id) on delete restrict,
  caja_id int not null references cajas(id) on delete restrict,
  deposito_id int not null references depositos(id) on delete restrict,
  usuario_id int references usuarios(id) on delete set null,
  creado timestamptz not null default now(),
  total numeric(14, 2) not null check (total > 0),
  medio text not null check (medio in ('efectivo', 'transferencia', 'debito', 'credito')),
  motivo text not null
);
create index devoluciones_venta on devoluciones (venta_id);
create index devoluciones_caja on devoluciones (caja_id);

create table devolucion_items (
  id serial primary key,
  devolucion_id int not null references devoluciones(id) on delete cascade,
  venta_item_id int not null references venta_items(id) on delete restrict,
  cantidad int not null check (cantidad > 0),
  subtotal numeric(14, 2) not null
);

create table comprobantes (
  id serial primary key,
  venta_id int not null references ventas(id) on delete restrict,
  devolucion_id int references devoluciones(id) on delete restrict,
  asociado_id int references comprobantes(id) on delete restrict,
  ambiente text not null check (ambiente in ('simulacion', 'homologacion', 'produccion')),
  cbte_tipo int not null,
  punto_venta int not null,
  numero int,
  fecha date not null,
  -- Emisor y receptor tal como salieron en el comprobante.
  emisor_cuit text not null,
  emisor_razon_social text not null,
  emisor_condicion text not null,
  doc_tipo int not null,
  doc_nro text not null,
  receptor_nombre text,
  receptor_condicion int not null,
  receptor_domicilio text,
  total numeric(14, 2) not null,
  neto numeric(14, 2) not null,
  iva numeric(14, 2) not null,
  alicuota numeric(5, 2),
  estado text not null check (estado in ('autorizado', 'rechazado')),
  cae text,
  cae_vence date,
  mensaje text,
  xml_pedido text,
  usuario_id int references usuarios(id) on delete set null,
  creado timestamptz not null default now(),
  check (estado <> 'autorizado' or (cae is not null and numero is not null))
);
create unique index comprobantes_numero on comprobantes (ambiente, punto_venta, cbte_tipo, numero) where estado = 'autorizado';
create index comprobantes_venta on comprobantes (venta_id);
create index comprobantes_fecha on comprobantes (fecha desc);

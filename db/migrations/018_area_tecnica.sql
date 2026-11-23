-- Área técnica completa, venta desde otra sucursal, descuentos por rol y permisos por persona.

-- ── Estados del taller (editables) ─────────────────────────────────────
-- Cada estado pertenece a una fase del sistema: en el local sin empezar, en reparación o listo.
create table reparacion_etapas (
  id serial primary key,
  nombre text not null check (length(nombre) between 1 and 80),
  fase text not null check (fase in ('ingresado', 'en_reparacion', 'listo')),
  orden int not null default 0,
  activa boolean not null default true,
  -- Las del sistema no se borran (el primer ingreso y el "listo para retirar").
  sistema boolean not null default false
);
create unique index reparacion_etapas_nombre on reparacion_etapas (lower(nombre));
insert into reparacion_etapas (nombre, fase, orden, sistema) values
  ('Ingreso a sucursal', 'ingresado', 10, true),
  ('Ingreso al taller', 'en_reparacion', 20, false),
  ('En revisión', 'en_reparacion', 30, false),
  ('En proceso de reparación', 'en_reparacion', 40, false),
  ('A prueba de repuesto', 'en_reparacion', 50, false),
  ('Falta confirmar nuevo presupuesto', 'en_reparacion', 60, false),
  ('Falta confirmar cliente sobre otra reparación conjunta', 'en_reparacion', 70, false),
  ('En sucursal listo para retirar', 'listo', 80, true);

-- ── Técnicos (solo nombres: no usan el sistema) ─────────────────────────
create table tecnicos (
  id serial primary key,
  nombre text not null check (length(nombre) between 1 and 80),
  activo boolean not null default true
);
create unique index tecnicos_nombre on tecnicos (lower(nombre));

-- ── Lista de precios de reparación ──────────────────────────────────────
create table reparacion_precios (
  id serial primary key,
  modelo text not null check (length(modelo) between 1 and 120),
  tipo text not null check (length(tipo) between 1 and 120),
  precio numeric(14, 2) not null check (precio >= 0),
  activo boolean not null default true,
  actualizado timestamptz not null default now()
);
create unique index reparacion_precios_modelo_tipo on reparacion_precios (lower(modelo), lower(tipo));

-- ── Reparaciones: datos nuevos ──────────────────────────────────────────
alter table reparaciones
  add column etapa_id int references reparacion_etapas(id),
  add column tecnico_id int references tecnicos(id) on delete set null,
  add column cliente_dni text check (length(cliente_dni) <= 20),
  add column tipo_reparacion text check (length(tipo_reparacion) <= 120),
  add column garantia_dias int check (garantia_dias between 0 and 3650),
  -- Reingreso por garantía de una reparación anterior.
  add column garantia_de int references reparaciones(id) on delete set null,
  -- Por qué no se reparó.
  add column motivo_cierre text check (motivo_cierre in ('sin_solucion', 'no_acepto', 'sin_repuesto', 'devolucion')),
  -- Enlace de seguimiento para el cliente (no se puede adivinar).
  add column token text;
update reparaciones set token = md5(random()::text || id::text || clock_timestamp()::text) where token is null;
alter table reparaciones alter column token set not null;
create unique index reparaciones_token on reparaciones (token);
create index reparaciones_garantia_de on reparaciones (garantia_de);
update reparaciones r set etapa_id = (
  select e.id from reparacion_etapas e
  where e.nombre = case r.estado when 'ingresado' then 'Ingreso a sucursal' when 'en_reparacion' then 'En proceso de reparación' else 'En sucursal listo para retirar' end)
where r.estado in ('ingresado', 'en_reparacion', 'listo');
update reparaciones set motivo_cierre = 'sin_solucion' where estado = 'sin_reparacion' and motivo_cierre is null;

alter table reparacion_eventos
  add column etapa_id int references reparacion_etapas(id) on delete set null,
  add column tecnico_id int references tecnicos(id) on delete set null;

-- ── Textos de los comprobantes y garantía por defecto ───────────────────
insert into ajustes (clave, valor) values
  ('garantia_dias', '30'),
  ('clausulas_ingreso',
'CLÁUSULA 1: El presupuesto puede cambiar al revisar el equipo; se consulta al cliente antes de reparar.
CLÁUSULA 2: El equipo que experimente daños causados por mal uso, uso negligente, instalación incorrecta o accidentes provocados por manipulación incorrecta no es causal de exigencia de la garantía.
CLÁUSULA 3: La empresa no se hace responsable por fallas ajenas no declaradas por el cliente al momento de entregar el equipo.
CLÁUSULA 4: El período de reparación podrá ser de hasta 30 días hábiles, debido a que el dispositivo será sometido a diversas pruebas para lograr su máxima operatividad.
CLÁUSULA 5: Pasados 90 días de avisado que el equipo está listo, se considera abandonado.
CLÁUSULA 6: MegaCel+ no se hace responsable por la información guardada en el equipo.'),
  ('clausulas_garantia',
'CLÁUSULA 1: El extravío, pérdida o destrucción de este documento emitido por la empresa (MEGA-CEL+), por parte del interesado, será causal de eximir del cumplimiento de la garantía de reparación del equipo o dispositivo electrónico.
CLÁUSULA 2: La garantía puede llegar a cubrir total o parcialmente el funcionamiento de los repuestos colocados (módulo, táctil, puertos de carga, parlantes, micrófono, alto parlante, puerto ficha de auricular, reemplazo de componentes, botones de power, volumen (+ -), lectoras de chip (SIM) o cualquier otro tipo de reparaciones) detalladas y descriptas en este documento.
CLÁUSULA 3: El equipo que experimente daños causados por mal uso, uso negligente, instalación incorrecta o accidentales provocados por manipulación incorrecta no es causal de exigencia de la garantía.
CLÁUSULA 4: La garantía no cubre fallas ajenas no declaradas con anterioridad por el cliente al momento de entrega del producto a la empresa.
CLÁUSULA 5: El período de reparación podrá ser de hasta 30 días hábiles debido a que el dispositivo será sometido a diversas pruebas para lograr su máxima operatividad.
CLÁUSULA 6: Si al momento de ejecutar la garantía los repuestos y/o elementos instalados sufren variación de los costos debido a la situación económica, se informará al usuario la diferencia a abonar, mientras que el servicio técnico y la mano de obra se mantendrán a cargo de la empresa.'),
  ('clausulas_entrega',
'CLÁUSULA 1: El presente comprobante hace constar que la empresa (MEGA-CEL+) hace entrega del equipo (celular, tablet o cualquier dispositivo electrónico) descripto en el comprobante de número de orden ingresado.
CLÁUSULA 2: Dejando en conocimiento del retiro en los siguientes casos: A) De no poder localizar la falla. B) De no poder conseguir repuestos en tiempo y forma.
CLÁUSULA 3: Una vez retirado el dispositivo por el titular, la empresa (MEGA-CEL+) no es responsable ante cualquier tipo de reclamo en general (directa o indirectamente).')
on conflict (clave) do nothing;

-- ── Venta de un producto de otra sucursal ───────────────────────────────
-- deposito_id: de dónde sale el stock (null = el de la sucursal que vende).
-- entrega: 'envio' (la otra sucursal lo manda) o 'retira' (el cliente lo busca allá).
alter table venta_items
  add column deposito_id int references depositos(id),
  add column entrega text check (entrega in ('envio', 'retira')),
  add column entrega_estado text check (entrega_estado in ('pendiente', 'enviado', 'entregado')),
  add column entrega_en timestamptz,
  add column entrega_por int references usuarios(id) on delete set null,
  add constraint venta_items_entrega check ((entrega is null) = (deposito_id is null) and (entrega is null) = (entrega_estado is null));
create index venta_items_entregas on venta_items (deposito_id, entrega_estado) where entrega is not null;

-- ── Descuentos: tope por rol, con excepción por persona ─────────────────
alter table roles
  add column descuento_max numeric(5, 2) not null default 10 check (descuento_max between 0 and 100),
  add column descuento_max_reparacion numeric(5, 2) not null default 10 check (descuento_max_reparacion between 0 and 100);
alter table usuarios alter column descuento_max drop not null;
alter table usuarios alter column descuento_max drop default;
-- Quien tenía el 10 % de siempre pasa a usar el del rol; los distintos quedan como excepción.
update usuarios set descuento_max = null where descuento_max = 10;

-- ── Permisos por persona, además de los del rol ─────────────────────────
alter table usuarios
  add column permisos_extra text[] not null default '{}',
  add column permisos_quitados text[] not null default '{}';

alter table reparacion_etapas enable row level security;
alter table tecnicos enable row level security;
alter table reparacion_precios enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on reparacion_etapas, tecnicos, reparacion_precios from anon, authenticated;
    revoke all on reparacion_etapas_id_seq, tecnicos_id_seq, reparacion_precios_id_seq from anon, authenticated;
  end if;
end $$;

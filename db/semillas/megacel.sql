-- Estructura real de MegaCel+ (Corrientes). Se puede correr más de una vez: no duplica.
-- El personal queda SIN contraseña: la administradora genera el código de acceso de cada uno en "Personal".

insert into ajustes (clave, valor) values
  ('nombre_negocio', 'MegaCel+'),
  ('pie_ticket', 'Gracias por tu compra · Instagram @megacelplus'),
  ('colores_frecuentes', 'Negro, Transparente, Blanco, Rosa, Lila, Azul, Rojo, Verde, Celeste, Fucsia'),
  ('curvas_talles', E'Samsung: A06, A16, A26, A36, A56, S24, S25, S25 Ultra\niPhone: 11, 12, 13, 14, 15, 16, 16 Pro, 16 Pro Max\nMotorola: E14, E15, G05, G15, G35, G55, G75, Edge 50\nXiaomi: Redmi 14C, Redmi A3, Redmi Note 13, Redmi Note 14, Poco X6\nÚnico: Único')
on conflict (clave) do update set valor = excluded.valor;

-- Puntos de venta y depósito central.
insert into sucursales (nombre, direccion, tipo) values
  ('Depósito central', 'Depósito 815', 'deposito'),
  ('San Lorenzo 960', 'San Lorenzo 960', 'local'),
  ('San Lorenzo 833', 'San Lorenzo 833', 'local'),
  ('Catamarca 815', 'Catamarca 815', 'local'),
  ('Irigoyen 2031', 'H. Irigoyen 2031', 'local'),
  ('Av. Maipú 231', 'Av. Maipú 231', 'local'),
  ('Av. Libertad 5389', 'Av. Libertad 5389 (Campus)', 'local'),
  ('Ventas online', 'Instagram y WhatsApp', 'online')
on conflict (nombre) do update set direccion = excluded.direccion, tipo = excluded.tipo, activa = true;

-- Cada punto con su depósito principal (de ahí descuentan las ventas).
insert into depositos (nombre, sucursal_id, es_principal)
select case s.tipo when 'deposito' then 'Depósito' when 'online' then 'Stock online' else 'Local' end, s.id, true
from sucursales s
where s.nombre in ('Depósito central', 'San Lorenzo 960', 'San Lorenzo 833', 'Catamarca 815', 'Irigoyen 2031', 'Av. Maipú 231', 'Av. Libertad 5389', 'Ventas online')
  and not exists (select 1 from depositos d where d.sucursal_id = s.id and d.es_principal);

-- Personal (sin contraseña todavía).
insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id, descuento_max)
select p.usuario, p.nombre, null, p.rol, s.id, 10
from (values
  ('lisandro', 'Lisandro', 'deposito', 'Depósito central'),
  ('clarisa', 'Clarisa Blanco', 'vendedora', 'San Lorenzo 960'),
  ('gonzalo', 'Gonzalo', 'vendedora', 'San Lorenzo 960'),
  ('marva', 'Marva', 'vendedora', 'San Lorenzo 960'),
  ('jaquelin', 'Jaquelín', 'vendedora', 'San Lorenzo 833'),
  ('marianela', 'Marianela', 'vendedora', 'Catamarca 815'),
  ('ingrid', 'Ingrid', 'vendedora', 'Irigoyen 2031'),
  ('leandro', 'Leandro', 'vendedora', 'Irigoyen 2031'),
  ('matias', 'Matías', 'vendedora', 'Irigoyen 2031'),
  ('rocio', 'Rocío', 'vendedora', 'Av. Maipú 231'),
  ('leila', 'Leila', 'vendedora', 'Av. Libertad 5389')
) as p(usuario, nombre, rol, sucursal)
join sucursales s on s.nombre = p.sucursal
on conflict (usuario) do nothing;

-- Rubros de accesorios.
insert into categorias (nombre)
select c from unnest(array['Fundas', 'Vidrios templados', 'Protectores de cámara', 'Cargadores', 'Cables', 'Adaptadores', 'Auriculares', 'Pop sockets', 'Soportes', 'Mallas y relojes', 'Memorias y pendrives', 'Otros']) as c
where not exists (select 1 from categorias where lower(nombre) = lower(c));

-- Artículos con variantes de talle y color.
-- Cada variante sigue siendo un producto (con su código, precio y stock), así todo lo demás
-- (ventas, stock, etiquetas, facturas) funciona igual; el artículo los agrupa.
create table articulos (
  id serial primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  categoria_id int references categorias(id) on delete set null,
  marca text,
  activo boolean not null default true,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index articulos_nombre on articulos (lower(nombre));

alter table productos
  add column articulo_id int references articulos(id) on delete restrict,
  add column talle text,
  add column color text,
  add column orden_talle int not null default 0;
create index productos_articulo on productos (articulo_id);
create unique index productos_variante on productos (articulo_id, lower(coalesce(color, '')), lower(coalesce(talle, '')))
  where articulo_id is not null;

-- Curvas de talles para elegir rápido al crear un artículo (editables en Ajustes).
insert into ajustes (clave, valor) values
  ('curvas_talles', 'Letras: XS, S, M, L, XL, XXL
Números: 36, 38, 40, 42, 44, 46, 48
Jean: 34, 36, 38, 40, 42, 44, 46
Calzado: 35, 36, 37, 38, 39, 40, 41
Único: Único'),
  ('colores_frecuentes', 'Negro, Blanco, Gris, Azul, Celeste, Beige, Marrón, Rojo, Rosa, Verde')
on conflict (clave) do nothing;

alter table articulos enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on articulos from anon, authenticated';
    execute 'revoke all on articulos_id_seq from anon, authenticated';
  end if;
end $$;

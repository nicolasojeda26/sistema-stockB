-- Código del producto en Dux cuando no es único (Dux repite el código en las variantes de color).
-- Sirve para que una lista de precios de Dux actualice todas las variantes de ese código.
alter table productos add column codigo_origen text;
create index productos_codigo_origen on productos (lower(codigo_origen)) where codigo_origen is not null;

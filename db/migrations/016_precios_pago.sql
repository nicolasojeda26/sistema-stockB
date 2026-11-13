-- Precio según cómo paga: el precio de lista es el de tarjeta; con transferencia o efectivo
-- se descuenta un % (en Ajustes). Un producto puede tener precios propios para esas formas
-- (ej. vidrio común: el mismo precio pague como pague).
alter table productos
  add column precio_transferencia numeric(14, 2) check (precio_transferencia >= 0),
  add column precio_efectivo numeric(14, 2) check (precio_efectivo >= 0);

alter table ventas add column forma_precio text not null default 'lista'
  check (forma_precio in ('lista', 'transferencia', 'efectivo'));

insert into ajustes (clave, valor) values ('descuento_transferencia', '20'), ('descuento_efectivo', '30')
  on conflict (clave) do nothing;

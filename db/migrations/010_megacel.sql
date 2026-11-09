-- Megacel: encargado de depósito, sucursales con tipo (local / online / depósito) y alta de personal sin pasar contraseñas.

-- Rol nuevo: el encargado de depósito arma envíos y atiende pedidos, pero no vende.
alter table usuarios drop constraint usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check check (rol in ('admin', 'vendedora', 'deposito'));

-- La persona crea su propia contraseña la primera vez, con un código de acceso que le da la administradora.
alter table usuarios
  alter column password_hash drop not null,
  add column codigo_acceso text,
  add column codigo_vence timestamptz;

-- Tipo de punto: un local a la calle, ventas online (Instagram/WhatsApp) o el depósito central.
alter table sucursales add column tipo text not null default 'local' check (tipo in ('local', 'online', 'deposito'));

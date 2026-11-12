-- Roles con permisos: la administración crea roles (ej. "Encargada de local", "Contador")
-- y elige qué puede hacer cada uno. La "base" dice dónde trabaja la persona:
-- admin = todas las sucursales, vendedora = un local u online, deposito = el depósito.
create table roles (
  id serial primary key,
  nombre text not null unique check (length(nombre) between 2 and 40),
  descripcion text check (length(descripcion) <= 200),
  base text not null check (base in ('admin', 'vendedora', 'deposito')),
  permisos text[] not null default '{}',
  -- Los roles del sistema no se borran; "Administración" además tiene todo y no se edita.
  sistema boolean not null default false,
  creado timestamptz not null default now()
);

insert into roles (nombre, descripcion, base, permisos, sistema) values
  ('Administración', 'Acceso completo a todas las sucursales.', 'admin', '{}', true),
  ('Vendedor/a', 'Vende y atiende su local o las ventas online.', 'vendedora', '{vender,clientes,pedidos,ingreso}', true),
  ('Encargado de depósito', 'Arma y manda los envíos a las sucursales.', 'deposito', '{envios,ingreso}', true);

alter table usuarios add column rol_id int references roles(id) on delete restrict;
update usuarios u set rol_id = r.id from roles r where r.sistema and r.base = u.rol;

-- usuarios.rol queda como copia de la base del rol (el resto del sistema la usa para saber
-- qué sucursales ve cada uno). Si se inserta sin rol_id, toma el rol del sistema de esa base.
create function usuarios_rol_base() returns trigger language plpgsql as $$
begin
  if new.rol_id is null then
    select id into new.rol_id from roles where sistema and base = new.rol order by id limit 1;
  else
    select base into new.rol from roles where id = new.rol_id;
  end if;
  return new;
end $$;
create trigger usuarios_rol_base before insert or update of rol, rol_id on usuarios
  for each row execute function usuarios_rol_base();

alter table usuarios alter column rol_id set not null;

-- Historial de cambios del personal: altas, cambios de rol, pases de sucursal, bajas.
create table personal_historial (
  id bigserial primary key,
  usuario_id int not null references usuarios(id) on delete cascade,
  cambio text not null check (cambio in ('alta', 'rol', 'sucursal', 'baja', 'reactivacion', 'datos', 'acceso')),
  detalle text not null,
  hecho_por int references usuarios(id) on delete set null,
  creado timestamptz not null default now()
);
create index personal_historial_fecha on personal_historial (creado desc);
create index personal_historial_usuario on personal_historial (usuario_id, creado desc);

alter table roles enable row level security;
alter table personal_historial enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on roles, personal_historial from anon, authenticated;
    revoke all on roles_id_seq, personal_historial_id_seq from anon, authenticated;
  end if;
end $$;

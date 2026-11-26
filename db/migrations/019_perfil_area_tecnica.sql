-- Perfil del área técnica: técnicos con usuario propio que ven los equipos de todas las sucursales
-- y solo informan en qué estado está cada uno.

-- Permiso nuevo «reparaciones_estado» (informar estados, marcar lista o sin reparación).
-- Quien ya manejaba reparaciones lo conserva, así nadie pierde nada: si se quiere que solo
-- el área técnica cambie estados, se destilda en el rol de vendedores.
update roles set permisos = array_append(permisos, 'reparaciones_estado')
  where 'reparaciones' = any(permisos) and not ('reparaciones_estado' = any(permisos));
update usuarios set permisos_extra = array_append(permisos_extra, 'reparaciones_estado')
  where 'reparaciones' = any(permisos_extra) and not ('reparaciones_estado' = any(permisos_extra));
update usuarios set permisos_quitados = array_append(permisos_quitados, 'reparaciones_estado')
  where 'reparaciones' = any(permisos_quitados) and not ('reparaciones_estado' = any(permisos_quitados));

-- Rol para los técnicos: todas las sucursales, solo el área técnica.
insert into roles (nombre, descripcion, base, permisos, descuento_max, descuento_max_reparacion)
values ('Área técnica', 'Técnicos: ven los equipos de todas las sucursales e informan en qué estado está cada uno.', 'admin', '{reparaciones_estado}', 0, 0)
on conflict (nombre) do nothing;

-- Usuario ↔ técnico de la lista: al informar un estado queda como técnico quien lo hizo.
alter table usuarios add column tecnico_id int references tecnicos(id) on delete set null;
create unique index usuarios_tecnico on usuarios (tecnico_id) where tecnico_id is not null;

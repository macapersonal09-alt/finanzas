-- 1-oct-2026 · Subcategorías (app web v1.4)
-- Se corre una sola vez en Supabase → SQL Editor. No borra nada: los movimientos y reglas se quedan igual.
-- padre_id = la categoría madre · terminus = conceptos de lo que pagas por Terminus (traspasos a la cuenta con Terminus)
-- Elegir la madre misma equivale a "Otros".

begin;

alter table categorias add column if not exists padre_id bigint references categorias(id);
alter table categorias add column if not exists terminus boolean not null default false;

-- Casa: las que ya existían pasan adentro (conservan movimientos y reglas) + Ángeles
update categorias set padre_id = 3, orden = 1 where id = 1;                                        -- Súper y despensa
update categorias set padre_id = 3, orden = 3, nombre = 'Servicios y Mantenimiento' where id = 4;  -- antes "Servicios"
update categorias set padre_id = 3, orden = 4 where id = 17;                                       -- Renta Casa

insert into categorias (nombre, tipo, activa, orden, padre_id) values
  ('Ángeles', 'GASTO', true, 2, 3),
  ('Amazon', 'GASTO', true, 1, 7), ('Temu', 'GASTO', true, 2, 7), ('YesStyle', 'GASTO', true, 3, 7), ('Ropa', 'GASTO', true, 4, 7),
  ('Honorarios médicos', 'GASTO', true, 1, 6), ('Medicación', 'GASTO', true, 2, 6), ('Estudios', 'GASTO', true, 3, 6);

-- Terminus: no es gasto tuyo, es el concepto de lo que pagas por la empresa
with t as (
  insert into categorias (nombre, tipo, activa, orden, terminus) values ('Terminus', 'GASTO', true, 50, true) returning id
)
insert into categorias (nombre, tipo, activa, orden, padre_id, terminus)
select x.nombre, 'GASTO', true, x.orden, t.id, true
from t, (values ('Nóminas', 1), ('Cajas chicas', 2), ('Material', 3)) as x(nombre, orden);

commit;

select c.id, coalesce(m.nombre || ' → ', '') || c.nombre as categoria, c.tipo, c.terminus
from categorias c left join categorias m on m.id = c.padre_id
order by coalesce(c.padre_id, c.id), c.padre_id nulls first, c.orden;

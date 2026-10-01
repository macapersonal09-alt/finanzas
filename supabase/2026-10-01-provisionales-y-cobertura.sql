-- 1-oct-2026 · Movimientos provisionales y cobertura automática de Enlace (app web v1.5 · FP-LECTOR v1.6)
-- Se corre una sola vez en Supabase → SQL Editor, ANTES de publicar la app v1.5 y de pegar FP-LECTOR v1.6.

begin;

-- provisional = compra "en proceso" que el banco todavía no avisa; el lector la confirma al llegar el correo
alter table movimientos add column if not exists provisional boolean not null default false;

-- cubre_desde = de qué cuenta toma Banorte lo que falta (los "CL" automáticos, que no llegan por correo)
alter table bolsas add column if not exists cubre_desde text references bolsas(id);
update bolsas set cubre_desde = 'INVERSION' where id = 'ENLACE';

-- los $20,000 de Pavel del 30-sep: hora para que queden después de las dos compras de Amazon de esa mañana
update movimientos set hora = '06:00:00' where id = 'e8fa84c4-3a36-4d18-9159-4214e7a09bb3';

-- compras de Amazon "En proceso" del 29 y 30-sep (Personal → Amazon)
insert into movimientos (fecha, hora, monto, tipo, bolsa_sale, categoria_id, comercio, estado, fuente, provisional) values
  ('2026-09-29', '12:00:00',  284.03, 'GASTO', 'ENLACE', 20, 'AMAZON', 'CONFIRMADO', 'APP', true),
  ('2026-09-29', '12:00:01', 1498.00, 'GASTO', 'ENLACE', 20, 'AMAZON', 'CONFIRMADO', 'APP', true),
  ('2026-09-30', '00:00:01', 1397.88, 'GASTO', 'ENLACE', 20, 'AMAZON', 'CONFIRMADO', 'APP', true),
  ('2026-09-30', '00:00:02',  994.90, 'GASTO', 'ENLACE', 20, 'AMAZON', 'CONFIRMADO', 'APP', true),
  ('2026-09-30', '23:59:00',  562.36, 'GASTO', 'ENLACE', 20, 'AMAZON', 'CONFIRMADO', 'APP', true);

commit;

select fecha, hora, monto, bolsa_sale, provisional, comercio from movimientos
where provisional or id = 'e8fa84c4-3a36-4d18-9159-4214e7a09bb3'
order by fecha, hora;

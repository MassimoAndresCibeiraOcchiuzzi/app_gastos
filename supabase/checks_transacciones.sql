-- ============================================================
-- CHECK constraints de `transacciones`
-- Correr en Supabase Dashboard > SQL Editor, DESPUÉS de revisar
-- supabase/diagnostico_checks.sql. Es idempotente.
--
-- Hasta ahora las reglas vivían sólo en la app (src/lib/validacion.ts). Pero
-- el navegador tiene la anon key y la sesión: puede escribir directo en la
-- tabla vía la API de Supabase y saltearse esa validación. Con esto la base
-- rechaza lo mismo que la app, venga de donde venga.
--
-- Los límites coinciden con la app: descripción 200 (MAX_DESCRIPCION),
-- categoría 40 (MAX_CATEGORIA, igual que la tabla `categorias`), cuenta 60
-- (MAX_CUENTA), fecha 2000-2100 (FECHA_MINIMA / FECHA_MAXIMA).
--
-- Seguridad: todo va en una transacción. Si alguna fila existente viola una
-- regla, el ADD CONSTRAINT falla, se deshace todo y no queda ningún CHECK a
-- medias. Postgres valida contra todas las filas, sin importar RLS.
-- ============================================================

begin;

alter table public.transacciones
  drop constraint if exists transacciones_descripcion_largo,
  drop constraint if exists transacciones_monto_distinto_de_cero,
  drop constraint if exists transacciones_fecha_rango,
  drop constraint if exists transacciones_categoria_largo,
  drop constraint if exists transacciones_cuenta_largo,
  drop constraint if exists transacciones_monto_negativo_solo_ajuste;

alter table public.transacciones
  add constraint transacciones_descripcion_largo
    check (char_length(descripcion) <= 200),

  add constraint transacciones_monto_distinto_de_cero
    check (monto <> 0),

  add constraint transacciones_fecha_rango
    check (fecha between date '2000-01-01' and date '2100-12-31'),

  -- categoria y cuenta admiten NULL; un NULL pasa (no tiene largo que medir).
  add constraint transacciones_categoria_largo
    check (char_length(categoria) <= 40),

  add constraint transacciones_cuenta_largo
    check (char_length(cuenta) <= 60),

  -- Sólo el ajuste neteado de impuestos (egreso de "Ajustes tarjeta") puede
  -- ser negativo. Misma regla que `admiteMontoNegativo` en la app.
  -- `is not distinct from` y no `=`: con categoria NULL, `=` da NULL, y un
  -- CHECK que da NULL PASA. Así un negativo sin categoría se colaría.
  add constraint transacciones_monto_negativo_solo_ajuste
    check (
      monto > 0
      or (categoria is not distinct from 'Ajustes tarjeta' and tipo = 'egreso')
    );

commit;

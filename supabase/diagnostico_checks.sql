-- ============================================================
-- Diagnóstico ANTES de aplicar supabase/checks_transacciones.sql
-- Sólo lee: no modifica nada. Correr en Supabase > SQL Editor.
--
-- Lista cada fila de `transacciones` que violaría alguno de los CHECKs
-- nuevos, con la regla que rompe. Si no devuelve ninguna fila de tipo
-- "VIOLA", se puede aplicar la migración.
--
-- La primera fila ("total visible") es un control: tiene que coincidir con la
-- cantidad de transacciones que sabés que tenés. Si da 0 y tenés datos, el
-- SQL Editor no está viendo las filas (RLS) y el diagnóstico no sirve; la
-- migración igual es segura (ver el comentario de ese archivo).
-- ============================================================

select 0 as orden, 'total visible' as resultado, null::text as regla, null::uuid as id,
       null::date as fecha, null::text as descripcion, null::numeric as monto,
       null::text as tipo, null::text as categoria, count(*)::text as detalle
  from public.transacciones

union all

select 1, 'VIOLA', v.regla, t.id, t.fecha, left(t.descripcion, 60), t.monto,
       t.tipo, t.categoria, v.detalle
  from public.transacciones t
  cross join lateral (
    values
      ('descripcion_largo',
       char_length(t.descripcion) > 200,
       char_length(t.descripcion) || ' caracteres'),
      ('monto_distinto_de_cero',
       t.monto = 0,
       'monto = 0'),
      ('fecha_rango',
       t.fecha not between date '2000-01-01' and date '2100-12-31',
       'fecha fuera de 2000-2100'),
      ('categoria_largo',
       coalesce(char_length(t.categoria) > 40, false),
       char_length(t.categoria) || ' caracteres'),
      ('cuenta_largo',
       coalesce(char_length(t.cuenta) > 60, false),
       char_length(t.cuenta) || ' caracteres'),
      ('monto_negativo_solo_ajuste',
       not (t.monto > 0
            or (t.categoria is not distinct from 'Ajustes tarjeta'
                and t.tipo = 'egreso')),
       'monto <= 0 fuera del ajuste egreso')
  ) as v(regla, viola, detalle)
 where v.viola

order by orden, regla, fecha;

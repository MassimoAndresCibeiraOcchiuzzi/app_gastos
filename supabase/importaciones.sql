-- ============================================================
-- Tabla `importaciones` + Row Level Security + límite de uso
-- Correr en Supabase Dashboard > SQL Editor > New query > Run
-- Es idempotente: se puede correr más de una vez sin romper nada.
--
-- Cada intento de importar un PDF deja una fila acá. /api/importar llama a
-- `registrar_importacion` antes de gastar en la API de Claude y rechaza la
-- request si el usuario ya llegó al límite de la ventana (10 cada 24 horas).
-- Es una red de seguridad además del límite de gasto de la consola.
-- ============================================================

create table if not exists public.importaciones (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table public.importaciones is
  'Un registro por intento de importación de PDF. Alimenta el límite diario.';

-- Para contar rápido "mis importaciones de las últimas 24 horas".
create index if not exists importaciones_usuario_fecha_idx
  on public.importaciones (usuario_id, created_at desc);

-- ------------------------------------------------------------
-- Row Level Security: cada usuario ve y agrega sólo las suyas.
-- Sin políticas de UPDATE ni DELETE a propósito: si el usuario pudiera
-- borrar sus filas, podría resetear su propio contador.
-- ------------------------------------------------------------
alter table public.importaciones enable row level security;
alter table public.importaciones force row level security;

drop policy if exists "importaciones_select_propias" on public.importaciones;
create policy "importaciones_select_propias"
  on public.importaciones
  for select
  to authenticated
  using ((select auth.uid()) = usuario_id);

drop policy if exists "importaciones_insert_propias" on public.importaciones;
create policy "importaciones_insert_propias"
  on public.importaciones
  for insert
  to authenticated
  with check ((select auth.uid()) = usuario_id);

-- ------------------------------------------------------------
-- Chequeo + registro atómico.
--
-- Contar y después insertar desde la app no alcanza: dos requests al mismo
-- tiempo verían las dos "9 de 10" y pasarían las dos. El advisory lock
-- serializa los intentos del mismo usuario (sólo de ese usuario) hasta el
-- fin de la transacción.
--
-- Devuelve una sola fila:
--   permitido = true   → se registró el intento, seguir.
--   permitido = false  → no se registró nada; `disponible_desde` es cuándo
--                        se libera el próximo lugar.
--
-- security invoker: corre con los permisos de quien llama, así que las
-- políticas de RLS de arriba siguen aplicando.
-- ------------------------------------------------------------
create or replace function public.registrar_importacion(
  limite  integer,
  ventana interval
)
returns table (permitido boolean, disponible_desde timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  usadas     integer;
  mas_vieja  timestamptz;
begin
  if uid is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select count(*), min(i.created_at)
    into usadas, mas_vieja
    from public.importaciones i
   where i.usuario_id = uid
     and i.created_at > now() - ventana;

  if usadas >= limite then
    -- El lugar se libera cuando la más vieja de la ventana sale de ella.
    return query select false, mas_vieja + ventana;
    return;
  end if;

  insert into public.importaciones (usuario_id) values (uid);
  return query select true, null::timestamptz;
end;
$$;

revoke execute on function public.registrar_importacion(integer, interval)
  from public, anon;
grant execute on function public.registrar_importacion(integer, interval)
  to authenticated;

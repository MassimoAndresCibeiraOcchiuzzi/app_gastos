-- ============================================================
-- Meta de ahorro + Row Level Security
-- Correr en Supabase Dashboard > SQL Editor > New query > Run
-- Es idempotente: se puede correr más de una vez sin romper nada.
--
-- Una meta por usuario: "juntar monto_objetivo para fecha_objetivo". El
-- avance no se guarda: la app lo calcula sumando el balance (ingresos −
-- egresos) de cada mes desde fecha_inicio hasta el actual.
-- ============================================================

create table if not exists public.metas_ahorro (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,
  nombre          text not null check (char_length(trim(nombre)) between 1 and 60),
  monto_objetivo  numeric(14, 2) not null check (monto_objetivo > 0),
  fecha_inicio    date not null default current_date,
  fecha_objetivo  date not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Mismo rango que `transacciones.fecha` (supabase/checks_transacciones.sql).
  constraint metas_ahorro_fechas_rango check (
    fecha_inicio between date '2000-01-01' and date '2100-12-31'
    and fecha_objetivo between date '2000-01-01' and date '2100-12-31'
  ),
  constraint metas_ahorro_objetivo_despues_de_inicio check (
    fecha_objetivo > fecha_inicio
  )
);

comment on table public.metas_ahorro is
  'La meta de ahorro de cada usuario (una sola). El avance lo calcula la app.';

-- Una sola meta por usuario: guardar otra vez la actualiza (upsert).
create unique index if not exists metas_ahorro_usuario_uidx
  on public.metas_ahorro (usuario_id);

-- ------------------------------------------------------------
-- Row Level Security: cada usuario ve y toca sólo su meta
-- ------------------------------------------------------------
alter table public.metas_ahorro enable row level security;
alter table public.metas_ahorro force row level security;

drop policy if exists "metas_select_propias" on public.metas_ahorro;
create policy "metas_select_propias"
  on public.metas_ahorro
  for select
  to authenticated
  using ((select auth.uid()) = usuario_id);

drop policy if exists "metas_insert_propias" on public.metas_ahorro;
create policy "metas_insert_propias"
  on public.metas_ahorro
  for insert
  to authenticated
  with check ((select auth.uid()) = usuario_id);

-- El upsert necesita también esta política. WITH CHECK: la meta propia no
-- se puede pasar a otro usuario.
drop policy if exists "metas_update_propias" on public.metas_ahorro;
create policy "metas_update_propias"
  on public.metas_ahorro
  for update
  to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

drop policy if exists "metas_delete_propias" on public.metas_ahorro;
create policy "metas_delete_propias"
  on public.metas_ahorro
  for delete
  to authenticated
  using ((select auth.uid()) = usuario_id);

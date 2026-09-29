-- ============================================================
-- Presupuestos mensuales por categoría + Row Level Security
-- Correr en Supabase Dashboard > SQL Editor > New query > Run
-- Es idempotente: se puede correr más de una vez sin romper nada.
--
-- Un tope de gasto mensual por categoría, para las categorías que el usuario
-- quiera (ninguna es obligatoria). Es el mismo monto todos los meses: no hay
-- un presupuesto distinto por mes. La categoría se guarda como texto, igual
-- que en `transacciones`.
-- ============================================================

create table if not exists public.presupuestos (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null default auth.uid()
                   references auth.users (id) on delete cascade,
  -- Mismo largo que `transacciones.categoria`. El ajuste de impuestos no es
  -- un gasto que se pueda presupuestar.
  categoria      text not null
                   check (
                     char_length(trim(categoria)) between 1 and 40
                     and categoria <> 'Ajustes tarjeta'
                   ),
  -- Positivo; el tope es el de numeric(14,2), como `transacciones.monto`.
  monto_mensual  numeric(14, 2) not null check (monto_mensual > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.presupuestos is
  'Tope de gasto mensual por categoría, por usuario. Opcional por categoría.';

-- Un presupuesto por categoría y usuario: guardar otra vez la misma categoría
-- actualiza el monto (upsert) en vez de duplicarla.
create unique index if not exists presupuestos_usuario_categoria_uidx
  on public.presupuestos (usuario_id, categoria);

-- ------------------------------------------------------------
-- Row Level Security: cada usuario ve y toca sólo sus presupuestos
-- ------------------------------------------------------------
alter table public.presupuestos enable row level security;
alter table public.presupuestos force row level security;

drop policy if exists "presupuestos_select_propios" on public.presupuestos;
create policy "presupuestos_select_propios"
  on public.presupuestos
  for select
  to authenticated
  using ((select auth.uid()) = usuario_id);

drop policy if exists "presupuestos_insert_propios" on public.presupuestos;
create policy "presupuestos_insert_propios"
  on public.presupuestos
  for insert
  to authenticated
  with check ((select auth.uid()) = usuario_id);

-- El upsert (INSERT ... ON CONFLICT DO UPDATE) necesita también esta política.
-- WITH CHECK: un presupuesto propio no se puede pasar a otro usuario.
drop policy if exists "presupuestos_update_propios" on public.presupuestos;
create policy "presupuestos_update_propios"
  on public.presupuestos
  for update
  to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

drop policy if exists "presupuestos_delete_propios" on public.presupuestos;
create policy "presupuestos_delete_propios"
  on public.presupuestos
  for delete
  to authenticated
  using ((select auth.uid()) = usuario_id);

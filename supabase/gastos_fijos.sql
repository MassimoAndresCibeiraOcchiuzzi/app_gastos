-- ============================================================
-- Gastos fijos: marca en `transacciones` + comercios recordados
-- Correr en Supabase Dashboard > SQL Editor > New query > Run
-- Es idempotente: se puede correr más de una vez sin romper nada.
--
-- 1. `transacciones.es_fijo`: marca informativa ("esto es un gasto fijo").
--    No cambia ningún total.
-- 2. `comercios_fijos`: qué comercios marcó el usuario como fijos, para
--    pre-tildar la marca la próxima vez que cargue o importe uno igual.
--    Va aparte de `reglas_categoria`: un comercio puede ser fijo sin tener
--    regla de categoría y al revés, y cada tabla se borra por su lado.
--    `patron_comercio` usa la misma normalización (src/lib/reglas.ts →
--    claveComercio) y el mismo CHECK de formato.
-- ============================================================

alter table public.transacciones
  add column if not exists es_fijo boolean not null default false;

comment on column public.transacciones.es_fijo is
  'Gasto fijo (marca informativa). No cambia balances ni totales.';

create table if not exists public.comercios_fijos (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null default auth.uid()
                     references auth.users (id) on delete cascade,
  patron_comercio  text not null
                     check (
                       char_length(patron_comercio) between 3 and 100
                       and patron_comercio ~ '^[A-Z0-9]+( [A-Z0-9]+)*$'
                     ),
  created_at       timestamptz not null default now()
);

comment on table public.comercios_fijos is
  'Comercios que el usuario marcó como gasto fijo. Se usan para pre-tildar la marca.';

create unique index if not exists comercios_fijos_usuario_patron_uidx
  on public.comercios_fijos (usuario_id, patron_comercio);

-- ------------------------------------------------------------
-- Row Level Security: cada usuario ve y toca sólo sus comercios
-- ------------------------------------------------------------
alter table public.comercios_fijos enable row level security;
alter table public.comercios_fijos force row level security;

drop policy if exists "fijos_select_propios" on public.comercios_fijos;
create policy "fijos_select_propios"
  on public.comercios_fijos
  for select
  to authenticated
  using ((select auth.uid()) = usuario_id);

drop policy if exists "fijos_insert_propios" on public.comercios_fijos;
create policy "fijos_insert_propios"
  on public.comercios_fijos
  for insert
  to authenticated
  with check ((select auth.uid()) = usuario_id);

-- El upsert (ON CONFLICT DO NOTHING/UPDATE) necesita también esta política.
drop policy if exists "fijos_update_propios" on public.comercios_fijos;
create policy "fijos_update_propios"
  on public.comercios_fijos
  for update
  to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

drop policy if exists "fijos_delete_propios" on public.comercios_fijos;
create policy "fijos_delete_propios"
  on public.comercios_fijos
  for delete
  to authenticated
  using ((select auth.uid()) = usuario_id);

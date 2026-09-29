-- ============================================================
-- Reglas de categorización por comercio + Row Level Security
-- Correr en Supabase Dashboard > SQL Editor > New query > Run
-- Es idempotente: se puede correr más de una vez sin romper nada.
--
-- Cada fila dice "lo de este comercio va en esta categoría" para un usuario.
-- Se crean cuando corregís la categoría de un gasto (editándolo en
-- Movimientos o en la revisión de un import) y se aplican en el próximo
-- import, por encima de la sugerencia de la IA.
--
-- `patron_comercio` es el nombre del comercio ya normalizado por la app
-- (src/lib/reglas.ts → claveComercio): MAYÚSCULAS, sin tildes, sin números
-- sueltos, palabras separadas por un espacio. El CHECK de formato hace que
-- la base rechace un patrón que la app no habría generado, venga de donde
-- venga.
-- ============================================================

create table if not exists public.reglas_categoria (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null default auth.uid()
                     references auth.users (id) on delete cascade,
  patron_comercio  text not null
                     check (
                       char_length(patron_comercio) between 3 and 100
                       and patron_comercio ~ '^[A-Z0-9]+( [A-Z0-9]+)*$'
                     ),
  -- Mismo largo que `transacciones.categoria` y `categorias.nombre`. El ajuste
  -- de impuestos no es un comercio: nunca es el destino de una regla.
  categoria        text not null
                     check (
                       char_length(trim(categoria)) between 1 and 40
                       and categoria <> 'Ajustes tarjeta'
                     ),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.reglas_categoria is
  'Qué categoría corresponde a cada comercio, por usuario. Se aplican al importar resúmenes.';

-- Una regla por comercio y usuario: corregir otra vez el mismo comercio
-- actualiza la regla (upsert) en vez de duplicarla. También sirve de índice
-- para traer las reglas del usuario.
create unique index if not exists reglas_categoria_usuario_patron_uidx
  on public.reglas_categoria (usuario_id, patron_comercio);

-- ------------------------------------------------------------
-- Row Level Security: cada usuario ve y toca sólo sus reglas
-- ------------------------------------------------------------
alter table public.reglas_categoria enable row level security;
alter table public.reglas_categoria force row level security;

drop policy if exists "reglas_select_propias" on public.reglas_categoria;
create policy "reglas_select_propias"
  on public.reglas_categoria
  for select
  to authenticated
  using ((select auth.uid()) = usuario_id);

drop policy if exists "reglas_insert_propias" on public.reglas_categoria;
create policy "reglas_insert_propias"
  on public.reglas_categoria
  for insert
  to authenticated
  with check ((select auth.uid()) = usuario_id);

-- El upsert (INSERT ... ON CONFLICT DO UPDATE) necesita también esta política.
-- WITH CHECK: una regla propia no se puede pasar a otro usuario.
drop policy if exists "reglas_update_propias" on public.reglas_categoria;
create policy "reglas_update_propias"
  on public.reglas_categoria
  for update
  to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

drop policy if exists "reglas_delete_propias" on public.reglas_categoria;
create policy "reglas_delete_propias"
  on public.reglas_categoria
  for delete
  to authenticated
  using ((select auth.uid()) = usuario_id);

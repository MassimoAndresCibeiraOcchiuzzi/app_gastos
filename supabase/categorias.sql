-- ============================================================
-- Fase 6 — Tabla `categorias` (personalizadas) + Row Level Security
-- Correr en Supabase Dashboard > SQL Editor > New query > Run
-- Es idempotente: se puede correr más de una vez sin romper nada.
--
-- Las 8 categorías del sistema (Comida, Transporte, ...) viven en el código
-- (src/lib/categorias.ts), visibles para todos. Esta tabla guarda SÓLO las
-- categorías propias de cada usuario.
-- ============================================================

create table if not exists public.categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(trim(nombre)) between 1 and 40),
  usuario_id  uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table public.categorias is
  'Categorías personalizadas de cada usuario. Las del sistema viven en el código.';

-- Sin duplicados por usuario, ignorando mayúsculas y espacios de los bordes.
create unique index if not exists categorias_usuario_nombre_uidx
  on public.categorias (usuario_id, lower(trim(nombre)));

-- ------------------------------------------------------------
-- Row Level Security: cada usuario ve y toca sólo sus categorías
-- ------------------------------------------------------------
alter table public.categorias enable row level security;
alter table public.categorias force row level security;

drop policy if exists "categorias_select_propias" on public.categorias;
create policy "categorias_select_propias"
  on public.categorias
  for select
  to authenticated
  using ((select auth.uid()) = usuario_id);

drop policy if exists "categorias_insert_propias" on public.categorias;
create policy "categorias_insert_propias"
  on public.categorias
  for insert
  to authenticated
  with check ((select auth.uid()) = usuario_id);

drop policy if exists "categorias_delete_propias" on public.categorias;
create policy "categorias_delete_propias"
  on public.categorias
  for delete
  to authenticated
  using ((select auth.uid()) = usuario_id);

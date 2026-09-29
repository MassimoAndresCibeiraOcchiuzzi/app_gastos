-- ============================================================
-- Tabla `resumenes_importados` + Row Level Security
-- Correr en Supabase Dashboard > SQL Editor > New query > Run
-- Es idempotente: se puede correr más de una vez sin romper nada.
--
-- Una fila por resumen PDF que el usuario confirmó e importó, identificado
-- por el SHA-256 de sus bytes. Antes de analizar un PDF, /api/importar busca
-- el hash acá: si ya está, avisa ("Este resumen ya fue importado el ...") y
-- sólo sigue si el usuario confirma.
--
-- Se registra al CONFIRMAR la importación, no al analizar: analizar un PDF y
-- descartarlo no lo marca como importado.
--
-- Limitación: es el hash de los bytes exactos. El mismo resumen descargado
-- dos veces del home banking puede generar archivos distintos (fecha de
-- emisión, ids internos) y no se detectaría como repetido.
-- ============================================================

create table if not exists public.resumenes_importados (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  hash        text not null check (hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  -- Un mismo resumen se registra una sola vez por usuario. Si se reimporta
  -- confirmando el aviso, se conserva la fecha de la primera vez.
  constraint resumenes_importados_usuario_hash_key unique (usuario_id, hash)
);

comment on table public.resumenes_importados is
  'SHA-256 de cada PDF importado, para avisar antes de importarlo de nuevo.';

-- ------------------------------------------------------------
-- Row Level Security: cada usuario ve y agrega sólo los suyos.
-- Sin UPDATE ni DELETE: no hacen falta.
-- ------------------------------------------------------------
alter table public.resumenes_importados enable row level security;
alter table public.resumenes_importados force row level security;

drop policy if exists "resumenes_importados_select_propios" on public.resumenes_importados;
create policy "resumenes_importados_select_propios"
  on public.resumenes_importados
  for select
  to authenticated
  using ((select auth.uid()) = usuario_id);

drop policy if exists "resumenes_importados_insert_propios" on public.resumenes_importados;
create policy "resumenes_importados_insert_propios"
  on public.resumenes_importados
  for insert
  to authenticated
  with check ((select auth.uid()) = usuario_id);

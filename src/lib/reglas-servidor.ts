import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { reglasParaGuardar, type PedidoRegla } from "@/lib/reglas";

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Tope de reglas por pedido: una importación no tiene más filas que esto. */
const MAX_REGLAS = 500;

export type ResultadoReglas =
  | { ok: true; guardadas: number }
  | { ok: false; error: string };

/**
 * Guarda (o actualiza) las reglas de categoría de un usuario. Vive fuera de
 * los archivos `"use server"` a propósito: todo lo que exporta uno de esos es
 * una acción que el navegador puede llamar, y ésta recibe el cliente de
 * Supabase ya autenticado.
 *
 * Corregir otra vez el mismo comercio pisa la regla anterior (upsert por
 * usuario + patrón), así que "cambiar una regla" es corregir de nuevo.
 */
export async function guardarReglas(
  supabase: Cliente,
  usuarioId: string,
  pedidos: readonly PedidoRegla[],
): Promise<ResultadoReglas> {
  if (!Array.isArray(pedidos) || pedidos.length === 0) {
    return { ok: true, guardadas: 0 };
  }

  const reglas = reglasParaGuardar(pedidos.slice(0, MAX_REGLAS));
  if (reglas.length === 0) return { ok: true, guardadas: 0 };

  const ahora = new Date().toISOString();
  const { error } = await supabase.from("reglas_categoria").upsert(
    reglas.map((r) => ({ ...r, usuario_id: usuarioId, updated_at: ahora })),
    { onConflict: "usuario_id,patron_comercio" },
  );

  if (error) {
    console.error("[reglas] no se pudieron guardar:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, guardadas: reglas.length };
}

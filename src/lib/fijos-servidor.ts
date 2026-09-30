import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { cambiosFijos, type PedidoFijo } from "@/lib/fijos";

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Tope por pedido: una importación no tiene más filas que esto. */
const MAX_PEDIDOS = 500;

/**
 * Aprende de lo que el usuario hizo con la casilla "Gasto fijo": los
 * comercios que tildó quedan recordados y los que destildó se olvidan. Vive
 * fuera de los archivos `"use server"` porque recibe el cliente autenticado
 * (todo lo que exporta uno de esos es una acción llamable desde el navegador).
 *
 * Devuelve el error en vez de tirarlo: la transacción ya se guardó, y que
 * esto falle sólo significa que la próxima vez no se pre-tilda.
 */
export async function aplicarCambiosFijos(
  supabase: Cliente,
  usuarioId: string,
  pedidos: readonly PedidoFijo[],
): Promise<string | null> {
  if (!Array.isArray(pedidos) || pedidos.length === 0) return null;
  const { marcar, olvidar } = cambiosFijos(pedidos.slice(0, MAX_PEDIDOS));

  if (marcar.length > 0) {
    const { error } = await supabase.from("comercios_fijos").upsert(
      marcar.map((patron_comercio) => ({ patron_comercio, usuario_id: usuarioId })),
      { onConflict: "usuario_id,patron_comercio", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[fijos] no se pudieron recordar:", error.message);
      return error.message;
    }
  }

  if (olvidar.length > 0) {
    const { error } = await supabase
      .from("comercios_fijos")
      .delete()
      .in("patron_comercio", olvidar);
    if (error) {
      console.error("[fijos] no se pudieron olvidar:", error.message);
      return error.message;
    }
  }
  return null;
}

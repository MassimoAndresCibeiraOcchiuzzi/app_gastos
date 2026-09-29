"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ResultadoEliminarRegla = { ok: true } | { ok: false; error: string };

/**
 * Borra una regla de categoría por comercio. La política de RLS limita el
 * delete a las reglas propias; con un id ajeno o ya borrado no toca nada.
 */
export async function eliminarRegla(id: string): Promise<ResultadoEliminarRegla> {
  if (typeof id !== "string" || id === "") {
    return { ok: false, error: "Esa regla ya no existe." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Se cerró tu sesión. Volvé a entrar." };

  const { error } = await supabase.from("reglas_categoria").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

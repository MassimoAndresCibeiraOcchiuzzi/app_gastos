"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validarMeta, type CampoMeta, type EntradaMeta } from "@/lib/metas";

export type ResultadoMeta =
  | { ok: true }
  | { ok: false; error?: string; errores?: Partial<Record<CampoMeta, string>> };

/**
 * Crea o actualiza la meta de ahorro (hay una por usuario: upsert por
 * `usuario_id`). Pasa por la misma validación que el formulario; la base
 * aplica además sus CHECK.
 */
export async function guardarMeta(entrada: EntradaMeta): Promise<ResultadoMeta> {
  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  const resultado = validarMeta({
    nombre: texto(entrada?.nombre),
    monto: texto(entrada?.monto),
    fecha_inicio: texto(entrada?.fecha_inicio),
    fecha_objetivo: texto(entrada?.fecha_objetivo),
  });
  if (!resultado.ok) return { ok: false, errores: resultado.errores };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Se cerró tu sesión. Volvé a entrar." };

  const { error } = await supabase.from("metas_ahorro").upsert(
    { ...resultado.valor, usuario_id: user.id, updated_at: new Date().toISOString() },
    { onConflict: "usuario_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Borra la meta de ahorro. Las transacciones no se tocan. */
export async function eliminarMeta(): Promise<ResultadoMeta> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Se cerró tu sesión. Volvé a entrar." };

  // RLS ya limita el delete a la meta propia; el filtro es explícito igual.
  const { error } = await supabase.from("metas_ahorro").delete().eq("usuario_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

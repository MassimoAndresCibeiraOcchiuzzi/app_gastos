"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIAS_CONSUMO } from "@/lib/categorias";
import {
  validarPresupuestos,
  type EntradaPresupuesto,
} from "@/lib/presupuestos";

export type ResultadoPresupuestos =
  | { ok: true }
  | { ok: false; error?: string; errores?: Record<string, string> };

/** Tope de filas por pedido: hay una por categoría, nunca tantas. */
const MAX_ENTRADAS = 200;

/**
 * Guarda el formulario de presupuestos entero: las categorías con monto se
 * crean o actualizan (upsert por usuario + categoría) y las que quedaron
 * vacías pierden su presupuesto. Si algún monto es inválido no se guarda nada.
 *
 * No es atómico (son dos pedidos): si el borrado falla después del upsert,
 * los montos nuevos quedan guardados y se avisa el error. Reintentar es
 * seguro, porque las dos operaciones son idempotentes.
 */
export async function guardarPresupuestos(
  entradas: EntradaPresupuesto[],
): Promise<ResultadoPresupuestos> {
  if (!Array.isArray(entradas) || entradas.length > MAX_ENTRADAS) {
    return { ok: false, error: "No pudimos leer los presupuestos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Se cerró tu sesión. Volvé a entrar." };

  // Las categorías que se pueden presupuestar se leen acá, no se toman del
  // cliente. Si la tabla de propias no existe, quedan sólo las del sistema.
  const { data: propias } = await supabase.from("categorias").select("nombre");
  const validas = [
    ...CATEGORIAS_CONSUMO,
    ...(propias ?? []).map((c: { nombre: string }) => c.nombre),
  ];

  const resultado = validarPresupuestos(entradas, validas);
  if (!resultado.ok) return { ok: false, errores: resultado.errores };

  if (resultado.guardar.length > 0) {
    const ahora = new Date().toISOString();
    const { error } = await supabase.from("presupuestos").upsert(
      resultado.guardar.map((p) => ({ ...p, usuario_id: user.id, updated_at: ahora })),
      { onConflict: "usuario_id,categoria" },
    );
    if (error) return { ok: false, error: error.message };
  }

  if (resultado.borrar.length > 0) {
    const { error } = await supabase
      .from("presupuestos")
      .delete()
      .in("categoria", resultado.borrar);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

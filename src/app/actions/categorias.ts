"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORIAS,
  MAX_CATEGORIA,
  normalizarNombreCategoria,
} from "@/lib/categorias";
import type { CategoriaUsuario } from "@/lib/types";

/** Los nombres del sistema, normalizados, para no dejar duplicar uno. */
const NOMBRES_SISTEMA = new Set(
  (CATEGORIAS as readonly string[]).map(normalizarNombreCategoria),
);

export type ResultadoCategoria =
  | { ok: true; categoria: CategoriaUsuario }
  | { ok: false; error: string };

/**
 * Crea una categoría personalizada. Devuelve la fila creada para que el
 * cliente la agregue al selector y la seleccione al toque.
 */
export async function crearCategoria(
  nombreCrudo: string,
): Promise<ResultadoCategoria> {
  const nombre = nombreCrudo.trim();

  if (nombre === "") return { ok: false, error: "Poné un nombre." };
  if (nombre.length > MAX_CATEGORIA) {
    return { ok: false, error: `Máximo ${MAX_CATEGORIA} caracteres.` };
  }
  if (NOMBRES_SISTEMA.has(normalizarNombreCategoria(nombre))) {
    return { ok: false, error: "Esa categoría ya existe en el sistema." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Se cerró tu sesión. Volvé a entrar." };

  const { data, error } = await supabase
    .from("categorias")
    .insert({ nombre, usuario_id: user.id })
    .select("id, nombre")
    .single();

  if (error) {
    // 23505 = violación del índice único: ya la tenés.
    if (error.code === "23505") {
      return { ok: false, error: "Ya tenés una categoría con ese nombre." };
    }
    return { ok: false, error: error.message };
  }

  revalidar();
  return { ok: true, categoria: data as CategoriaUsuario };
}

export type ResultadoEliminar =
  | { ok: true }
  | { ok: false; error: string; enUso?: number };

/**
 * Elimina una categoría personalizada, pero sólo si no tiene transacciones.
 * Si las tiene, no borra y avisa cuántas: el usuario primero las recategoriza.
 */
export async function eliminarCategoria(
  id: string,
): Promise<ResultadoEliminar> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Se cerró tu sesión. Volvé a entrar." };

  // Traemos el nombre para poder contar sus transacciones (guardan el texto,
  // no el id de la categoría). RLS ya limita a las filas propias.
  const { data: categoria } = await supabase
    .from("categorias")
    .select("nombre")
    .eq("id", id)
    .single();

  if (!categoria) return { ok: false, error: "Esa categoría ya no existe." };

  const { count } = await supabase
    .from("transacciones")
    .select("id", { count: "exact", head: true })
    .eq("categoria", categoria.nombre);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      enUso: count ?? 0,
      error: `Tiene ${count} ${count === 1 ? "transacción" : "transacciones"}. Cambiales la categoría antes de borrarla.`,
    };
  }

  const { error } = await supabase.from("categorias").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidar();
  return { ok: true };
}

/** El selector aparece en varias pantallas: revalidamos todo el layout. */
function revalidar() {
  revalidatePath("/", "layout");
}

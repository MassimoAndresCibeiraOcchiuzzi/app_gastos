"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EstadoFormulario } from "@/lib/formulario";
import {
  aFilaTransaccion,
  validarTransaccion,
  type EntradaTransaccion,
} from "@/lib/validacion";

/** Cuántas filas acepta una importación de golpe. */
const MAX_IMPORTACION = 500;

export async function crearTransaccion(
  formData: FormData,
): Promise<EstadoFormulario> {
  const texto = (campo: string) => String(formData.get(campo) ?? "");

  const resultado = validarTransaccion({
    monto: texto("monto"),
    descripcion: texto("descripcion"),
    tipo: texto("tipo"),
    categoria: texto("categoria"),
    cuenta: texto("cuenta"),
    fecha: texto("fecha"),
  });

  if (!resultado.ok) return { ok: false, errores: resultado.errores };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Se cerró tu sesión. Volvé a entrar." };
  }

  const { error } = await supabase
    .from("transacciones")
    .insert(aFilaTransaccion(resultado.valor, user.id, "manual"));

  if (error) return { ok: false, error: error.message };

  revalidar();
  return { ok: true };
}

export type ResultadoImportacion =
  | { ok: true; importadas: number }
  | { ok: false; error: string };

/**
 * Inserta las filas que el usuario confirmó en la pantalla de importación.
 * Revalida todo lo que viene del cliente: que ya haya pasado por la tabla de
 * revisión no lo vuelve confiable.
 */
export async function importarTransacciones(
  entradas: EntradaTransaccion[],
): Promise<ResultadoImportacion> {
  if (!Array.isArray(entradas) || entradas.length === 0) {
    return { ok: false, error: "No hay filas para importar." };
  }

  if (entradas.length > MAX_IMPORTACION) {
    return {
      ok: false,
      error: `Son ${entradas.length} filas y el máximo por importación son ${MAX_IMPORTACION}.`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Se cerró tu sesión. Volvé a entrar." };
  }

  const filas = [];
  for (const [i, entrada] of entradas.entries()) {
    const resultado = validarTransaccion(entrada);
    if (!resultado.ok) {
      const problema = Object.values(resultado.errores)[0] ?? "Dato inválido.";
      return { ok: false, error: `Fila ${i + 1}: ${problema}` };
    }
    filas.push(aFilaTransaccion(resultado.valor, user.id, "pdf"));
  }

  const { error } = await supabase.from("transacciones").insert(filas);
  if (error) return { ok: false, error: error.message };

  revalidar();
  return { ok: true, importadas: filas.length };
}

export async function eliminarTransaccion(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (id === "") return;

  const supabase = await createClient();
  // La política de RLS ya limita el delete a las filas propias.
  await supabase.from("transacciones").delete().eq("id", id);

  revalidar();
}

/** "layout" alcanza a todas las pantallas, no sólo a la lista. */
function revalidar() {
  revalidatePath("/", "layout");
}

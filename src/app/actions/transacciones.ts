"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EstadoFormulario } from "@/lib/formulario";
import { esHashValido } from "@/lib/importacion";
import type { PedidoRegla } from "@/lib/reglas";
import { guardarReglas } from "@/lib/reglas-servidor";
import {
  aFilaTransaccion,
  validarTransaccion,
  type EntradaTransaccion,
} from "@/lib/validacion";

/** Cuántas filas acepta una importación de golpe. */
const MAX_IMPORTACION = 500;

/** Los campos del formulario de alta/edición, tal como llegan: todo texto. */
function leerFormulario(formData: FormData): EntradaTransaccion {
  const texto = (campo: string) => String(formData.get(campo) ?? "");
  return {
    monto: texto("monto"),
    descripcion: texto("descripcion"),
    tipo: texto("tipo"),
    categoria: texto("categoria"),
    cuenta: texto("cuenta"),
    fecha: texto("fecha"),
  };
}

export async function crearTransaccion(
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = validarTransaccion(leerFormulario(formData));

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Edita una transacción existente. Pasa por la misma validación que el alta
 * (`validarTransaccion`) y la base aplica los mismos CHECK: en Postgres un
 * CHECK vale para UPDATE igual que para INSERT. La política
 * `transacciones_update_propias` (supabase/schema.sql) limita el UPDATE a las
 * filas propias, y su WITH CHECK impide pasarle la fila a otro usuario.
 *
 * Sólo se tocan los campos del formulario: `origen`, `usuario_id` y
 * `created_at` quedan como estaban.
 *
 * Si viene `recordar=on`, además guarda la regla "este comercio → esta
 * categoría" para los próximos imports. Que la regla falle no deshace la
 * edición: se devuelve ok con un aviso.
 */
export async function editarTransaccion(
  id: string,
  formData: FormData,
): Promise<EstadoFormulario> {
  if (typeof id !== "string" || !UUID.test(id)) {
    return { ok: false, error: "No encontramos esa transacción." };
  }

  const resultado = validarTransaccion(leerFormulario(formData));
  if (!resultado.ok) return { ok: false, errores: resultado.errores };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Se cerró tu sesión. Volvé a entrar." };
  }

  // `.select` para saber si tocó una fila: con RLS, un id ajeno o borrado no
  // da error, da cero filas.
  const { data, error } = await supabase
    .from("transacciones")
    .update(resultado.valor)
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "No encontramos esa transacción. Puede que la hayas borrado.",
    };
  }

  revalidar();

  if (formData.get("recordar") === "on") {
    const reglas = await guardarReglas(supabase, user.id, [
      {
        descripcion: resultado.valor.descripcion,
        categoria: resultado.valor.categoria,
      },
    ]);
    if (!reglas.ok) {
      return {
        ok: true,
        aviso: `Guardamos el cambio, pero no pudimos recordar la categoría para este comercio: ${reglas.error}`,
      };
    }
  }

  return { ok: true };
}

export type ResultadoImportacion =
  | { ok: true; importadas: number; reglasGuardadas: number }
  | { ok: false; error: string };

/**
 * Inserta las filas que el usuario confirmó en la pantalla de importación.
 * Revalida todo lo que viene del cliente: que ya haya pasado por la tabla de
 * revisión no lo vuelve confiable.
 *
 * `hashResumen` es el SHA-256 del PDF que calculó /api/importar. Se registra
 * después de guardar las filas, para avisar si el mismo archivo se vuelve a
 * subir. Lo manda el cliente, así que en el peor caso alguien falsea su propio
 * historial de avisos: no toca montos ni datos de nadie más.
 *
 * `reglas` son las categorías que el usuario corrigió en la revisión y pidió
 * recordar. Se guardan después de las filas; si fallan, la importación igual
 * salió bien y sólo no se recuerdan.
 */
export async function importarTransacciones(
  entradas: EntradaTransaccion[],
  hashResumen?: string,
  reglas: PedidoRegla[] = [],
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

  // Las filas ya están guardadas: si registrar el hash falla, la importación
  // igual salió bien. Sólo se pierde el aviso de repetido para este archivo.
  if (esHashValido(hashResumen)) {
    const { error: errorHash } = await supabase
      .from("resumenes_importados")
      .upsert(
        { hash: hashResumen, usuario_id: user.id },
        { onConflict: "usuario_id,hash", ignoreDuplicates: true },
      );
    if (errorHash) {
      console.error("[importar] no se pudo registrar el hash del resumen:", errorHash);
    }
  }

  let reglasGuardadas = 0;
  if (Array.isArray(reglas) && reglas.length > 0) {
    const resultado = await guardarReglas(supabase, user.id, reglas);
    if (resultado.ok) reglasGuardadas = resultado.guardadas;
  }

  revalidar();
  return { ok: true, importadas: filas.length, reglasGuardadas };
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

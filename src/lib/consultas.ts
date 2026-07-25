import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CategoriaUsuario, Transaccion } from "@/lib/types";

const POR_PAGINA = 1000; // tope que devuelve PostgREST por request
const MAX_PAGINAS = 50;

type Opciones = {
  /** Inclusive. Si no va, arranca desde la primera transacción. */
  desde?: string;
  /** Exclusive. Si no va, llega hasta la última. */
  hasta?: string;
  /** Por defecto de la más nueva a la más vieja. */
  ascendente?: boolean;
};

/**
 * Trae las transacciones del usuario, paginando.
 * Sin la paginación, a partir de las 1000 filas PostgREST corta la respuesta
 * sin avisar y los totales darían mal de forma silenciosa.
 */
export async function traerTransacciones({
  desde,
  hasta,
  ascendente = false,
}: Opciones = {}): Promise<{
  transacciones: Transaccion[];
  error: string | null;
}> {
  const supabase = await createClient();
  const filas: Transaccion[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const inicio = pagina * POR_PAGINA;

    let consulta = supabase.from("transacciones").select("*");
    if (desde) consulta = consulta.gte("fecha", desde);
    if (hasta) consulta = consulta.lt("fecha", hasta);

    const { data, error } = await consulta
      .order("fecha", { ascending: ascendente })
      .order("created_at", { ascending: ascendente })
      .range(inicio, inicio + POR_PAGINA - 1);

    if (error) return { transacciones: filas, error: error.message };

    // `numeric` puede llegar como string según el driver: lo normalizamos acá.
    filas.push(...(data ?? []).map((t) => ({ ...t, monto: Number(t.monto) })));

    if ((data?.length ?? 0) < POR_PAGINA) break;
  }

  return { transacciones: filas, error: null };
}

/**
 * Trae las categorías personalizadas del usuario, alfabéticas.
 * Si la tabla todavía no existe (no corrieron el SQL), devuelve una lista vacía
 * en vez de romper: la app sigue andando con las categorías del sistema.
 */
export async function traerCategoriasUsuario(): Promise<CategoriaUsuario[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre")
    .order("nombre", { ascending: true });

  if (error) return [];
  return (data ?? []) as CategoriaUsuario[];
}

import { CATEGORIA_AJUSTES, colorDeCategoria } from "./categorias";
import { redondearCentavos } from "./formato";
import { buscarRegla, claveComercio } from "./reglas";
import type { Transaccion } from "./types";

/**
 * Gastos fijos: una marca informativa por transacción (`es_fijo`) y la
 * memoria de qué comercios se marcaron así, para pre-tildar la marca la
 * próxima vez. Puro (sin Supabase): lo usan el servidor y el navegador.
 *
 * La marca no toca ningún total: balance, categorías y presupuestos siguen
 * igual. Y nunca se completa un monto: sólo se pre-tilda la casilla.
 */

/**
 * ¿La descripción es de un comercio marcado como fijo? Misma normalización y
 * misma coincidencia que las reglas de categoría (palabras completas, sin
 * tildes, números sueltos ni cuotas): "Netflix.com" coincide con NETFLIX.
 */
export function esComercioFijo(descripcion: string, patrones: readonly string[]): boolean {
  if (patrones.length === 0) return false;
  return buscarRegla(descripcion, patrones.map((p) => ({ patron_comercio: p }))) !== null;
}

/** Sólo un egreso puede ser gasto fijo (ni ingresos ni el ajuste de impuestos). */
export function admiteFijo(tipo: string, categoria: string): boolean {
  return tipo === "egreso" && categoria !== CATEGORIA_AJUSTES;
}

/**
 * Lo que manda el cliente cuando el usuario cambió a mano la casilla respecto
 * de lo que se le sugirió: tildó un comercio nuevo (`fijo: true`) o destildó
 * uno que venía pre-tildado (`fijo: false`). Si no la tocó, no se manda nada.
 */
export type PedidoFijo = { descripcion: string; fijo: boolean };

/**
 * Traduce los pedidos a patrones para marcar y para olvidar. El patrón se
 * calcula acá (nunca se acepta uno del cliente). Si el mismo comercio aparece
 * varias veces, gana el último: es lo más reciente que hizo el usuario.
 */
export function cambiosFijos(pedidos: readonly PedidoFijo[]): {
  marcar: string[];
  olvidar: string[];
} {
  const porPatron = new Map<string, boolean>();
  for (const p of pedidos) {
    if (typeof p?.descripcion !== "string" || typeof p?.fijo !== "boolean") continue;
    const patron = claveComercio(p.descripcion);
    if (patron === null) continue;
    porPatron.delete(patron);
    porPatron.set(patron, p.fijo);
  }
  const marcar: string[] = [];
  const olvidar: string[] = [];
  for (const [patron, fijo] of porPatron) (fijo ? marcar : olvidar).push(patron);
  return { marcar, olvidar };
}

export type GastoFijo = {
  id: string;
  fecha: string;
  descripcion: string;
  categoria: string | null;
  color: string;
  monto: number;
};

/**
 * Los gastos fijos de un mes, de mayor a menor, con su total. Sólo egresos
 * marcados (`es_fijo`); si la columna todavía no existe, no hay ninguno.
 */
export function gastosFijosMes(
  transacciones: Transaccion[],
  mes: string,
): { gastos: GastoFijo[]; total: number } {
  const gastos = transacciones
    .filter((t) => t.es_fijo === true && t.tipo === "egreso" && t.fecha.startsWith(mes))
    .map((t) => ({
      id: t.id,
      fecha: t.fecha,
      descripcion: t.descripcion,
      categoria: t.categoria,
      color: colorDeCategoria(t.categoria),
      monto: t.monto,
    }))
    .sort((a, b) => b.monto - a.monto || a.descripcion.localeCompare(b.descripcion, "es"));
  return {
    gastos,
    total: redondearCentavos(gastos.reduce((acc, g) => acc + g.monto, 0)),
  };
}

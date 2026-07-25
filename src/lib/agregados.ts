import { CATEGORIA_AJUSTES } from "./categorias";
import { redondearCentavos } from "./formato";
import type { Transaccion } from "./types";

export type TotalCategoria = {
  categoria: string;
  monto: number;
  /** true sólo en la porción que junta la cola del ranking. */
  esResto?: boolean;
};
export type TotalMes = { mes: string; ingresos: number; egresos: number };

export function totalPorTipo(
  transacciones: Transaccion[],
  tipo: Transaccion["tipo"],
): number {
  return redondearCentavos(
    transacciones
      .filter((t) => t.tipo === tipo)
      .reduce((acc, t) => acc + t.monto, 0),
  );
}

/**
 * Egresos agrupados por categoría, de mayor a menor.
 * Las filas sin categoría caen en "Sin categoría" en vez de desaparecer.
 *
 * Se excluye "Ajustes tarjeta": no es un gasto real sino la reconciliación
 * neteada de impuestos, y su monto puede ser negativo — una porción negativa
 * en una torta no significa nada. Los egresos con monto ≤ 0 tampoco entran, por
 * las mismas razones.
 */
export function egresosPorCategoria(
  transacciones: Transaccion[],
): TotalCategoria[] {
  const totales = new Map<string, number>();

  for (const t of transacciones) {
    if (t.tipo !== "egreso") continue;
    if (t.categoria === CATEGORIA_AJUSTES) continue;
    const clave = t.categoria ?? "Sin categoría";
    totales.set(clave, (totales.get(clave) ?? 0) + t.monto);
  }

  return [...totales.entries()]
    .map(([categoria, monto]) => ({ categoria, monto: redondearCentavos(monto) }))
    .filter((c) => c.monto > 0)
    .sort((a, b) => b.monto - a.monto || a.categoria.localeCompare(b.categoria));
}

/** Suma los egresos que sí van a la torta (excluye ajustes y no-positivos). */
export function totalEgresosPorCategoria(transacciones: Transaccion[]): number {
  return redondearCentavos(
    egresosPorCategoria(transacciones).reduce((acc, c) => acc + c.monto, 0),
  );
}

/**
 * Deja las `maximo` categorías más grandes y junta el resto en una sola porción.
 * Una torta con muchas porciones finitas no se lee; a partir de ahí conviene
 * agrupar la cola.
 */
export function agruparCola(
  totales: TotalCategoria[],
  maximo: number,
): { visibles: TotalCategoria[]; agrupadas: number } {
  if (totales.length <= maximo) return { visibles: totales, agrupadas: 0 };

  const visibles = totales.slice(0, maximo - 1);
  const cola = totales.slice(maximo - 1);
  const monto = redondearCentavos(cola.reduce((acc, c) => acc + c.monto, 0));

  return {
    visibles: [
      ...visibles,
      { categoria: `Otras (${cola.length})`, monto, esResto: true },
    ],
    agrupadas: cola.length,
  };
}

/**
 * Ingresos y egresos por mes, con un cero explícito para los meses sin
 * movimientos: si no, el gráfico se saltearía meses y engañaría la lectura.
 */
export function totalesPorMes(
  transacciones: Transaccion[],
  meses: string[],
): TotalMes[] {
  const acumulado = new Map<string, { ingresos: number; egresos: number }>(
    meses.map((mes) => [mes, { ingresos: 0, egresos: 0 }]),
  );

  for (const t of transacciones) {
    const fila = acumulado.get(t.fecha.slice(0, 7));
    if (!fila) continue;
    if (t.tipo === "ingreso") fila.ingresos += t.monto;
    else fila.egresos += t.monto;
  }

  return meses.map((mes) => {
    const { ingresos, egresos } = acumulado.get(mes)!;
    return { mes, ingresos: redondearCentavos(ingresos), egresos: redondearCentavos(egresos) };
  });
}

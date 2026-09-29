import { CATEGORIA_AJUSTES, MAX_CATEGORIA, colorDeCategoria } from "./categorias";
import { egresoCategoriaMes } from "./dashboard";
import { MONTO_MAXIMO, diasDelMes, parsearMonto, redondearCentavos } from "./formato";
import type { Transaccion } from "./types";

/**
 * Presupuestos mensuales por categoría: un tope de gasto que se repite todos
 * los meses. Este módulo es puro (sin Supabase): calcula el progreso para el
 * Dashboard y valida lo que manda el formulario. Lo testean los tests.
 */

/** Un presupuesto guardado (ver supabase/presupuestos.sql). */
export type Presupuesto = { categoria: string; monto_mensual: number };

/**
 * Cuántos puntos por encima del ritmo del mes se tolera antes de avisar. Sin
 * margen, el día 1 (3% del mes) cualquier compra ya "va adelantada": el aviso
 * saltaría todo el tiempo y dejaría de leerse.
 */
export const MARGEN_RITMO = 10;

/**
 * - `en-ritmo`: gastado ≤ transcurrido del mes + margen, sin pasarse.
 * - `adelantado`: todavía dentro del presupuesto, pero gastando más rápido
 *   que lo que avanzó el mes (más `MARGEN_RITMO`). Sólo en el mes en curso.
 * - `excedido`: se gastó más que el presupuesto.
 */
export type EstadoPresupuesto = "en-ritmo" | "adelantado" | "excedido";

export type FilaPresupuesto = {
  categoria: string;
  color: string;
  presupuesto: number;
  /** Egresos del mes en la categoría (los mismos que la torta). */
  gastado: number;
  /** gastado / presupuesto, en %, entero. Puede pasar de 100. */
  porcentaje: number;
  /** presupuesto − gastado. Negativo si se pasó. */
  restante: number;
  estado: EstadoPresupuesto;
};

/**
 * Qué parte del mes pasó, de 0 a 100 (entero). El día de hoy cuenta como
 * transcurrido: el 12 de un mes de 30 días es 40%.
 *
 * Un mes que ya terminó es 100; uno futuro, 0. `hoy` es "YYYY-MM-DD" en hora
 * argentina (`hoyISO`): se pasa como argumento para poder testearlo.
 */
export function avanceDelMes(mes: string, hoy: string): number {
  const mesDeHoy = hoy.slice(0, 7);
  if (mes < mesDeHoy) return 100;
  if (mes > mesDeHoy) return 0;
  const dia = Number(hoy.slice(8, 10));
  return Math.round((dia / diasDelMes(mes)) * 100);
}

function estadoDe(porcentaje: number, avance: number): EstadoPresupuesto {
  if (porcentaje > 100) return "excedido";
  // Sólo con el mes a medio camino: uno cerrado ya no tiene ritmo, y uno
  // futuro (avance 0) no empezó.
  const aMedioCamino = avance > 0 && avance < 100;
  if (aMedioCamino && porcentaje > avance + MARGEN_RITMO) return "adelantado";
  return "en-ritmo";
}

/**
 * El progreso de cada presupuesto en un mes, del más gastado (en %) al menos:
 * lo que conviene mirar primero queda arriba.
 *
 * Aparecen todos los presupuestos, también los de categorías sin gasto este
 * mes (0%) o que en la torta caen en "Otras". Lo gastado es lo mismo que la
 * fila de la categoría en la torta: egresos del mes; las devoluciones no
 * restan (van aparte en el detalle).
 */
export function progresoPresupuestos(
  transacciones: Transaccion[],
  mes: string,
  presupuestos: readonly Presupuesto[],
  avance: number,
): FilaPresupuesto[] {
  return presupuestos
    .filter((p) => p.monto_mensual > 0)
    .map((p) => {
      const gastado = egresoCategoriaMes(transacciones, p.categoria, mes);
      const porcentaje = Math.round((gastado / p.monto_mensual) * 100);
      return {
        categoria: p.categoria,
        color: colorDeCategoria(p.categoria),
        presupuesto: p.monto_mensual,
        gastado,
        porcentaje,
        restante: redondearCentavos(p.monto_mensual - gastado),
        estado: estadoDe(porcentaje, avance),
      };
    })
    .sort(
      (a, b) =>
        b.porcentaje - a.porcentaje || a.categoria.localeCompare(b.categoria, "es"),
    );
}

/** Lo que manda el formulario: el monto como texto; vacío = sin presupuesto. */
export type EntradaPresupuesto = { categoria: string; monto: string };

export type ResultadoValidacionPresupuestos =
  | {
      ok: true;
      /** Las categorías con monto: se crean o actualizan. */
      guardar: Presupuesto[];
      /** Las categorías que quedaron vacías: se borra su presupuesto. */
      borrar: string[];
    }
  | { ok: false; errores: Record<string, string> };

/**
 * Valida el formulario de presupuestos entero. `validas` son las categorías
 * que el usuario puede presupuestar (las del sistema y sus propias): una que
 * no esté ahí se rechaza, así no quedan presupuestos de categorías fantasma.
 * Los errores van por categoría, para mostrarlos al lado de cada campo.
 */
export function validarPresupuestos(
  entradas: readonly EntradaPresupuesto[],
  validas: readonly string[],
): ResultadoValidacionPresupuestos {
  const permitidas = new Set(validas.filter((c) => c !== CATEGORIA_AJUSTES));
  const guardar: Presupuesto[] = [];
  const borrar: string[] = [];
  const errores: Record<string, string> = {};
  const vistas = new Set<string>();

  for (const entrada of entradas) {
    if (typeof entrada?.categoria !== "string") continue;
    if (typeof entrada?.monto !== "string") continue;

    const categoria = entrada.categoria.trim();
    if (
      categoria === "" ||
      categoria.length > MAX_CATEGORIA ||
      !permitidas.has(categoria) ||
      vistas.has(categoria)
    ) {
      continue;
    }
    vistas.add(categoria);

    if (entrada.monto.trim() === "") {
      borrar.push(categoria);
      continue;
    }

    const monto = parsearMonto(entrada.monto);
    if (monto === null) errores[categoria] = "Poné un número.";
    else if (monto <= 0) errores[categoria] = "Tiene que ser mayor a cero.";
    else if (monto > MONTO_MAXIMO) errores[categoria] = "Demasiado grande.";
    else guardar.push({ categoria, monto_mensual: monto });
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return { ok: true, guardar, borrar };
}

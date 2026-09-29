import {
  SIN_CATEGORIA,
  agruparCola,
  egresosPorCategoria,
} from "./agregados";
import { COLOR_SIN_CATEGORIA, colorDeCategoria } from "./categorias";
import { esDevolucion } from "./extraccion";
import { etiquetaMesCorta, redondearCentavos, sumarMeses } from "./formato";
import type { Transaccion } from "./types";

/**
 * Lo que el Dashboard muestra por categoría: la fila de la lista, su
 * comparación contra los meses anteriores y el detalle que se despliega.
 * Todo se calcula acá, en el servidor, a partir de las transacciones que la
 * página ya trae (6 meses): al cliente llega armado y abrir un detalle no
 * vuelve a consultar nada.
 */

/** Valor de `?cat=` que abre el grupo "Otras (N)" sin ninguna categoría adentro. */
export const CLAVE_OTRAS = "__otras__";

/** Meses anteriores que entran en el promedio de la comparación. */
const MESES_PROMEDIO = 3;

/**
 * Contra qué se compara el gasto del mes en una categoría:
 * - `promedio`: el promedio de los 3 meses anteriores (si hay 3 con historia).
 * - `mes`: el mes anterior más cercano con gasto en la categoría (si hay
 *   menos de 3 meses de historia).
 * - `nuevo`: no hay con qué comparar.
 * `porcentaje` es la variación redondeada: +35 = 35% más.
 */
export type Comparacion =
  | { tipo: "promedio"; porcentaje: number }
  | { tipo: "mes"; porcentaje: number; mes: string }
  | { tipo: "nuevo" };

/** Una transacción tal como la muestra el detalle (sólo lo necesario). */
export type Movimiento = {
  id: string;
  fecha: string;
  descripcion: string;
  cuenta: string | null;
  monto: number;
};

export type PuntoSerie = {
  mes: string;
  etiqueta: string;
  monto: number;
  /** El mes que se está mirando: va resaltado en el mini gráfico. */
  actual: boolean;
};

export type DetalleCategoria = {
  tipo: "categoria";
  /** Lo que va en `?cat=`: el nombre de la categoría. */
  clave: string;
  categoria: string;
  color: string;
  /** Egresos del mes en la categoría. Las devoluciones no restan. */
  monto: number;
  /** Porcentaje del total de la torta, con un decimal. null si no hay total. */
  porcentaje: number | null;
  comparacion: Comparacion;
  serie: PuntoSerie[];
  /** Egresos del mes, de mayor a menor monto. */
  movimientos: Movimiento[];
  /** Devoluciones del mes en esta categoría (ingresos), aparte. */
  devoluciones: { cantidad: number; total: number };
};

/** La porción "Otras (N)": al abrirla muestra las categorías que junta. */
export type GrupoOtras = {
  tipo: "otras";
  clave: typeof CLAVE_OTRAS;
  categoria: string;
  color: string;
  monto: number;
  porcentaje: number | null;
  agrupadas: DetalleCategoria[];
};

export type FilaCategoria = DetalleCategoria | GrupoOtras;

/** La categoría con la que se agrupa una transacción (null → "Sin categoría"). */
export function categoriaDe(t: Pick<Transaccion, "categoria">): string {
  return t.categoria ?? SIN_CATEGORIA;
}

const mesDe = (t: Pick<Transaccion, "fecha">) => t.fecha.slice(0, 7);

/** Egresos de una categoría en un mes. */
export function egresoCategoriaMes(
  transacciones: Transaccion[],
  categoria: string,
  mes: string,
): number {
  return redondearCentavos(
    transacciones
      .filter(
        (t) =>
          t.tipo === "egreso" && mesDe(t) === mes && categoriaDe(t) === categoria,
      )
      .reduce((acc, t) => acc + t.monto, 0),
  );
}

/** Variación porcentual redondeada de `actual` contra `referencia` (> 0). */
function variacion(actual: number, referencia: number): number {
  return Math.round(((actual - referencia) / referencia) * 100);
}

/**
 * Compara el gasto del mes en una categoría contra su historia.
 *
 * "Historia" es un mes con al menos una transacción de cualquier tipo: así un
 * mes en que la categoría no tuvo gasto cuenta como $0 en el promedio (gastar
 * en algo que no solía aparecer es justo lo que conviene ver), pero un mes en
 * que la app no se usaba no arrastra el promedio a cero.
 *
 * Con los 3 meses anteriores con historia, compara contra su promedio. Si hay
 * menos, contra el mes anterior más cercano en que la categoría tuvo gasto
 * (mirando hasta `mesesAtras` para atrás). Si no hay ninguno, es nueva.
 */
export function compararConHistoria(
  transacciones: Transaccion[],
  categoria: string,
  mes: string,
  mesesAtras = 5,
): Comparacion {
  const actual = egresoCategoriaMes(transacciones, categoria, mes);
  const conHistoria = new Set(transacciones.map(mesDe));

  const previos = Array.from({ length: MESES_PROMEDIO }, (_, i) =>
    sumarMeses(mes, -(i + 1)),
  );
  if (previos.every((m) => conHistoria.has(m))) {
    const promedio =
      previos.reduce(
        (acc, m) => acc + egresoCategoriaMes(transacciones, categoria, m),
        0,
      ) / MESES_PROMEDIO;
    return promedio > 0
      ? { tipo: "promedio", porcentaje: variacion(actual, promedio) }
      : { tipo: "nuevo" };
  }

  for (let i = 1; i <= mesesAtras; i++) {
    const m = sumarMeses(mes, -i);
    const monto = egresoCategoriaMes(transacciones, categoria, m);
    if (monto > 0) {
      return { tipo: "mes", porcentaje: variacion(actual, monto), mes: m };
    }
  }
  return { tipo: "nuevo" };
}

/**
 * Una devolución de la categoría: un ingreso que vino de un resumen (así
 * entran las devoluciones de comercios desde el PR de categorías) o cuya
 * descripción dice devolución/reintegro. No cualquier ingreso: el alta manual
 * pone "Otros" por defecto, y el sueldo no es una devolución de "Otros".
 */
export function esDevolucionDeCategoria(t: Transaccion): boolean {
  return t.tipo === "ingreso" && (t.origen === "pdf" || esDevolucion(t.descripcion));
}

function porcentajeDe(monto: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((monto / total) * 1000) / 10;
}

/** El detalle completo de una categoría en un mes. */
export function detalleCategoria(
  transacciones: Transaccion[],
  categoria: string,
  mes: string,
  meses: string[],
  totalMes: number,
): DetalleCategoria {
  const delMes = transacciones.filter(
    (t) => mesDe(t) === mes && categoriaDe(t) === categoria,
  );

  const movimientos = delMes
    .filter((t) => t.tipo === "egreso")
    .sort(
      (a, b) =>
        b.monto - a.monto ||
        b.fecha.localeCompare(a.fecha) ||
        a.descripcion.localeCompare(b.descripcion),
    )
    .map(({ id, fecha, descripcion, cuenta, monto }) => ({
      id,
      fecha,
      descripcion,
      cuenta,
      monto,
    }));

  const devoluciones = delMes.filter(esDevolucionDeCategoria);
  const monto = redondearCentavos(movimientos.reduce((acc, m) => acc + m.monto, 0));

  return {
    tipo: "categoria",
    clave: categoria,
    categoria,
    // Por nombre, también "Sin categoría": con el neutro se confundiría con
    // la porción "Otras", que es la que lo usa.
    color: colorDeCategoria(categoria),
    monto,
    porcentaje: porcentajeDe(monto, totalMes),
    comparacion: compararConHistoria(transacciones, categoria, mes),
    serie: meses.map((m) => ({
      mes: m,
      etiqueta: etiquetaMesCorta(m),
      monto: egresoCategoriaMes(transacciones, categoria, m),
      actual: m === mes,
    })),
    movimientos,
    devoluciones: {
      cantidad: devoluciones.length,
      total: redondearCentavos(devoluciones.reduce((acc, t) => acc + t.monto, 0)),
    },
  };
}

/**
 * Las filas de la lista de categorías del mes, en el mismo orden y con el
 * mismo agrupado que las porciones de la torta: las `maxPorciones - 1` más
 * grandes y, si hay más, una fila "Otras (N)" que contiene el resto.
 *
 * Usa `egresosPorCategoria`, así que excluye "Ajustes tarjeta" y los montos
 * que no suman: la lista y la torta dicen siempre lo mismo.
 */
export function filasCategoriasMes(
  transacciones: Transaccion[],
  mes: string,
  meses: string[],
  maxPorciones: number,
): { filas: FilaCategoria[]; total: number } {
  const totales = egresosPorCategoria(transacciones.filter((t) => mesDe(t) === mes));
  const total = redondearCentavos(totales.reduce((acc, c) => acc + c.monto, 0));
  const detalle = (categoria: string) =>
    detalleCategoria(transacciones, categoria, mes, meses, total);

  const { visibles, agrupadas } = agruparCola(totales, maxPorciones);
  const cola = agrupadas > 0 ? totales.slice(totales.length - agrupadas) : [];

  const filas: FilaCategoria[] = visibles.map((c) =>
    c.esResto
      ? {
          tipo: "otras",
          clave: CLAVE_OTRAS,
          categoria: c.categoria,
          color: COLOR_SIN_CATEGORIA,
          monto: c.monto,
          porcentaje: porcentajeDe(c.monto, total),
          agrupadas: cola.map((x) => detalle(x.categoria)),
        }
      : detalle(c.categoria),
  );

  return { filas, total };
}

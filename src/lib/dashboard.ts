import {
  SIN_CATEGORIA,
  agruparCola,
  egresosPorCategoria,
  totalPorTipo,
} from "./agregados";
import {
  CATEGORIA_AJUSTES,
  COLOR_SIN_CATEGORIA,
  colorDeCategoria,
} from "./categorias";
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
  return compararMontos(
    (m) => egresoCategoriaMes(transacciones, categoria, m),
    mes,
    new Set(transacciones.map(mesDe)),
    mesesAtras,
  );
}

/**
 * La regla de comparación, sin atarse a qué se compara: `montoDe(mes)` da el
 * monto de un mes (los egresos de una categoría, o los del mes entero) y
 * `conHistoria` los meses en que la app tuvo alguna transacción.
 */
function compararMontos(
  montoDe: (mes: string) => number,
  mes: string,
  conHistoria: Set<string>,
  mesesAtras: number,
): Comparacion {
  const actual = montoDe(mes);
  const previos = Array.from({ length: MESES_PROMEDIO }, (_, i) =>
    sumarMeses(mes, -(i + 1)),
  );
  if (previos.every((m) => conHistoria.has(m))) {
    const promedio =
      previos.reduce((acc, m) => acc + montoDe(m), 0) / MESES_PROMEDIO;
    return promedio > 0
      ? { tipo: "promedio", porcentaje: variacion(actual, promedio) }
      : { tipo: "nuevo" };
  }

  for (let i = 1; i <= mesesAtras; i++) {
    const m = sumarMeses(mes, -i);
    const monto = montoDe(m);
    if (monto > 0) {
      return { tipo: "mes", porcentaje: variacion(actual, monto), mes: m };
    }
  }
  return { tipo: "nuevo" };
}

/** Todos los egresos de un mes, con el ajuste de impuestos (igual que Movimientos). */
function egresosMes(transacciones: Transaccion[], mes: string): number {
  return totalPorTipo(
    transacciones.filter((t) => mesDe(t) === mes),
    "egreso",
  );
}

/** El número principal del Dashboard y lo que lo acompaña. */
export type ResumenMes = {
  /** Todos los egresos del mes: el mismo número que "Egresos" en Movimientos. */
  egresos: number;
  ingresos: number;
  /** ingresos − egresos, como en Movimientos. */
  balance: number;
  /**
   * El ajuste neteado de impuestos del mes ("Ajustes tarjeta"). Está en
   * `egresos` pero no en la torta: si no es 0, los dos totales difieren y la
   * pantalla lo aclara.
   */
  ajuste: number;
  /**
   * Contra el promedio de los 3 meses anteriores (o el mes anterior con
   * egresos, si hay menos historia). null cuando no se muestra: mes en curso,
   * mes sin egresos, o nada con qué comparar.
   */
  comparacion: Exclude<Comparacion, { tipo: "nuevo" }> | null;
};

/**
 * Arma el número principal del mes. En el mes en curso no hay comparación: un
 * mes a medio terminar siempre parece más barato que el promedio, y el
 * resumen de la tarjeta entra de golpe cuando se importa.
 */
export function resumenMes(
  transacciones: Transaccion[],
  mes: string,
  esMesEnCurso: boolean,
  mesesAtras = 5,
): ResumenMes {
  const delMes = transacciones.filter((t) => mesDe(t) === mes);
  const egresos = totalPorTipo(delMes, "egreso");
  const ingresos = totalPorTipo(delMes, "ingreso");
  const ajuste = redondearCentavos(
    delMes
      .filter((t) => t.tipo === "egreso" && t.categoria === CATEGORIA_AJUSTES)
      .reduce((acc, t) => acc + t.monto, 0),
  );

  let comparacion: ResumenMes["comparacion"] = null;
  if (!esMesEnCurso && egresos > 0) {
    const c = compararMontos(
      (m) => egresosMes(transacciones, m),
      mes,
      new Set(transacciones.map(mesDe)),
      mesesAtras,
    );
    comparacion = c.tipo === "nuevo" ? null : c;
  }

  return {
    egresos,
    ingresos,
    balance: redondearCentavos(ingresos - egresos),
    ajuste,
    comparacion,
  };
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

// --- Reparto de egresos por medio de pago (campo "Cuenta") -------------------

/** Dónde caen los egresos sin cuenta (null o vacía). Va siempre al final. */
export const SIN_CUENTA = "Sin cuenta";

/**
 * Cuántos segmentos con nombre entran en la barra. Con más cuentas, las más
 * chicas se juntan en "Otras (N)" (igual que la torta con las categorías):
 * más de 5-6 colores seguidos ya no se distinguen.
 */
const MAX_CUENTAS = 4;

/**
 * La clave con la que se agrupa una cuenta: sin mayúsculas, sin tildes y sin
 * espacios de más. Así "Tarjeta", "tarjeta " y "  TARJETA" son la misma, y
 * "Débito" y "Debito" también. "" si no hay cuenta.
 */
export function normalizarCuenta(cuenta: string | null): string {
  return (cuenta ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Colores fijos para las cuentas sugeridas en el formulario, en el orden
 * validado de la paleta: el color sigue a la cuenta, no a su lugar en el
 * ranking, así "Tarjeta" es del mismo color todos los meses.
 */
const COLOR_CUENTA: Record<string, string> = {
  tarjeta: "var(--viz-1)",
  efectivo: "var(--viz-2)",
  debito: "var(--viz-3)",
  transferencia: "var(--viz-4)",
};
/** Las cuentas escritas a mano reciben uno de los tonos que quedan, por hash. */
const COLORES_LIBRES = ["var(--viz-5)", "var(--viz-6)", "var(--viz-7)", "var(--viz-8)"];

function colorDeCuenta(clave: string): string {
  if (COLOR_CUENTA[clave]) return COLOR_CUENTA[clave];
  let h = 0;
  for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) | 0;
  return COLORES_LIBRES[Math.abs(h) % COLORES_LIBRES.length];
}

export type SegmentoCuenta = {
  /** Estable entre meses: la cuenta normalizada, u "__otras__" / "__sin__". */
  clave: string;
  etiqueta: string;
  monto: number;
  /** Porcentaje del total, con un decimal. */
  porcentaje: number;
  color: string;
  tipo: "cuenta" | "otras" | "sin-cuenta";
  /** Para "Otras (N)": las cuentas que junta. */
  agrupa?: string[];
};

/**
 * Cómo se reparten los egresos del mes entre las cuentas.
 *
 * Usa la misma base que la torta: egresos sin el ajuste de impuestos de la
 * tarjeta (no tiene cuenta, puede ser negativo, y un segmento negativo no
 * significa nada en una barra de proporciones). La etiqueta de cada cuenta es
 * la forma en que más la escribiste ("Tarjeta" le gana a "tarjeta " si la
 * usaste más veces así).
 */
export function repartoPorCuenta(
  transacciones: Transaccion[],
  mes: string,
  maxCuentas = MAX_CUENTAS,
): { segmentos: SegmentoCuenta[]; total: number } {
  const grupos = new Map<string, { monto: number; variantes: Map<string, number> }>();
  for (const t of transacciones) {
    if (t.tipo !== "egreso" || mesDe(t) !== mes) continue;
    if (t.categoria === CATEGORIA_AJUSTES) continue;
    const clave = normalizarCuenta(t.cuenta);
    const g = grupos.get(clave) ?? { monto: 0, variantes: new Map() };
    g.monto += t.monto;
    if (clave !== "") {
      const variante = (t.cuenta ?? "").trim().replace(/\s+/g, " ");
      g.variantes.set(variante, (g.variantes.get(variante) ?? 0) + 1);
    }
    grupos.set(clave, g);
  }

  const etiquetaDe = (variantes: Map<string, number>) =>
    [...variantes.entries()].sort(
      ([a, na], [b, nb]) =>
        nb - na ||
        // A igual uso, la que arranca con mayúscula ("Tarjeta" antes que "tarjeta").
        Number(/^\p{Lu}/u.test(b)) - Number(/^\p{Lu}/u.test(a)) ||
        a.localeCompare(b, "es"),
    )[0][0];

  const cuentas = [...grupos.entries()]
    .filter(([clave, g]) => clave !== "" && redondearCentavos(g.monto) > 0)
    .map(([clave, g]) => ({
      clave,
      etiqueta: etiquetaDe(g.variantes),
      monto: redondearCentavos(g.monto),
    }))
    .sort((a, b) => b.monto - a.monto || a.etiqueta.localeCompare(b.etiqueta, "es"));
  const sinCuenta = redondearCentavos(grupos.get("")?.monto ?? 0);

  const total = redondearCentavos(
    cuentas.reduce((acc, c) => acc + c.monto, 0) + Math.max(sinCuenta, 0),
  );
  const pct = (monto: number) => (total > 0 ? Math.round((monto / total) * 1000) / 10 : 0);

  const visibles = cuentas.length > maxCuentas ? cuentas.slice(0, maxCuentas - 1) : cuentas;
  const cola = cuentas.slice(visibles.length);

  const segmentos: SegmentoCuenta[] = visibles.map((c) => ({
    ...c,
    porcentaje: pct(c.monto),
    color: colorDeCuenta(c.clave),
    tipo: "cuenta",
  }));
  if (cola.length > 0) {
    const monto = redondearCentavos(cola.reduce((acc, c) => acc + c.monto, 0));
    segmentos.push({
      clave: "__otras__",
      etiqueta: `Otras (${cola.length})`,
      monto,
      porcentaje: pct(monto),
      color: COLOR_SIN_CATEGORIA,
      tipo: "otras",
      agrupa: cola.map((c) => c.etiqueta),
    });
  }
  if (sinCuenta > 0) {
    segmentos.push({
      clave: "__sin__",
      etiqueta: SIN_CUENTA,
      monto: sinCuenta,
      porcentaje: pct(sinCuenta),
      color: COLOR_SIN_CATEGORIA,
      tipo: "sin-cuenta",
    });
  }

  return { segmentos, total };
}

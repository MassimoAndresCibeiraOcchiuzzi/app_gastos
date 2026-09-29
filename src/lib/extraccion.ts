import { CATEGORIA_TARJETA } from "./categorias";
import { redondearCentavos } from "./formato";

/** Lo que le pedimos a Claude por cada consumo del resumen. */
export type ItemExtraido = {
  /**
   * Fecha de la operación original tal como figura en el resumen.
   * Es dato de referencia: lo que se guarda en la base es el mes en que se
   * paga el resumen, no esta fecha. Ver `importar-pdf.tsx`.
   */
  fecha: string;
  descripcion: string;
  /** Importe del consumo, siempre positivo. */
  monto: number;
};

/**
 * Palabras que delatan una línea de aritmética del resumen y no un consumo.
 *
 * Esto es una red de seguridad, no un reemplazo del prompt: el modelo se las
 * saltea de vez en cuando, y una línea de "SU PAGO" colada se registra como
 * ingreso y rompe el balance. El filtro corre en el servidor, con la respuesta
 * ya en la mano, así que no depende de que la IA obedezca.
 *
 * Si aparece un caso que la lista no cubre, se destilda a mano en la tabla de
 * revisión.
 */
export const EXCLUSIONES = [
  // Saldos, pagos y totales: aritmética del resumen. Nunca se importan.
  "SALDO ANTERIOR",
  "SALDO ACTUAL",
  "SU PAGO",
  "PAGO MINIMO",
  "PAGO MIN",
  "TOTAL CONSUMOS",
  "LIMITES DE COMPRA",
  "LIMITE DE COMPRA",
  "PROXIMO CIERRE",
  "PROXIMO VTO",
  "CUOTAS A VENCER",
  "DEBITAREMOS",
] as const;

/**
 * Impuestos, percepciones y sus devoluciones. Se debitan de la cuenta, pero
 * no son consumos: por defecto se descartan y sólo se importan si el usuario
 * tilda "Incluir impuestos" antes de subir el PDF.
 *
 * "DEVOLUCION" a secas también entra: si quedara afuera se cargaría como
 * consumo con el monto en positivo — o sea sumando cuando en realidad resta.
 */
export const IMPUESTOS = [
  "IIBB",
  "PERCEP",
  "IVA RG",
  "DB.RG",
  "DEV.IMP",
  "DEVOLUCION IMP",
  "DEVOLUCION",
  "REINTEGRO",
  "IMP. LEY",
  "IMPUESTO DE SELLOS",
] as const;

/**
 * De los impuestos, cuáles son un crédito a favor (devolución o reintegro).
 * Determinan que la fila se cargue como ingreso en vez de egreso.
 */
export const DEVOLUCIONES = [
  "DEV.IMP",
  "DEVOLUCION",
  "REINTEGRO",
] as const;

/** Descripción del ítem único que netea todos los impuestos del resumen. */
export const DESCRIPCION_AJUSTES = "Ajustes impuestos y percepciones tarjeta";

/**
 * MAYÚSCULAS, sin tildes y sin separadores.
 * Sacar los separadores es lo que hace que "DEV. IMP.", "DEV.IMP" y "DEVIMP"
 * caigan todas en la misma bolsa: cada banco puntúa distinto.
 */
export function normalizarDescripcion(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // las tildes que NFD dejó sueltas
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Busca la primera clave de `lista` contenida en la descripción normalizada. */
function buscarClave(
  descripcion: string,
  lista: readonly string[],
): string | null {
  const normalizada = normalizarDescripcion(descripcion);
  const i = lista
    .map(normalizarDescripcion)
    .findIndex((clave) => clave !== "" && normalizada.includes(clave));
  return i === -1 ? null : lista[i];
}

/** La palabra que marca al ítem como aritmética pura (siempre se descarta). */
export function motivoDeExclusion(descripcion: string): string | null {
  return buscarClave(descripcion, EXCLUSIONES);
}

/** La palabra que marca al ítem como impuesto/percepción/devolución, o null. */
export function motivoDeImpuesto(descripcion: string): string | null {
  return buscarClave(descripcion, IMPUESTOS);
}

/** Un impuesto que es crédito a favor: se carga como ingreso, no egreso. */
export function esDevolucion(descripcion: string): boolean {
  return buscarClave(descripcion, DEVOLUCIONES) !== null;
}

export type Descartado = { descripcion: string; motivo: string };

/** Una línea de impuesto con su aporte al neto (las devoluciones ya en negativo). */
export type LineaImpuesto = { descripcion: string; monto: number };

/**
 * El ajuste neteado de impuestos y percepciones de un resumen.
 *
 * `neto` puede dar negativo cuando las devoluciones superan a las percepciones
 * (como en el resumen de junio). Se guarda como un único egreso con ese monto:
 * un egreso negativo resta de los egresos del mes sin tocar los ingresos.
 * `lineas` es sólo el detalle, para que el usuario vea qué se neteó.
 */
export type Ajuste = { neto: number; lineas: LineaImpuesto[] };

/** El aporte de una línea al neto: los impuestos suman, las devoluciones restan. */
function aporteAlNeto(item: ItemExtraido): number {
  const magnitud = Math.abs(item.monto);
  return esDevolucion(item.descripcion) ? -magnitud : magnitud;
}

/**
 * Reparte lo que devolvió el modelo en consumos, ajuste de impuestos y ruido.
 *
 * El ruido (saldos, pagos, totales) siempre se descarta. Los impuestos y
 * percepciones se netean en un solo `ajuste` — y sólo si `incluirImpuestos`
 * es true; si no, van al mismo montón que el ruido. Los descartados se
 * devuelven en vez de tirarse: explican por qué el checksum puede no cerrar.
 *
 * El orden importa: primero ruido, después impuestos. "TOTAL CONSUMOS" tiene
 * que ganarle a cualquier coincidencia de impuesto en la misma línea.
 */
export function clasificarItems(
  items: ItemExtraido[],
  incluirImpuestos: boolean,
): {
  consumos: ItemExtraido[];
  ajuste: Ajuste | null;
  descartados: Descartado[];
} {
  const consumos: ItemExtraido[] = [];
  const lineas: LineaImpuesto[] = [];
  const descartados: Descartado[] = [];

  for (const item of items) {
    const ruido = motivoDeExclusion(item.descripcion);
    if (ruido !== null) {
      descartados.push({ descripcion: item.descripcion, motivo: ruido });
      continue;
    }

    const impuesto = motivoDeImpuesto(item.descripcion);
    if (impuesto !== null) {
      if (incluirImpuestos) {
        lineas.push({ descripcion: item.descripcion, monto: aporteAlNeto(item) });
      } else {
        descartados.push({ descripcion: item.descripcion, motivo: impuesto });
      }
      continue;
    }

    consumos.push(item);
  }

  const neto = redondearCentavos(lineas.reduce((acc, l) => acc + l.monto, 0));
  // Si no hubo impuestos, o netean a cero, no hay ajuste que cargar: sin él el
  // total ya cuadra (los impuestos se cancelan entre sí).
  const ajuste = lineas.length > 0 && neto !== 0 ? { neto, lineas } : null;

  return { consumos, ajuste, descartados };
}

/**
 * Traduce un ítem del modelo a los campos que se van a guardar.
 *
 * Todo entra como **egreso**: un resumen de tarjeta no genera ingresos, y las
 * líneas que sí venían con signo negativo en el PDF (pagos, devoluciones de
 * impuestos, saldos) son justamente las que el prompt ahora excluye. Si aun
 * así llegara un monto negativo, lo tomamos como gasto en vez de fabricar un
 * ingreso que rompa el balance. El tipo sigue siendo editable en la tabla.
 *
 * La categoría es fija: **"Tarjeta"** para todo lo importado de un resumen. El
 * usuario puede cambiarla fila por fila en la tabla de revisión.
 */
export function aCamposGuardables(item: ItemExtraido): {
  descripcion: string;
  monto: string;
  tipo: "egreso";
  categoria: string;
} {
  return {
    descripcion: item.descripcion,
    monto: Math.abs(item.monto).toFixed(2),
    tipo: "egreso",
    categoria: CATEGORIA_TARJETA,
  };
}

/**
 * Cómo se leyó el PDF. `texto` es el camino normal y preciso; `vision` es el
 * de respaldo para PDFs escaneados, donde el modelo lee las páginas como
 * imágenes y puede equivocarse con los importes.
 */
export type Metodo = "texto" | "vision";

/**
 * Lo que se debita de la cuenta, por moneda. Cada una va por separado: sumar
 * pesos con dólares no significa nada.
 */
export type TotalResumen = { pesos: number | null; dolares: number | null };

export const TOTAL_VACIO: TotalResumen = { pesos: null, dolares: null };

export type ResultadoExtraccion =
  | { ok: true; items: ItemExtraido[]; totalResumen: TotalResumen }
  | { ok: false; error: string };

/** Number finito y positivo, o null. Cualquier otra cosa se descarta. */
function montoOpcional(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  return Math.abs(valor);
}

/**
 * Valida lo que devolvió el modelo antes de mostrarlo.
 * La salida estructurada ya garantiza la forma, pero esto cubre el caso de que
 * el modelo se corte a mitad de camino o devuelva algo raro: preferimos un
 * mensaje claro antes que una pantalla rota.
 */
export function parsearRespuesta(texto: string): ResultadoExtraccion {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { ok: false, error: "La IA no devolvió un JSON válido." };
  }

  if (typeof datos !== "object" || datos === null || !("items" in datos)) {
    return { ok: false, error: "La respuesta de la IA no tiene el formato esperado." };
  }

  const items = (datos as { items: unknown }).items;
  if (!Array.isArray(items)) {
    return { ok: false, error: "La respuesta de la IA no tiene el formato esperado." };
  }

  // El total es opcional: si falta o viene raro, se sigue sin checksum en vez
  // de tirar toda la importación abajo.
  const crudo = (datos as { total_resumen?: unknown }).total_resumen;
  const totalResumen: TotalResumen =
    typeof crudo === "object" && crudo !== null
      ? {
          pesos: montoOpcional((crudo as Record<string, unknown>).pesos),
          dolares: montoOpcional((crudo as Record<string, unknown>).dolares),
        }
      : TOTAL_VACIO;

  const validos: ItemExtraido[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const { fecha, descripcion, monto } = item as Record<string, unknown>;

    if (typeof fecha !== "string") continue;
    if (typeof descripcion !== "string") continue;
    if (typeof monto !== "number" || !Number.isFinite(monto)) continue;

    validos.push({ fecha, descripcion: descripcion.trim(), monto });
  }

  return { ok: true, items: validos, totalResumen };
}

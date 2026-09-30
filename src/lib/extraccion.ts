import {
  CATEGORIA_POR_DEFECTO,
  CATEGORIAS_SUGERIBLES,
  resolverCategoria,
} from "./categorias";
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
  /**
   * El rubro que sugirió la IA ("Comida", "Transporte", una propia…), ya
   * validado contra las categorías del usuario: si no existía, "Otros".
   */
  categoria: string;
  /**
   * Si la categoría salió de una regla del usuario ("COTO" → Comida) y no de
   * la IA, el patrón de esa regla. Ver `aplicarReglas`.
   */
  regla?: string;
  /** El comercio fue marcado como gasto fijo antes: la casilla viene tildada. */
  esFijo?: boolean;
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
 * Se comparan por palabra completa (ver `buscarClave`), así que cada variante
 * que usan los bancos va escrita: "PERCEP" ya no agarra "PERCEPCION" ni
 * "PERCEPTRON". "DEVOLUCION" y "REINTEGRO" a secas NO están: sólo cuentan
 * como impuesto si van con el nombre del impuesto ("DEVOLUCION IMPUESTO",
 * "REINTEGRO IVA"). Una devolución de un comercio es un consumo más, que
 * `aCamposGuardables` carga como ingreso.
 */
export const IMPUESTOS = [
  "IIBB",
  "PERCEP",
  "PERCEPCION",
  "PERCEPCIONES",
  "IVA RG",
  "DB.RG",
  "DEV.IMP",
  "DEVOLUCION IMP",
  "DEVOLUCION IMPUESTO",
  "DEVOLUCION IMPUESTOS",
  "DEVOLUCION IVA",
  "REINTEGRO IMP",
  "REINTEGRO IMPUESTO",
  "REINTEGRO IMPUESTOS",
  "REINTEGRO IVA",
  "IMP. LEY",
  "IMPUESTO LEY",
  "IMPUESTO DE SELLOS",
] as const;

/**
 * Palabras de un crédito a favor (devolución o reintegro), sea de un impuesto
 * o de un comercio. Determinan el signo: en el ajuste de impuestos restan, y
 * un consumo que las lleva se carga como ingreso en vez de egreso.
 */
export const DEVOLUCIONES = [
  "DEV.IMP",
  "DEVOLUCION",
  "DEVOLUCIONES",
  "REINTEGRO",
  "REINTEGROS",
] as const;

/** Descripción del ítem único que netea todos los impuestos del resumen. */
export const DESCRIPCION_AJUSTES = "Ajustes impuestos y percepciones tarjeta";

/** MAYÚSCULAS, sin tildes y sin separadores: "Dev. Imp." → "DEVIMP". */
export function normalizarDescripcion(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // las tildes que NFD dejó sueltas
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Las palabras de un texto, en MAYÚSCULAS y sin tildes: "Dev. Imp." → [DEV, IMP].
 * La usan también las reglas por comercio (`reglas.ts`), para reconocer las
 * mismas variantes de escritura que el filtro.
 */
export function palabras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/**
 * ¿Aparece la clave como palabras completas y seguidas? Se comparan pegadas
 * (sin separadores), así cada banco puede puntuar distinto: la clave "DEV.IMP"
 * coincide con "DEV. IMP.", "DEV.IMP" y "DEVIMP". Pero nunca con un pedazo de
 * palabra: "PERCEP" no coincide con "PERCEPTRON", ni "SALDO ACTUAL" con
 * "SALDO ACTUALIZADO".
 */
export function contieneClave(tokens: string[], clave: string): boolean {
  for (let i = 0; i < tokens.length; i++) {
    let pegado = "";
    for (let j = i; j < tokens.length; j++) {
      pegado += tokens[j];
      if (pegado === clave) return true;
      if (!clave.startsWith(pegado)) break;
    }
  }
  return false;
}

/** La primera clave de `lista` que aparece en la descripción, o null. */
function buscarClave(
  descripcion: string,
  lista: readonly string[],
): string | null {
  const tokens = palabras(descripcion);
  return (
    lista.find((clave) => {
      const compacta = normalizarDescripcion(clave);
      return compacta !== "" && contieneClave(tokens, compacta);
    }) ?? null
  );
}

/** La palabra que marca al ítem como aritmética pura (siempre se descarta). */
export function motivoDeExclusion(descripcion: string): string | null {
  return buscarClave(descripcion, EXCLUSIONES);
}

/** La palabra que marca al ítem como impuesto/percepción/devolución, o null. */
export function motivoDeImpuesto(descripcion: string): string | null {
  return buscarClave(descripcion, IMPUESTOS);
}

/** Un crédito a favor (de impuesto o de comercio): resta en vez de sumar. */
export function esDevolucion(descripcion: string): boolean {
  return buscarClave(descripcion, DEVOLUCIONES) !== null;
}

/**
 * Una línea que el filtro sacó, con todo lo necesario para mostrarla como
 * fila destildada en la revisión: si el filtro se equivocó, se re-incluye.
 */
export type Descartado = ItemExtraido & { motivo: string };

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
      descartados.push({ ...item, motivo: ruido });
      continue;
    }

    const impuesto = motivoDeImpuesto(item.descripcion);
    if (impuesto !== null) {
      if (incluirImpuestos) {
        lineas.push({ descripcion: item.descripcion, monto: aporteAlNeto(item) });
      } else {
        descartados.push({ ...item, motivo: impuesto });
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
 * Entra como **egreso**, salvo que la descripción sea una devolución o un
 * reintegro ("DEVOLUCION COMPRA ZARA", "REINTEGRO PROMO"): eso es un crédito,
 * y como egreso sumaría en vez de restar. Va como **ingreso** y no como
 * egreso negativo porque en la base sólo el ajuste de impuestos puede ser
 * negativo. El signo del modelo no se usa (se le pide todo en positivo): un
 * negativo suelto no alcanza para fabricar un ingreso. El tipo sigue siendo
 * editable en la tabla.
 *
 * La categoría es el rubro que sugirió la IA, ya validado por
 * `parsearRespuesta` (también para devoluciones: una devolución de un
 * supermercado va en Comida, como ingreso). El usuario la puede cambiar fila
 * por fila en la tabla de revisión. Que salió de la tarjeta queda en la
 * cuenta, no en la categoría.
 */
export function aCamposGuardables(item: ItemExtraido): {
  descripcion: string;
  monto: string;
  tipo: "ingreso" | "egreso";
  categoria: string;
} {
  return {
    descripcion: item.descripcion,
    monto: Math.abs(item.monto).toFixed(2),
    tipo: esDevolucion(item.descripcion) ? "ingreso" : "egreso",
    categoria: item.categoria.trim() || CATEGORIA_POR_DEFECTO,
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
 *
 * `categoriasValidas` son las del usuario (sistema + propias, ver
 * `categoriasParaSugerir`). La categoría sugerida se valida contra esa lista
 * aunque el esquema ya la restrinja: una que no exista, falte o venga rota
 * queda en "Otros", nunca se inventa una.
 */
export function parsearRespuesta(
  texto: string,
  categoriasValidas: readonly string[] = CATEGORIAS_SUGERIBLES,
): ResultadoExtraccion {
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
    const { fecha, descripcion, monto, categoria_sugerida } = item as Record<
      string,
      unknown
    >;

    if (typeof fecha !== "string") continue;
    if (typeof descripcion !== "string") continue;
    if (typeof monto !== "number" || !Number.isFinite(monto)) continue;

    validos.push({
      fecha,
      descripcion: descripcion.trim(),
      monto,
      categoria: resolverCategoria(categoria_sugerida, categoriasValidas),
    });
  }

  return { ok: true, items: validos, totalResumen };
}

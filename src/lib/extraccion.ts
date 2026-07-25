import {
  CATEGORIAS_CONSUMO,
  CATEGORIA_POR_DEFECTO,
  esCategoriaValida,
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
  categoria_sugerida: string;
};

/**
 * Esquema de salida estructurada. Con esto la API garantiza que la respuesta
 * es JSON válido y que `categoria_sugerida` es una de las nuestras: no hace
 * falta rezar para que el modelo respete el formato.
 */
export const ESQUEMA_EXTRACCION = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description:
        "Un elemento por consumo del resumen. Nunca líneas de saldo, pago, impuesto, percepción ni total.",
      items: {
        type: "object",
        properties: {
          fecha: {
            type: "string",
            format: "date",
            description:
              "Fecha de la operación original tal como figura en el resumen, en formato YYYY-MM-DD.",
          },
          descripcion: {
            type: "string",
            description:
              "Nombre del comercio como figura en el resumen, limpio de códigos internos, pero conservando la indicación de cuota si la hay (por ejemplo 'Cuota 03/06').",
          },
          monto: {
            type: "number",
            description:
              "Importe del consumo en pesos, SIEMPRE POSITIVO. Un resumen de tarjeta sólo genera gastos: nunca devuelvas un monto negativo.",
          },
          categoria_sugerida: {
            type: "string",
            enum: [...CATEGORIAS_CONSUMO],
            description: "La categoría que mejor describe el movimiento.",
          },
        },
        required: ["fecha", "descripcion", "monto", "categoria_sugerida"],
        additionalProperties: false,
      },
    },
    total_resumen: {
      type: "object",
      description:
        "El monto que el banco efectivamente debita de la cuenta, para poder verificar la suma. Sale de SALDO ACTUAL o de la línea DEBITAREMOS DE SU C.A.",
      properties: {
        pesos: {
          anyOf: [{ type: "number" }, { type: "null" }],
          description:
            "Total a debitar en pesos. null si el resumen no lo dice.",
        },
        dolares: {
          anyOf: [{ type: "number" }, { type: "null" }],
          description:
            "Total a debitar en dólares. null si el resumen no opera en dólares.",
        },
      },
      required: ["pesos", "dolares"],
      additionalProperties: false,
    },
  },
  required: ["items", "total_resumen"],
  additionalProperties: false,
} as const;

/**
 * El prompt cambia según el toggle "Incluir impuestos": con `false` sólo pide
 * consumos; con `true` pide también cada línea de impuesto/percepción como un
 * ítem más. El resto (total del resumen, fechas, formato) es igual.
 */
export function promptExtraccion(incluirImpuestos: boolean): string {
  const queExtraer = incluirImpuestos
    ? `QUÉ EXTRAER — dos clases de línea
1. CONSUMOS: compras puntuales, con fecha, comprobante, nombre de un comercio e importe. Suelen estar bajo "DETALLE DE TRANSACCION", "DETALLE DE MOVIMIENTOS" o "CONSUMOS".
2. IMPUESTOS, PERCEPCIONES Y DEVOLUCIONES: IIBB, "IVA RG", "DB.RG", "RG 4815", "PERCEPCION", "IMP. LEY 25413", impuesto de sellos, y las devoluciones/reintegros de esos impuestos ("DEV. IMP.", "DEVOLUCION IMPUESTO", "REINTEGRO"). Devolvé cada una como un ítem individual, con su descripción tal cual figura. NO las agrupes ni las sumes entre sí.`
    : `QUÉ EXTRAER
Sólo las líneas que son una compra o consumo puntual: tienen fecha, número de comprobante, nombre de un comercio y un importe. Suelen estar bajo "DETALLE DE TRANSACCION", "DETALLE DE MOVIMIENTOS" o "CONSUMOS".`;

  const impuestosEnNoExtraer = incluirImpuestos
    ? ""
    : `\n- Impuestos, percepciones y sus devoluciones: IIBB, "IVA RG", "DB.RG", "RG 4815", "PERCEPCION", "IMP. LEY 25413", impuesto de sellos, "DEV. IMP.", "DEVOLUCION IMPUESTO", "REINTEGRO", intereses, punitorios, cargos administrativos y seguros de la propia tarjeta.`;

  const montoImpuestos = incluirImpuestos
    ? `\n- monto de impuestos y percepciones: su magnitud en pesos, en POSITIVO. No te preocupes por el signo de las devoluciones: devolvelas también en positivo, del signo nos ocupamos nosotros.
- categoria de impuestos y percepciones: usá "Servicios".`
    : "";

  return `Extraé de este resumen (de tarjeta, de cuenta bancaria o de billetera virtual) lo que se pide abajo y devolvelo como JSON.

${queExtraer}

QUÉ NO EXTRAER NUNCA
Lo que es aritmética del resumen y no una línea propia:
- Saldos: "SALDO ANTERIOR", "SALDO ACTUAL", "SALDO AL CIERRE".
- Totales y subtotales: "TOTAL CONSUMOS", "TOTAL CONSUMOS DE [nombre]", y cualquier total parcial por tarjeta adicional, por titular o por moneda.
- Pagos ya hechos: "SU PAGO", "SU PAGO EN PESOS", "SU PAGO EN USD", "PAGO RECIBIDO", "GRACIAS POR SU PAGO".
- "PAGO MINIMO", "PAGO TOTAL", límites de compra y de financiación.${impuestosEnNoExtraer}
- Cotizaciones de moneda, leyendas informativas, cuotas a vencer y próximos vencimientos.
- La línea "DEBITAREMOS DE SU C.A. ..." (va en total_resumen, no en items).

CÓMO DEVOLVER CADA LÍNEA
- fecha: la de la operación tal como figura en la línea, en formato YYYY-MM-DD. Si sólo aparecen día y mes, deducí el año del período del resumen; si el resumen abarca dos años (por ejemplo diciembre y enero), asigná a cada uno el que corresponda. En compras en cuotas es la fecha de la compra original, que puede ser de varios meses atrás: dejala como está.
- descripcion: el comercio (o el nombre del impuesto) como figura en el resumen, limpio de códigos internos, conservando la indicación de cuota si la hay (por ejemplo "SMARTPHONE XYZ - Cuota 03/06").
- monto de consumos: el importe en pesos argentinos, como número POSITIVO, sin símbolos ni separadores de miles y con punto para los decimales. Los consumos son gastos: nunca devuelvas un consumo con monto negativo.${montoImpuestos}
- categoria_sugerida de consumos: la que mejor describa el comercio, de la lista permitida. Si ninguna encaja, usá "Otros".

EL TOTAL DEL RESUMEN (campo total_resumen)
Es el monto que el banco efectivamente debita, y se usa como referencia para verificar la suma. Buscalo en este orden:
1. La línea "DEBITAREMOS DE SU C.A. ... LA SUMA DE $ [monto] + U$S [monto]", que suele estar al pie.
2. Si no está, "SALDO ACTUAL" (el del total del resumen, no el de una tarjeta adicional).
Nunca lo saques de "TOTAL CONSUMOS DE [nombre]": eso es un subtotal parcial de una tarjeta adicional, antes de impuestos, y no es lo que se paga.
Poné el importe en pesos en "pesos" y el de dólares en "dolares", cada uno en su moneda y SIN convertir ni sumarlos entre sí. Si el resumen no informa alguno de los dos, poné null.

CASOS PARTICULARES
- Consumos en dólares: NO los conviertas ni los mezcles con los pesos. Omitilos de items; el total en dólares va en total_resumen.dolares.
- No inventes líneas que no estén en el documento, y no omitas ninguna de las que sí están.
- Si el documento no es un resumen de cuenta, devolvé la lista vacía y los totales en null.`;
}

/** El prompt por defecto (sin impuestos), para el camino de visión y los tests. */
export const PROMPT_EXTRACCION = promptExtraccion(false);

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
    categoria: esCategoriaValida(item.categoria_sugerida)
      ? item.categoria_sugerida
      : CATEGORIA_POR_DEFECTO,
  };
}

/**
 * Cómo se leyó el PDF. `texto` es el camino normal y preciso; `vision` es el
 * de respaldo para PDFs escaneados, donde el modelo lee las páginas como
 * imágenes y puede equivocarse con los importes.
 */
export type Metodo = "texto" | "vision";

/**
 * Arma el mensaje para el camino de texto plano.
 *
 * El texto va primero y las instrucciones después: es el orden que mejor
 * funciona con documentos largos, y el mismo que tiene el camino de visión
 * (bloque `document` y después el prompt).
 */
export function mensajeConTexto(
  textoDelPdf: string,
  incluirImpuestos: boolean,
): string {
  return `<resumen>\n${textoDelPdf}\n</resumen>\n\n${promptExtraccion(incluirImpuestos)}\n\nTrabajá sobre el texto de arriba, que es el resumen completo tal como lo extrajimos del PDF. Los importes están tal cual figuran en el documento: copialos exactamente, sin redondear ni recalcular.`;
}

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
      categoria_sugerida:
        typeof categoria_sugerida === "string" ? categoria_sugerida : "Otros",
    });
  }

  return { ok: true, items: validos, totalResumen };
}

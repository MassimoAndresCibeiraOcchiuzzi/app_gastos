import "server-only";

/**
 * Lo que se le manda a Claude para extraer un resumen: el esquema de salida y
 * el prompt. Vive aparte de `extraccion.ts` porque ese módulo también lo usa
 * la pantalla de importación (en el navegador), y esto no tiene por qué viajar
 * al cliente. `server-only` hace que el build falle si alguien lo importa
 * desde un componente de cliente.
 */

/**
 * Esquema de salida estructurada. Con esto la API garantiza que la respuesta es
 * JSON válido con la forma esperada. Ya no se pide categoría por ítem: todo lo
 * importado entra como "Tarjeta" (ver `aCamposGuardables`).
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
        },
        required: ["fecha", "descripcion", "monto"],
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
    ? `\n- monto de impuestos y percepciones: su magnitud en pesos, en POSITIVO. No te preocupes por el signo de las devoluciones: devolvelas también en positivo, del signo nos ocupamos nosotros.`
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

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ESQUEMA_EXTRACCION,
  clasificarItems,
  mensajeConTexto,
  parsearRespuesta,
  promptExtraccion,
  type Metodo,
} from "@/lib/extraccion";
import { MAX_CARACTERES, extraerTexto } from "@/lib/pdf";

// Runtime Node explícito: la extracción de PDF (unpdf/pdfjs) y el SDK de
// Anthropic usan APIs de Node que el runtime Edge no tiene.
export const runtime = "nodejs";

/** Vercel corta los request bodies en 4.5 MB; nos quedamos abajo. */
const MAX_BYTES = 4 * 1024 * 1024;

const MODELO = "claude-opus-4-8";
/**
 * Extraer plata de un resumen es sensible a los errores: un monto mal leído
 * ensucia todos los totales. Vale la latencia extra. Bajalo a "medium" si
 * preferís que responda más rápido.
 */
const ESFUERZO = "high";
const MAX_TOKENS = 32000;

function error(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status });
}

export async function POST(request: NextRequest) {
  // 1. Sesión. RLS no interviene acá: esto es una llamada a la API de Claude
  //    que se paga con nuestra key, así que la puerta la controlamos nosotros.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return error("Se cerró tu sesión. Volvé a entrar.", 401);

  if (!process.env.ANTHROPIC_API_KEY) {
    return error("Falta configurar ANTHROPIC_API_KEY en el servidor.", 500);
  }

  // 2. El archivo y el toggle de impuestos.
  let archivo: File | null = null;
  let incluirImpuestos = false;
  try {
    const formData = await request.formData();
    const valor = formData.get("archivo");
    if (valor instanceof File) archivo = valor;
    incluirImpuestos = formData.get("incluirImpuestos") === "true";
  } catch {
    return error("No pudimos leer el archivo que subiste.", 400);
  }

  if (!archivo) return error("Elegí un archivo PDF.", 400);

  if (archivo.type !== "application/pdf") {
    return error("El archivo tiene que ser un PDF.", 400);
  }

  if (archivo.size === 0) return error("El PDF está vacío.", 400);

  if (archivo.size > MAX_BYTES) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    return error(`El PDF pesa ${mb} MB y el máximo son 4 MB.`, 413);
  }

  // De acá en adelante todo va en un try/catch: si algo explota (la extracción
  // de texto, el buffer, la API), lo logueamos con detalle y devolvemos un JSON
  // con `error`. Sin esto, un error no controlado devolvía un 500 en HTML y el
  // cliente sólo veía el mensaje genérico, sin pista de la causa.
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());

    // 3. Texto plano primero. Es más preciso con los importes (los caracteres
    //    salen del PDF, no de la lectura de una imagen) y gasta mucho menos.
    //    Si el PDF está escaneado no hay texto y caemos a visión.
    const extraido = await extraerTexto(bytes);
    const metodo: Metodo = extraido ? "texto" : "vision";

    // Log de contexto: aparece en la terminal de `npm run dev` y en los logs de
    // Vercel. Es la primera pista para diagnosticar un import que falla.
    console.info(
      `[importar] usuario=${user.id} archivo=${(archivo.size / 1024).toFixed(0)}KB ` +
        `metodo=${metodo}` +
        (extraido
          ? ` paginas=${extraido.paginas} chars=${extraido.texto.length}`
          : " (sin texto extraíble → visión)"),
    );

    if (extraido && extraido.texto.length > MAX_CARACTERES) {
      return error(
        "El resumen tiene demasiadas páginas. Probá subiéndolo en partes.",
        413,
      );
    }

    const contenido: Anthropic.ContentBlockParam[] = extraido
      ? [
          {
            type: "text",
            text: mensajeConTexto(extraido.texto, incluirImpuestos),
          },
        ]
      : [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: Buffer.from(bytes).toString("base64"),
            },
          },
          { type: "text", text: promptExtraccion(incluirImpuestos) },
        ];

    // 4. Claude.
    const anthropic = new Anthropic();
    let respuesta;

    try {
      // Streaming: un resumen largo puede tardar, y así no se corta la conexión
      // por timeout mientras el modelo trabaja.
      const stream = anthropic.messages.stream({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: {
          effort: ESFUERZO,
          format: { type: "json_schema", schema: ESQUEMA_EXTRACCION },
        },
        messages: [{ role: "user", content: contenido }],
      });
      respuesta = await stream.finalMessage();
    } catch (e) {
      // El error real de la API, con su nombre y status, al log del servidor.
      console.error("[importar] la llamada a Claude falló:", e);
      const { mensaje, status } = describirErrorIA(e, metodo);
      return error(mensaje, status);
    }

    if (respuesta.stop_reason === "refusal") {
      return error("La IA no pudo procesar este documento.", 422);
    }

    if (respuesta.stop_reason === "max_tokens") {
      return error(
        "El resumen es demasiado largo y la respuesta quedó cortada. Probá con menos páginas.",
        422,
      );
    }

    const texto = respuesta.content.find((b) => b.type === "text")?.text;
    if (!texto) return error("La IA no devolvió nada que podamos leer.", 422);

    const resultado = parsearRespuesta(texto);
    if (!resultado.ok) {
      console.error("[importar] no se pudo parsear la respuesta de la IA");
      return error(resultado.error, 422);
    }

    if (resultado.items.length === 0) {
      return error(
        "No encontramos movimientos en este PDF. ¿Seguro que es un resumen de cuenta o tarjeta?",
        422,
      );
    }

    // Red de seguridad: el prompt le pide al modelo qué traer y qué no, pero a
    // veces igual se cuela algo. Acá se clasifica por código, con la respuesta
    // ya en la mano, respetando el toggle: los impuestos se importan sólo si
    // estaba tildado; si no, van al mismo montón que los saldos y pagos.
    const { consumos, ajuste, descartados } = clasificarItems(
      resultado.items,
      incluirImpuestos,
    );

    if (consumos.length === 0 && ajuste === null) {
      return error(
        "En este PDF sólo encontramos saldos y pagos, ningún consumo.",
        422,
      );
    }

    return NextResponse.json(
      {
        items: consumos,
        ajuste,
        descartados,
        metodo,
        totalResumen: resultado.totalResumen,
        incluirImpuestos,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    // Cualquier cosa no controlada: la extracción, el buffer, base64, memoria…
    console.error("[importar] error inesperado en la ruta:", e);
    return error(
      "Error inesperado procesando el PDF. Revisá los logs del servidor para el detalle.",
      500,
    );
  }
}

/**
 * Traduce el error de la API de Claude a un mensaje claro + un status, y decide
 * según el `metodo` (texto vs visión) para dar una pista más útil.
 *
 * Se basa en el `status` HTTP del `APIError` en vez de en cada subclase: es más
 * robusto ante cambios del SDK. Los errores de conexión/timeout no son
 * `APIError` (no tienen status), así que van aparte.
 */
function describirErrorIA(
  e: unknown,
  metodo: Metodo,
): { mensaje: string; status: number } {
  if (e instanceof Anthropic.APIError) {
    const s = e.status ?? 0;
    if (s === 401)
      return {
        mensaje: "La ANTHROPIC_API_KEY del servidor no es válida o venció.",
        status: 500,
      };
    if (s === 403)
      return {
        mensaje:
          "La API key no tiene permiso para este modelo o se quedó sin crédito.",
        status: 402,
      };
    if (s === 413)
      return {
        mensaje: "El PDF es demasiado grande para la IA. Probá con menos páginas.",
        status: 413,
      };
    if (s === 429)
      return {
        mensaje: "La IA está al límite de uso. Esperá un minuto y probá de nuevo.",
        status: 429,
      };
    if (s === 400) {
      const pista =
        metodo === "vision"
          ? " El PDF no tenía texto seleccionable, así que se intentó leer como imagen y la IA no pudo: puede estar escaneado o protegido con contraseña."
          : "";
      return {
        mensaje: `La IA rechazó el archivo.${pista} También puede estar dañado o tener demasiadas páginas.`,
        status: 400,
      };
    }
    if (s === 500 || s === 502 || s === 503 || s === 529)
      return {
        mensaje:
          "La IA está sobrecargada o con problemas temporales. Probá de nuevo en un rato.",
        status: 502,
      };
    if (s === 408 || s === 504)
      return {
        mensaje:
          "La IA tardó demasiado en responder (timeout). Probá con un PDF más corto.",
        status: 504,
      };
    return {
      mensaje: `La IA devolvió un error (HTTP ${s || "?"}). Probá de nuevo en un rato.`,
      status: 502,
    };
  }

  if (e instanceof Anthropic.APIConnectionError) {
    const esTimeout = /timeout|timed out|ETIMEDOUT|aborted/i.test(
      e instanceof Error ? e.message : String(e),
    );
    return esTimeout
      ? {
          mensaje:
            "La IA tardó demasiado en responder (timeout de conexión). Probá con un PDF más corto.",
          status: 504,
        }
      : {
          mensaje:
            "No pudimos conectarnos con la IA. Revisá la conexión del servidor y probá de nuevo.",
          status: 502,
        };
  }

  return {
    mensaje:
      "Error inesperado al llamar a la IA. Revisá los logs del servidor para el detalle.",
    status: 500,
  };
}

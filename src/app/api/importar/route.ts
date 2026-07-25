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

  const bytes = new Uint8Array(await archivo.arrayBuffer());

  // 3. Texto plano primero. Es más preciso con los importes (los caracteres
  //    salen del PDF, no de la lectura de una imagen) y gasta mucho menos.
  //    Si el PDF está escaneado no hay texto y caemos a visión.
  const extraido = await extraerTexto(bytes);
  const metodo: Metodo = extraido ? "texto" : "vision";

  if (extraido && extraido.texto.length > MAX_CARACTERES) {
    return error(
      "El resumen tiene demasiadas páginas. Probá subiéndolo en partes.",
      413,
    );
  }

  const contenido: Anthropic.ContentBlockParam[] = extraido
    ? [{ type: "text", text: mensajeConTexto(extraido.texto, incluirImpuestos) }]
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
    return error(mensajeDeError(e), estadoDeError(e));
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
  if (!resultado.ok) return error(resultado.error, 422);

  if (resultado.items.length === 0) {
    return error(
      "No encontramos movimientos en este PDF. ¿Seguro que es un resumen de cuenta o tarjeta?",
      422,
    );
  }

  // Red de seguridad: el prompt le pide al modelo qué traer y qué no, pero a
  // veces igual se cuela algo. Acá se clasifica por código, con la respuesta ya
  // en la mano, respetando el toggle: los impuestos se importan sólo si estaba
  // tildado; si no, van al mismo montón que los saldos y pagos.
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
}

function estadoDeError(e: unknown): number {
  if (e instanceof Anthropic.RateLimitError) return 429;
  if (e instanceof Anthropic.AuthenticationError) return 500;
  if (e instanceof Anthropic.BadRequestError) return 400;
  return 502;
}

/** Mensajes en castellano y sin filtrar detalles internos al navegador. */
function mensajeDeError(e: unknown): string {
  if (e instanceof Anthropic.RateLimitError) {
    return "La IA está al límite de uso. Esperá un minuto y probá de nuevo.";
  }
  if (e instanceof Anthropic.AuthenticationError) {
    return "La ANTHROPIC_API_KEY del servidor no es válida.";
  }
  if (e instanceof Anthropic.BadRequestError) {
    return "La IA rechazó el PDF. Puede estar dañado, protegido con contraseña o tener demasiadas páginas.";
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return "No pudimos conectarnos con la IA. Revisá tu internet y probá de nuevo.";
  }
  if (e instanceof Anthropic.APIError) {
    return "La IA tuvo un problema procesando el PDF. Probá de nuevo en un rato.";
  }
  return "No pudimos procesar el PDF.";
}

import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

/**
 * Menos que esto y damos el PDF por escaneado: un resumen de verdad tiene
 * cientos de caracteres, y un PDF de imágenes devuelve texto vacío o basura.
 */
const MIN_CARACTERES = 80;

/** ~125k tokens. Más que esto es un PDF que no debería estar acá. */
export const MAX_CARACTERES = 500_000;

export type TextoPdf = { texto: string; paginas: number };

/** Cuenta lo que es contenido, ignorando espacios y los separadores de página. */
function caracteresUtiles(texto: string): number {
  return texto.replace(/--\s*\d+\s*of\s*\d+\s*--/gi, "").replace(/\s/g, "").length;
}

/**
 * Saca el texto plano del PDF.
 *
 * Usa `unpdf` (pdfjs empaquetado para serverless): extrae el mismo texto que
 * cualquier build de pdfjs, pero sin depender de APIs de navegador como
 * `DOMMatrix`, que no existen en las funciones de Vercel y rompían a `pdf-parse`
 * con "DOMMatrix is not defined".
 *
 * Devuelve `null` cuando no hay texto aprovechable — PDF escaneado, protegido o
 * que pdfjs no puede abrir. En ese caso el que llama cae al método de visión,
 * que es más caro y menos preciso pero funciona con imágenes.
 */
export async function extraerTexto(datos: Uint8Array): Promise<TextoPdf | null> {
  try {
    // `.slice()` no es paranoia: pdfjs transfiere el ArrayBuffer y lo deja
    // detached (length 0). Sin la copia, el fallback a visión se quedaría sin
    // bytes y la API respondería "PDF cannot be empty".
    const pdf = await getDocumentProxy(datos.slice());
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const texto = text.trim();

    if (caracteresUtiles(texto) < MIN_CARACTERES) return null;

    return { texto, paginas: totalPages };
  } catch {
    // PDF dañado, cifrado o con una estructura que pdfjs no entiende.
    // No es un error terminal: que lo intente la visión.
    return null;
  }
}

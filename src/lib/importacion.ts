import { ZONA_HORARIA } from "./formato";

/** Vercel corta los request bodies en 4.5 MB; nos quedamos abajo. */
export const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Lo que el multipart agrega alrededor del archivo (boundaries, headers de
 * cada parte, el campo `incluirImpuestos`). Son unos cientos de bytes; 64 KB
 * sobra y no deja pasar nada que importe.
 */
const MARGEN_MULTIPART = 64 * 1024;

/** Importaciones permitidas por usuario dentro de la ventana. */
export const LIMITE_IMPORTACIONES = 10;
export const VENTANA_HORAS = 24;

/**
 * Decide con el header Content-Length, antes de leer el cuerpo, si vale la
 * pena leerlo. Sin header (cuerpo chunked) no hay forma de saber cuánto va a
 * llegar sin leerlo entero, así que se rechaza: un `fetch` con FormData desde
 * el navegador siempre lo manda.
 */
export function revisarContentLength(
  header: string | null,
): "ok" | "falta" | "excede" {
  if (header === null || !/^\d+$/.test(header.trim())) return "falta";
  return Number(header) > MAX_BYTES + MARGEN_MULTIPART ? "excede" : "ok";
}

/** Firma con la que arranca todo PDF: "%PDF-". */
const FIRMA_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
export const LARGO_FIRMA_PDF = FIRMA_PDF.length;

/**
 * Mira los primeros bytes en vez de confiar en el `type` del archivo, que lo
 * pone el navegador (o cualquiera que arme la request a mano).
 */
export function esPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= FIRMA_PDF.length && FIRMA_PDF.every((b, i) => bytes[i] === b)
  );
}

const FORMATO_DISPONIBLE = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_HORARIA,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Mensaje para cuando se llegó al límite. `disponibleDesde` es el timestamp
 * que devuelve `registrar_importacion` (cuándo se libera el próximo lugar);
 * si no vino o no se puede leer, el mensaje no promete una hora.
 */
export function mensajeLimite(disponibleDesde: string | null): string {
  const base = `Llegaste al límite de ${LIMITE_IMPORTACIONES} importaciones en ${VENTANA_HORAS} horas.`;
  const fecha = disponibleDesde ? new Date(disponibleDesde) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) {
    return `${base} Probá de nuevo más tarde.`;
  }
  const partes = Object.fromEntries(
    FORMATO_DISPONIBLE.formatToParts(fecha).map((p) => [p.type, p.value]),
  );
  // Relleno a mano: según la versión de ICU, es-AR devuelve "9" aunque se
  // pida "2-digit".
  const dd = (valor: string) => valor.padStart(2, "0");
  return `${base} Vas a poder importar de nuevo a partir de las ${dd(partes.hour)}:${dd(partes.minute)} del ${dd(partes.day)}/${dd(partes.month)}.`;
}

/**
 * SHA-256 de los bytes del PDF, en hex. Identifica al archivo exacto para
 * avisar si ya se importó. Usa Web Crypto, que está en Node y en el navegador.
 */
export async function hashSha256(bytes: Uint8Array): Promise<string> {
  // Copia a un ArrayBuffer propio: `digest` no acepta vistas sobre un
  // SharedArrayBuffer y así el tipo queda claro.
  const copia = bytes.slice().buffer;
  const digest = await crypto.subtle.digest("SHA-256", copia);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Un hash como los que genera `hashSha256` (y exige el CHECK de la tabla). */
export function esHashValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^[0-9a-f]{64}$/.test(valor);
}

const FORMATO_FECHA = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_HORARIA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** "Este resumen ya fue importado el 03/09/2026. ¿Querés continuar igual?" */
export function mensajeDuplicado(importadoEl: string | null): string {
  const fecha = importadoEl ? new Date(importadoEl) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) {
    return "Este resumen ya fue importado antes. ¿Querés continuar igual?";
  }
  const partes = Object.fromEntries(
    FORMATO_FECHA.formatToParts(fecha).map((p) => [p.type, p.value]),
  );
  const dd = (valor: string) => valor.padStart(2, "0");
  return `Este resumen ya fue importado el ${dd(partes.day)}/${dd(partes.month)}/${partes.year}. ¿Querés continuar igual?`;
}

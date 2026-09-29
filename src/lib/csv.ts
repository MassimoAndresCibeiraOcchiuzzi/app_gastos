import type { Transaccion } from "./types";

/**
 * Separador de columnas. Coma es lo estándar y lo que esperan Google Sheets,
 * pandas y casi todo. Si vas a abrir el archivo haciendo doble clic en Excel
 * en español, cambialo por ";" y listo: Excel usa el separador de lista del
 * sistema, que en es-AR es punto y coma.
 */
export const SEPARADOR = ",";

export const COLUMNAS = [
  "fecha",
  "descripcion",
  "monto",
  "tipo",
  "categoria",
  "cuenta",
  "origen",
] as const;

/**
 * Caracteres con los que una celda puede arrancar y hacer que Excel la
 * interprete como fórmula. Le anteponemos una comilla simple para neutralizarla.
 * No incluimos "-": es demasiado común en texto normal y por sí solo casi nunca
 * arma una fórmula válida.
 */
const ARRANQUES_PELIGROSOS = ["=", "+", "@", "\t", "\r"];

/** Escapa una celda según RFC 4180 y desactiva fórmulas. */
export function escaparCelda(valor: string): string {
  const neutralizado = ARRANQUES_PELIGROSOS.some((c) => valor.startsWith(c))
    ? `'${valor}`
    : valor;

  const necesitaComillas =
    neutralizado.includes(SEPARADOR) ||
    neutralizado.includes('"') ||
    neutralizado.includes("\n") ||
    neutralizado.includes("\r");

  return necesitaComillas
    ? `"${neutralizado.replace(/"/g, '""')}"`
    : neutralizado;
}

export function filasACSV(filas: readonly (readonly string[])[]): string {
  // CRLF es lo que pide el RFC y lo que mejor le cae a Excel.
  return filas.map((f) => f.map(escaparCelda).join(SEPARADOR)).join("\r\n");
}

export function transaccionesACSV(transacciones: Transaccion[]): string {
  const filas = [
    [...COLUMNAS],
    ...transacciones.map((t) => [
      t.fecha,
      t.descripcion,
      // Punto decimal y sin separador de miles: así lo lee cualquier programa.
      t.monto.toFixed(2),
      t.tipo,
      t.categoria ?? "",
      t.cuenta ?? "",
      t.origen,
    ]),
  ];

  return filasACSV(filas);
}

/**
 * Todo el historial: la fecha de exportación.
 * "2026-07-23" -> "gastos_2026-07-23.csv"
 */
export function nombreArchivoExport(fecha: string): string {
  return `gastos_${fecha}.csv`;
}

/** Sin tildes ni mayúsculas: el nombre del archivo anda igual en cualquier sistema. */
const MESES_ARCHIVO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Un mes: su nombre y año.
 * "2026-09" -> "gastos_septiembre_2026.csv"
 */
export function nombreArchivoExportMes(mes: string): string {
  const nombre = MESES_ARCHIVO[Number(mes.slice(5, 7)) - 1];
  return `gastos_${nombre}_${mes.slice(0, 4)}.csv`;
}

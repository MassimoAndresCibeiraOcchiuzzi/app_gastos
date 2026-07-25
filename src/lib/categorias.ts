/**
 * Categorías de consumo: las que el usuario elige y las que la IA puede sugerir
 * para un gasto real. Para agregar/sacar una, editá sólo esta lista.
 */
export const CATEGORIAS_CONSUMO = [
  "Comida",
  "Transporte",
  "Suscripciones",
  "Alquiler",
  "Servicios",
  "Entretenimiento",
  "Salud",
  "Otros",
] as const;

/**
 * Categoría del ítem que netea impuestos y percepciones al importar un resumen.
 * Va aparte para no mezclarse con los gastos reales: no es una categoría de
 * consumo, es un ajuste de reconciliación con el resumen. Se excluye de la
 * torta de egresos por categoría (ver `agregados.ts`).
 */
export const CATEGORIA_AJUSTES = "Ajustes tarjeta";

/** Todas las categorías válidas para guardar. Consumos + el ajuste. */
export const CATEGORIAS = [...CATEGORIAS_CONSUMO, CATEGORIA_AJUSTES] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/** Categoría preseleccionada en el formulario. */
export const CATEGORIA_POR_DEFECTO: Categoria = "Otros";

export function esCategoriaValida(valor: unknown): valor is Categoria {
  return (
    typeof valor === "string" && (CATEGORIAS as readonly string[]).includes(valor)
  );
}

/** Sugerencias iniciales para el campo Cuenta (es texto libre igual). */
export const CUENTAS_SUGERIDAS = ["Efectivo", "Tarjeta", "Débito", "Transferencia"];

/**
 * Color de cada categoría en los gráficos. El color sigue a la categoría, no a
 * su posición en el ranking: si un mes Comida deja de ser la más grande, sigue
 * siendo azul. Los valores están en globals.css (`.viz`), que resuelve claro y
 * oscuro. Los 8 tonos de consumo son un orden validado para daltonismo; no hay
 * que inventar un noveno. "Ajustes tarjeta" usa el neutro porque no se dibuja
 * en la torta.
 */
export const COLOR_CATEGORIA: Record<Categoria, string> = {
  Comida: "var(--viz-1)",
  Transporte: "var(--viz-2)",
  Suscripciones: "var(--viz-3)",
  Alquiler: "var(--viz-4)",
  Servicios: "var(--viz-5)",
  Entretenimiento: "var(--viz-6)",
  Salud: "var(--viz-7)",
  Otros: "var(--viz-8)",
  [CATEGORIA_AJUSTES]: "var(--viz-resto)",
};

/** Color para categorías viejas o desconocidas que no están en la lista. */
export const COLOR_SIN_CATEGORIA = "var(--viz-resto)";

export function colorDeCategoria(categoria: string | null): string {
  return esCategoriaValida(categoria)
    ? COLOR_CATEGORIA[categoria]
    : COLOR_SIN_CATEGORIA;
}

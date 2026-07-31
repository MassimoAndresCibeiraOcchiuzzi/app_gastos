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
  "Tarjeta",
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

/**
 * Categoría fija que se asigna a TODO lo importado de un resumen de tarjeta.
 * La importación ya no pide una categoría por ítem a la IA: entra todo como
 * "Tarjeta" y el usuario recategoriza a mano en la tabla si quiere.
 */
export const CATEGORIA_TARJETA: Categoria = "Tarjeta";

export function esCategoriaValida(valor: unknown): valor is Categoria {
  return (
    typeof valor === "string" && (CATEGORIAS as readonly string[]).includes(valor)
  );
}

/** Sugerencias iniciales para el campo Cuenta (es texto libre igual). */
export const CUENTAS_SUGERIDAS = ["Efectivo", "Tarjeta", "Débito", "Transferencia"];

/**
 * Color fijo de algunas categorías en los gráficos. El color sigue a la
 * categoría, no a su posición en el ranking: si un mes Comida deja de ser la más
 * grande, sigue siendo azul. Los valores están en globals.css (`.viz`), que
 * resuelve claro y oscuro. Los 8 tonos son un orden validado para daltonismo.
 *
 * Es `Partial`: las categorías sin tono explícito (como "Tarjeta") caen al hash
 * de `colorDeCategoria`, igual que las personalizadas, en vez de forzar un
 * noveno tono inventado. "Ajustes tarjeta" usa el neutro porque no se dibuja.
 */
export const COLOR_CATEGORIA: Partial<Record<Categoria, string>> = {
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

/** Color para transacciones sin categoría (categoria = null). */
export const COLOR_SIN_CATEGORIA = "var(--viz-resto)";

/** Los 8 tonos validados, para asignar a las categorías personalizadas. */
const VIZ = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
  "var(--viz-5)",
  "var(--viz-6)",
  "var(--viz-7)",
  "var(--viz-8)",
] as const;

/** Hash estable de un texto a un índice de VIZ. Mismo nombre, mismo color. */
function indiceColor(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) {
    h = (h * 31 + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % VIZ.length;
}

/**
 * Color de una categoría en los gráficos.
 * Las del sistema tienen su tono fijo y validado. Las personalizadas reciben
 * uno de los 8 tonos según un hash de su nombre: así una categoría nueva
 * aparece con color propio sin tocar código (mismo nombre → mismo color
 * siempre). Puede colisionar con otra, pero la torta muestra el nombre al lado
 * de cada porción, así que el color nunca es el único canal.
 */
export function colorDeCategoria(categoria: string | null): string {
  if (categoria === null || categoria.trim() === "") return COLOR_SIN_CATEGORIA;
  // Del sistema con tono fijo → ese; del sistema sin tono ("Tarjeta") o
  // personalizada → el hash sobre los 8 validados.
  return COLOR_CATEGORIA[categoria as Categoria] ?? VIZ[indiceColor(categoria)];
}

/** Máximo de caracteres de un nombre de categoría (coincide con el CHECK del SQL). */
export const MAX_CATEGORIA = 40;

/**
 * Normaliza un nombre de categoría para comparar sin importar mayúsculas ni
 * espacios de los bordes. Es el mismo criterio que el índice único del SQL.
 */
export function normalizarNombreCategoria(nombre: string): string {
  return nombre.trim().toLowerCase();
}

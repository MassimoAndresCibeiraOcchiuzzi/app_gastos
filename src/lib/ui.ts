/**
 * Estilos de campo compartidos, para que inputs y selects se vean idénticos en
 * toda la app (mismo borde, alto, foco).
 *
 * Los <select> usan `bg-background` en vez de `bg-transparent`: un select
 * transparente rompe el desplegable nativo en modo oscuro (el popup sale claro
 * con texto claro = ilegible). Con un fondo opaco, `color-scheme` lo pinta bien.
 * El estilo del `<option>` se refuerza además en globals.css.
 */
const BASE =
  "w-full rounded-lg border border-black/15 text-sm outline-none transition-colors focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";

/** Campo estándar (formularios): input de texto. */
export const CAMPO = `${BASE} bg-transparent px-3 py-2`;
/** Select estándar (formularios): igual que CAMPO pero con fondo opaco. */
export const CAMPO_SELECT = `${BASE} bg-background px-3 py-2`;

/** Campo compacto (filas densas, como la tabla de revisión del import). */
export const CAMPO_COMPACTO = `${BASE} bg-transparent px-2.5 py-1.5`;
/** Select compacto. */
export const CAMPO_SELECT_COMPACTO = `${BASE} bg-background px-2.5 py-1.5`;

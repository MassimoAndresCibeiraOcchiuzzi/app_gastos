import type { Comparacion } from "@/lib/dashboard";
import { nombreMes } from "@/lib/formato";

/**
 * El indicador de comparación contra el promedio (o el mes anterior), el mismo
 * en las filas de categorías, en su detalle y en el número principal del
 * Dashboard. Sin hooks: sirve en componentes de servidor y de cliente.
 */

/**
 * Lo que sigue al símbolo en la versión larga ("más que el promedio…"): el
 * porcentaje ya lo muestra el símbolo, así que no se repite.
 */
function restoComparacion(c: Comparacion): string {
  if (c.tipo === "nuevo") {
    return "No hubo gasto en esta categoría en los meses anteriores.";
  }
  const contra =
    c.tipo === "promedio"
      ? "el promedio de los 3 meses anteriores"
      : `en ${nombreMes(c.mes)}`;
  if (c.porcentaje === 0) return `igual que ${contra}.`;
  return `${c.porcentaje > 0 ? "más" : "menos"} que ${contra}.`;
}

/** Texto completo de la comparación, para lectores de pantalla y `title`. */
export function textoComparacion(c: Comparacion): string {
  if (c.tipo === "nuevo") {
    return "Nuevo: no hubo gasto en esta categoría en los meses anteriores.";
  }
  const contra =
    c.tipo === "promedio"
      ? "el promedio de los 3 meses anteriores"
      : `${nombreMes(c.mes)}`;
  if (c.porcentaje === 0) {
    return c.tipo === "promedio" ? `Igual que ${contra}.` : `Igual que en ${contra}.`;
  }
  const cuanto = `${Math.abs(c.porcentaje).toLocaleString("es-AR")}% ${
    c.porcentaje > 0 ? "más" : "menos"
  }`;
  return c.tipo === "promedio" ? `${cuanto} que ${contra}.` : `${cuanto} que en ${contra}.`;
}

/**
 * ▲/▼ con el porcentaje. `largo` agrega el texto ("más que el promedio de
 * los 3 meses anteriores") y va inline: el que lo usa lo envuelve. Nunca sólo
 * color: el símbolo y el número dicen lo
 * mismo, y el texto completo va para lectores de pantalla (y como `title`).
 * Más gasto se tiñe con el tono de egreso y menos con el de ingreso.
 */
export default function IndicadorComparacion({
  comparacion: c,
  largo = false,
}: {
  comparacion: Comparacion;
  largo?: boolean;
}) {
  const texto = textoComparacion(c);
  if (largo) {
    return (
      <span>
        <Simbolo comparacion={c} />{" "}
        <span className="opacity-70">{restoComparacion(c)}</span>
      </span>
    );
  }
  return (
    <span title={texto}>
      <span aria-hidden>
        <Simbolo comparacion={c} />
      </span>
      <span className="sr-only">{texto}</span>
    </span>
  );
}

function Simbolo({ comparacion: c }: { comparacion: Comparacion }) {
  if (c.tipo === "nuevo") {
    return <span className="rounded bg-black/5 px-1 opacity-80 dark:bg-white/10">nuevo</span>;
  }
  const abs = `${Math.abs(c.porcentaje).toLocaleString("es-AR")}%`;
  if (c.porcentaje > 0) {
    return <span className="whitespace-nowrap tabular-nums text-egreso">▲ {abs}</span>;
  }
  if (c.porcentaje < 0) {
    return <span className="whitespace-nowrap tabular-nums text-ingreso">▼ {abs}</span>;
  }
  return <span className="whitespace-nowrap tabular-nums opacity-70">= 0%</span>;
}

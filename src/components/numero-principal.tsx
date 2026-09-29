import IndicadorComparacion from "@/components/indicador-comparacion";
import type { ResumenMes } from "@/lib/dashboard";
import { formatearARS, formatearARSConSigno, nombreMes } from "@/lib/formato";

/**
 * El número con el que arranca el Dashboard: "Gastaste $X en julio de 2026",
 * y debajo la comparación contra el promedio y el balance del mes.
 *
 * `egresos` y `balance` son los mismos números que muestra Movimientos. Si el
 * mes tiene ajuste de impuestos de la tarjeta, el total de la torta (que no
 * lo incluye) difiere de éste, y se aclara con una línea chica.
 *
 * En el mes en curso no hay comparación (`resumen.comparacion` llega null):
 * un mes a medio terminar siempre parece más barato que el promedio.
 */
export default function NumeroPrincipal({
  resumen: r,
  mes,
  esMesEnCurso,
}: {
  resumen: ResumenMes;
  mes: string;
  esMesEnCurso: boolean;
}) {
  // El espacio va como texto, no como margen: si no, un lector de pantalla
  // lee "2026(mes en curso)".
  const enCurso = esMesEnCurso && (
    <>
      {" "}
      <span className="text-sm font-normal opacity-60">(mes en curso)</span>
    </>
  );

  return (
    <section aria-label="Resumen del mes" className="px-1">
      {r.egresos > 0 ? (
        <h2 className="fuente-display text-lg font-medium leading-snug">
          Gastaste{" "}
          <span className="block py-0.5 text-4xl font-semibold tracking-tight tabular-nums">
            {formatearARS(r.egresos)}
          </span>{" "}
          en {nombreMes(mes)}
          {enCurso}
        </h2>
      ) : (
        <h2 className="fuente-display text-lg font-medium leading-snug">
          No hay egresos en {nombreMes(mes)}
          {enCurso}
        </h2>
      )}

      {/* Sin separador entre los dos: en el celular la comparación ocupa dos
          líneas y un "·" quedaba suelto al principio de la del balance. */}
      <p className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        {r.comparacion && (
          <IndicadorComparacion comparacion={r.comparacion} largo />
        )}
        <span>
          <span className="opacity-60">Balance</span>{" "}
          <span
            className={`font-medium tabular-nums ${
              r.balance > 0 ? "text-ingreso" : r.balance < 0 ? "text-egreso" : ""
            }`}
          >
            {formatearARSConSigno(r.balance)}
          </span>
        </span>
      </p>

      {r.ajuste !== 0 && (
        <p className="mt-1 text-xs opacity-60">
          Incluye {formatearARSConSigno(r.ajuste)} de ajuste de impuestos de la
          tarjeta, que no aparece en la torta.
        </p>
      )}
    </section>
  );
}

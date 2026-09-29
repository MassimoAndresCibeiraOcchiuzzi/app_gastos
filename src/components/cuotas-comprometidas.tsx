import type { ProyeccionCuotas } from "@/lib/cuotas";
import { MESES_CUOTAS } from "@/lib/cuotas";
import { etiquetaMesCorta, formatearARS, nombreMes, sumarMeses } from "@/lib/formato";

/**
 * Lo comprometido en cuotas para los meses que vienen: el número del mes que
 * viene, un mini gráfico hasta la última cuota y, a pedido, qué compras lo
 * componen. Se mira siempre desde hoy, como la meta de ahorro.
 *
 * Es un server component: el desplegable es un <details> nativo, no hace
 * falta JS.
 */
export default function CuotasComprometidas({
  proyeccion: p,
  mesHoy,
}: {
  proyeccion: ProyeccionCuotas;
  mesHoy: string;
}) {
  const mesQueViene = sumarMeses(mesHoy, 1);
  const nota = (
    <p className="text-xs opacity-60">
      Se detectan por la indicación de cuota en la descripción (&quot;Cuota
      03/06&quot;, &quot;C.03/06&quot;, &quot;Cta 3 de 6&quot;…) de lo cargado
      en los últimos {MESES_CUOTAS} meses. La cuota de este mes no se cuenta:
      ya está en los gastos del mes o se paga con el resumen actual.
    </p>
  );

  if (p.meses.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm opacity-60">
          No hay cuotas pendientes para los próximos meses.
        </p>
        {nota}
      </div>
    );
  }

  const siguiente = p.meses[0];
  const maximo = Math.max(...p.meses.map((m) => m.total));
  const ultimo = p.meses[p.meses.length - 1].mes;
  const detalle = new Map(p.compras.map((c) => [c.clave, c]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="fuente-display text-2xl font-semibold tabular-nums">
            {formatearARS(siguiente.total)}
          </span>
          <span className="text-sm opacity-60">
            comprometidos en cuotas para {nombreMes(mesQueViene)}
          </span>
        </p>
        <p className="text-xs opacity-60">
          En total quedan {formatearARS(p.totalPendiente)} en {p.compras.length}{" "}
          {p.compras.length === 1 ? "compra" : "compras"}, hasta{" "}
          {nombreMes(p.compras.reduce((a, c) => (c.mesUltima > a ? c.mesUltima : a), ultimo))}.
        </p>
      </div>

      {/* Mismo lenguaje que las mini barras del detalle de categoría: el mes
          que viene a full, los siguientes atenuados. */}
      <figure>
        <ul aria-hidden className="animar-entrada flex h-14 items-end gap-1.5">
          {p.meses.map((m, i) => (
            <li
              key={m.mes}
              title={`${etiquetaMesCorta(m.mes)}: ${formatearARS(m.total)}`}
              className="flex h-full flex-1 items-end justify-center"
            >
              <span
                className="block w-full max-w-7 rounded-t"
                style={
                  m.total > 0
                    ? {
                        height: `max(${(m.total / maximo) * 100}%, 3px)`,
                        backgroundColor: "var(--viz-egreso)",
                        opacity: i === 0 ? 1 : 0.35,
                      }
                    : { height: "1px", backgroundColor: "var(--viz-axis)" }
                }
              />
            </li>
          ))}
        </ul>
        <ul aria-hidden className="mt-1 flex gap-1.5 text-[10px]">
          {p.meses.map((m, i) => (
            <li
              key={m.mes}
              className={`flex-1 text-center ${i === 0 ? "font-medium" : "opacity-60"}`}
            >
              {etiquetaMesCorta(m.mes)}
            </li>
          ))}
        </ul>
        <ul className="sr-only">
          {p.meses.map((m) => (
            <li key={m.mes}>
              {nombreMes(m.mes)}: {formatearARS(m.total)} en cuotas
            </li>
          ))}
        </ul>
      </figure>

      {siguiente.cuotas.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs opacity-60 hover:opacity-100">
            Ver las {siguiente.cuotas.length}{" "}
            {siguiente.cuotas.length === 1 ? "compra" : "compras"} de{" "}
            {nombreMes(mesQueViene)}
          </summary>
          <ul className="mt-2 divide-y divide-black/5 dark:divide-white/10">
            {siguiente.cuotas.map((c) => {
              const d = detalle.get(c.clave);
              return (
                <li key={c.clave} className="flex items-start gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {c.nombre}
                      {c.copias > 1 && (
                        <span className="opacity-60"> ×{c.copias}</span>
                      )}
                    </span>
                    <span className="block text-xs opacity-60">
                      Cuota {c.numero} de {c.total}
                      {d &&
                        ` · quedan ${formatearARS(d.pendiente)} hasta ${nombreMes(d.mesUltima)}`}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatearARS(c.monto)}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {nota}
    </div>
  );
}

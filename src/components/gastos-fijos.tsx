"use client";

import { useId, useState } from "react";
import type { GastoFijo } from "@/lib/fijos";
import { formatearARS, formatearFechaCorta } from "@/lib/formato";

/**
 * Los gastos marcados como fijos en el mes elegido: el total, cuántos son y,
 * al desplegar, cuáles. El desplegable sigue el patrón de las filas de
 * categoría (botón de 44px con chevron, panel con fondo tenue).
 *
 * Es sólo informativo: la marca no cambia ningún otro número del Dashboard.
 */
export default function GastosFijos({
  gastos,
  total,
  egresosMes,
}: {
  gastos: GastoFijo[];
  total: number;
  /** Todos los egresos del mes (el número principal), para el porcentaje. */
  egresosMes: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();

  if (gastos.length === 0) {
    return (
      <p className="text-sm opacity-60">
        No hay gastos marcados como fijos en este mes. Tildá &quot;Gasto
        fijo&quot; al cargar o importar uno, y la próxima vez ese comercio
        viene tildado solo.
      </p>
    );
  }

  const cantidad = gastos.length;
  const porcentaje =
    egresosMes > 0 ? Math.round((total / egresosMes) * 1000) / 10 : null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        onClick={() => setAbierto((a) => !a)}
        className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${
          abierto ? "bg-black/5 dark:bg-white/10" : ""
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="fuente-display block text-2xl font-semibold tabular-nums">
            {formatearARS(total)}
          </span>
          <span className="block text-xs opacity-60">
            {cantidad} {cantidad === 1 ? "gasto fijo" : "gastos fijos"}
            {porcentaje !== null &&
              ` · ${porcentaje.toLocaleString("es-AR")}% de los egresos del mes`}
          </span>
        </span>
        <span className="shrink-0 text-xs opacity-60">
          {abierto ? "Ocultar" : "Ver cuáles"}
        </span>
        <Chevron abierto={abierto} />
      </button>

      {abierto && (
        <div
          id={idPanel}
          role="region"
          aria-label="Detalle de los gastos fijos"
          className="animar-entrada mx-1 rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.06]"
        >
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {gastos.map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-2 text-sm">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: g.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{g.descripcion}</span>
                  <span className="block truncate text-xs opacity-60">
                    {g.categoria ?? "Sin categoría"} · {formatearFechaCorta(g.fecha)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatearARS(g.monto)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs opacity-60">
            Es sólo una marca: estos gastos siguen contando en su categoría y en
            los totales como cualquier otro.
          </p>
        </div>
      )}
    </div>
  );
}

function Chevron({ abierto }: { abierto: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 opacity-50 transition-transform duration-150 motion-reduce:transition-none ${
        abierto ? "rotate-90" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

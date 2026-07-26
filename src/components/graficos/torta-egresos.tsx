"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatearARS } from "@/lib/formato";

export type PorcionCategoria = {
  categoria: string;
  monto: number;
  color: string;
};

/**
 * Torta (dona) de egresos por categoría.
 * El SVG va aria-hidden a propósito: la lista de abajo dice lo mismo con
 * palabras y números, así que es la que leen los lectores de pantalla. Esa
 * lista también es la "vista de tabla" del gráfico: ningún valor queda
 * accesible sólo pasando el mouse.
 *
 * Al pasar el mouse por una porción, el detalle aparece en el centro de la
 * dona (no en un globo flotante que tapaba el gráfico y quedaba ilegible): el
 * centro siempre tiene contraste y nunca se superpone con las porciones.
 */
export default function TortaEgresos({
  porciones,
  total,
}: {
  porciones: PorcionCategoria[];
  total: number;
}) {
  const [activo, setActivo] = useState<number | null>(null);

  if (porciones.length === 0) {
    return (
      <p className="py-10 text-center text-sm opacity-60">
        No hay egresos en este mes.
      </p>
    );
  }

  const foco = activo !== null ? porciones[activo] : null;

  return (
    <div>
      <div className="relative" aria-hidden>
        <ResponsiveContainer width="100%" height={210}>
          <PieChart>
            <Pie
              data={porciones}
              dataKey="monto"
              nameKey="categoria"
              innerRadius="60%"
              outerRadius="90%"
              paddingAngle={porciones.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
              onMouseEnter={(_, i) => setActivo(i)}
              onMouseLeave={() => setActivo(null)}
            >
              {porciones.map((p, i) => (
                <Cell
                  key={p.categoria}
                  fill={p.color}
                  // La porción con foco queda a full; el resto se atenúa apenas,
                  // así se distingue cuál se está mirando sin apagar la torta.
                  fillOpacity={activo === null || activo === i ? 1 : 0.35}
                  style={{ transition: "fill-opacity 0.15s ease-out" }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* max-w menor que el agujero de la dona (innerRadius 60% ≈ 126px): así
            ni un monto largo ni un nombre largo tocan el borde del círculo; si
            no entran, truncan antes de llegar. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {foco ? (
            <div className="flex max-w-[7rem] flex-col items-center gap-0.5">
              <span className="w-full truncate text-[11px] leading-tight opacity-70">
                {foco.categoria}
              </span>
              <span className="fuente-display w-full truncate text-sm font-semibold leading-tight tabular-nums">
                {formatearARS(foco.monto)}
              </span>
              <span className="text-[10px] leading-tight tabular-nums opacity-60">
                {porcentaje(foco.monto, total)}
              </span>
            </div>
          ) : (
            <div className="flex max-w-[7rem] flex-col items-center gap-0.5">
              <span className="text-[11px] leading-tight opacity-60">
                Total egresos
              </span>
              <span className="fuente-display w-full truncate text-base font-semibold leading-tight tabular-nums">
                {formatearARS(total)}
              </span>
            </div>
          )}
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {porciones.map((p, i) => (
          <li
            key={p.categoria}
            onMouseEnter={() => setActivo(i)}
            onMouseLeave={() => setActivo(null)}
            className={`flex items-center gap-2.5 rounded-md px-1 py-0.5 text-sm transition-colors ${
              activo === i ? "bg-black/5 dark:bg-white/10" : ""
            }`}
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="min-w-0 flex-1 truncate">{p.categoria}</span>
            <span className="shrink-0 tabular-nums opacity-60">
              {porcentaje(p.monto, total)}
            </span>
            <span className="w-28 shrink-0 text-right tabular-nums">
              {formatearARS(p.monto)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function porcentaje(monto: number, total: number): string {
  if (total <= 0) return "—";
  return `${((monto / total) * 100).toLocaleString("es-AR", {
    maximumFractionDigits: 1,
  })}%`;
}

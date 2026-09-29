"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatearARS } from "@/lib/formato";

export type PorcionCategoria = {
  categoria: string;
  monto: number;
  color: string;
};

/**
 * Torta (dona) de egresos por categoría. Sólo el gráfico: la lista que la
 * explica, y que es el control accesible, vive en `CategoriasMes`, que también
 * maneja qué porción está resaltada.
 *
 * El SVG va aria-hidden a propósito: la lista dice lo mismo con palabras y
 * números, y sus filas son botones. Tocar una porción es un atajo para mouse
 * y dedo que hace lo mismo que tocar su fila.
 *
 * El detalle de la porción resaltada aparece en el centro de la dona (no en
 * un globo flotante que tapaba el gráfico): el centro siempre tiene contraste
 * y nunca se superpone con las porciones.
 */
export default function TortaEgresos({
  porciones,
  total,
  activo,
  onResaltar,
  onElegir,
}: {
  porciones: PorcionCategoria[];
  total: number;
  /** Índice de la porción resaltada (hover o fila abierta), o null. */
  activo: number | null;
  onResaltar: (indice: number | null) => void;
  onElegir: (indice: number) => void;
}) {
  const foco = activo !== null ? porciones[activo] : null;

  return (
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
            onMouseEnter={(_, i) => onResaltar(i)}
            onMouseLeave={() => onResaltar(null)}
            onClick={(_, i) => onElegir(i)}
            className="cursor-pointer"
          >
            {porciones.map((p, i) => (
              <Cell
                key={p.categoria}
                fill={p.color}
                // La porción con foco queda a full; el resto se atenúa apenas,
                // así se distingue cuál se está mirando sin apagar la torta.
                fillOpacity={activo === null || activo === i ? 1 : 0.35}
                style={{ transition: "fill-opacity 0.15s ease-out", outline: "none" }}
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
              {porcentajeTexto(foco.monto, total)}
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
  );
}

function porcentajeTexto(monto: number, total: number): string {
  if (total <= 0) return "—";
  return `${((monto / total) * 100).toLocaleString("es-AR", {
    maximumFractionDigits: 1,
  })}%`;
}

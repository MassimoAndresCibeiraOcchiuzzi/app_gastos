"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatearARS, formatearCompacto, nombreMes } from "@/lib/formato";

export type BarraMes = {
  mes: string;
  etiqueta: string;
  ingresos: number;
  egresos: number;
};

/**
 * Ingresos vs egresos, barras agrupadas.
 * Verde/rojo es la convención del resto de la app, pero ese par queda justo en
 * el límite de separación para daltonismo (protan): por eso el orden es siempre
 * el mismo (ingreso a la izquierda), hay leyenda fija y la tabla de abajo tiene
 * los números. El color nunca es el único canal.
 *
 * Tocar un mes (en cualquier lugar de su columna, no sólo sobre la barra)
 * cambia el mes del Dashboard, igual que el selector de mes: misma URL
 * (`?mes=`) y mismo `router.push`. Mientras carga, los demás meses se
 * atenúan, así el toque tiene respuesta al instante. El gráfico es
 * aria-hidden; para teclado y lectores de pantalla, los meses de la tabla
 * "Ver los números" son links que hacen lo mismo.
 *
 * La columna tocada se calcula con la posición del toque, no con el
 * `onClick` de recharts: ése informa la columna "activa", que recharts
 * actualiza al mover el mouse. Con el dedo no hay movimiento previo, y el
 * click llegaba con la primera columna en vez de la tocada.
 */
export default function BarrasMeses({
  datos,
  mesSeleccionado,
}: {
  datos: BarraMes[];
  /** El mes que muestra el Dashboard: tocarlo no hace nada. */
  mesSeleccionado: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const [cargando, iniciar] = useTransition();
  const [tocado, setTocado] = useState<string | null>(null);

  const hrefMes = (mes: string) => `${ruta}?mes=${mes}`;

  function irAMes(indice: number) {
    const mes = datos[indice]?.mes;
    if (!mes || mes === mesSeleccionado) return;
    setTocado(mes);
    iniciar(() => router.push(hrefMes(mes)));
  }

  /** Qué columna (mes) cae bajo el toque, con las medidas del gráfico. */
  function alTocar(e: React.MouseEvent<HTMLDivElement>) {
    const caja = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - caja.left;
    const izquierda = MARGEN.left + ANCHO_EJE_Y;
    const derecha = caja.width - MARGEN.right;
    if (x < izquierda || x > derecha || datos.length === 0) return;
    const ancho = (derecha - izquierda) / datos.length;
    irAMes(Math.min(datos.length - 1, Math.floor((x - izquierda) / ancho)));
  }

  /** Mientras carga el mes tocado, los demás se atenúan. */
  const opacidad = (mes: string) => (cargando && tocado !== mes ? 0.35 : 1);

  return (
    <div>
      <ul className="mb-3 flex gap-4 text-xs">
        <ClaveLeyenda color="var(--viz-ingreso)" etiqueta="Ingresos" />
        <ClaveLeyenda color="var(--viz-egreso)" etiqueta="Egresos" />
      </ul>

      <div aria-hidden onClick={alTocar}>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart
            data={datos}
            margin={MARGEN}
            // recharts fija `cursor: default` en su contenedor: la manito
            // tiene que ir acá, no en un div de afuera.
            style={{ cursor: "pointer" }}
            // Sin la capa de accesibilidad de recharts: hace el SVG enfocable
            // (tabindex=0) adentro de un contenedor aria-hidden, y al tocarlo
            // quedaba con el contorno de foco. La versión accesible es la
            // tabla "Ver los números", con links.
            accessibilityLayer={false}
            barGap={2}
            barCategoryGap="24%"
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
            <XAxis
              dataKey="etiqueta"
              tickLine={false}
              axisLine={{ stroke: "var(--viz-axis)" }}
              tick={{ fill: "var(--viz-muted)", fontSize: 11 }}
              interval={0}
            />
            <YAxis
              tickFormatter={formatearCompacto}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--viz-muted)", fontSize: 11 }}
              width={ANCHO_EJE_Y}
            />
            <Tooltip
              cursor={{ fill: "var(--viz-grid)", fillOpacity: 0.4 }}
              content={<Globo />}
            />
            <Bar
              dataKey="ingresos"
              name="Ingresos"
              fill="var(--viz-ingreso)"
              radius={[4, 4, 0, 0]}
              maxBarSize={26}
              isAnimationActive={false}
            >
              {datos.map((d) => (
                <Cell key={d.mes} fillOpacity={opacidad(d.mes)} style={TRANSICION} />
              ))}
            </Bar>
            <Bar
              dataKey="egresos"
              name="Egresos"
              fill="var(--viz-egreso)"
              radius={[4, 4, 0, 0]}
              maxBarSize={26}
              isAnimationActive={false}
            >
              {datos.map((d) => (
                <Cell key={d.mes} fillOpacity={opacidad(d.mes)} style={TRANSICION} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs opacity-60 hover:opacity-100">
          Ver los números
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/10 text-left dark:border-white/15">
                <th scope="col" className="py-1.5 pr-2 font-medium">
                  Mes
                </th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                  Ingresos
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Egresos
                </th>
              </tr>
            </thead>
            <tbody>
              {datos.map((d) => (
                <tr
                  key={d.mes}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                    {d.mes === mesSeleccionado ? (
                      <span aria-current="true" className="font-medium">
                        {d.etiqueta}
                      </span>
                    ) : (
                      <Link
                        href={hrefMes(d.mes)}
                        aria-label={`Ver ${nombreMes(d.mes)}`}
                        className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
                      >
                        {d.etiqueta}
                      </Link>
                    )}
                  </th>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {formatearARS(d.ingresos)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatearARS(d.egresos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/**
 * Medidas del gráfico. Las usan el dibujo y `alTocar` para ubicar la columna
 * tocada: si cambian en un lado, cambian en el otro.
 */
const MARGEN = { top: 4, right: 4, left: 0, bottom: 0 };
const ANCHO_EJE_Y = 58;

/** La misma transición que usa la torta para atenuar porciones. */
const TRANSICION = { transition: "fill-opacity 0.15s ease-out" };

function ClaveLeyenda({ color, etiqueta }: { color: string; etiqueta: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="opacity-70">{etiqueta}</span>
    </li>
  );
}

function Globo({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: string | number;
  payload?: readonly { name?: string | number; value?: number; fill?: string }[];
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-black/10 bg-[var(--viz-surface)] px-3 py-2 text-xs shadow-sm dark:border-white/15">
      <div className="font-medium">{label}</div>
      {payload.map((serie) => (
        <div key={String(serie.name)} className="mt-0.5 flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: serie.fill }}
          />
          <span className="opacity-70">{serie.name}</span>
          <span className="tabular-nums">{formatearARS(serie.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import TortaEgresos from "@/components/graficos/torta-egresos";
import type {
  Comparacion,
  DetalleCategoria,
  FilaCategoria,
  GrupoOtras,
  Movimiento,
  PuntoSerie,
} from "@/lib/dashboard";
import {
  formatearARS,
  formatearARSConSigno,
  formatearFechaCorta,
  nombreMes,
} from "@/lib/formato";

/** Cuántas transacciones muestra el detalle antes de "Ver N más". */
const MOVIMIENTOS_VISIBLES = 10;

/**
 * Egresos del mes por categoría: la dona y, debajo, la lista que la explica.
 *
 * Cada fila es un botón que despliega el detalle de su categoría justo debajo
 * (tocar la porción de la dona hace lo mismo). Sólo uno abierto a la vez. La
 * porción "Otras (N)" despliega las categorías que agrupa, y cada una abre su
 * propio detalle adentro.
 *
 * La categoría abierta vive en la URL (`?cat=`), así el botón "atrás" del
 * navegador o de la PWA cierra el detalle en vez de salir del Dashboard. Se
 * escribe con `window.history.pushState`/`replaceState`, que Next sincroniza
 * con `useSearchParams` sin volver a pedir la página al servidor: abrir y
 * cerrar es instantáneo. Todos los datos ya vienen armados en `filas`.
 */
export default function CategoriasMes({
  filas,
  total,
  esMesEnCurso,
}: {
  filas: FilaCategoria[];
  total: number;
  esMesEnCurso: boolean;
}) {
  const params = useSearchParams();
  const ruta = usePathname();
  const cat = params.get("cat");
  const [hover, setHover] = useState<number | null>(null);
  const filasRef = useRef<(HTMLLIElement | null)[]>([]);
  const idBase = useId();

  // Si la apertura actual la agregamos nosotros al historial, cerrar es
  // volver atrás (así no queda una entrada de más). Si vino en el link, o ya
  // se volvió atrás, cerrar reemplaza la URL.
  const agregadoAlHistorial = useRef(false);
  useEffect(() => {
    if (cat === null) agregadoAlHistorial.current = false;
  }, [cat]);

  const otras = filas.find((f): f is GrupoOtras => f.tipo === "otras");
  let abierta: string | null = null;
  let abiertaEnOtras: string | null = null;
  if (cat !== null) {
    if (filas.some((f) => f.clave === cat)) abierta = cat;
    else if (otras?.agrupadas.some((c) => c.clave === cat)) {
      abierta = otras.clave;
      abiertaEnOtras = cat;
    }
  }

  function navegar(nueva: string | null) {
    const p = new URLSearchParams(params.toString());
    if (nueva === null) {
      if (agregadoAlHistorial.current) {
        window.history.back();
        return;
      }
      p.delete("cat");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `${ruta}?${qs}` : ruta);
      return;
    }
    p.set("cat", nueva);
    const url = `${ruta}?${p.toString()}`;
    if (cat === null) {
      window.history.pushState(null, "", url);
      agregadoAlHistorial.current = true;
    } else {
      // Cambiar de una categoría a otra no suma entradas: "atrás" cierra.
      window.history.replaceState(null, "", url);
    }
  }

  function alternar(fila: FilaCategoria) {
    navegar(abierta === fila.clave ? null : fila.clave);
  }

  function alternarEnOtras(grupo: GrupoOtras, c: DetalleCategoria) {
    navegar(abiertaEnOtras === c.clave ? grupo.clave : c.clave);
  }

  /** Tocar una porción: igual que tocar su fila, y la trae a la vista. */
  function elegirPorcion(i: number) {
    const fila = filas[i];
    if (!fila) return;
    alternar(fila);
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() =>
      filasRef.current[i]?.scrollIntoView({
        block: "nearest",
        behavior: reducido ? "auto" : "smooth",
      }),
    );
  }

  if (filas.length === 0) {
    return (
      <p className="py-10 text-center text-sm opacity-60">
        No hay egresos en este mes.
      </p>
    );
  }

  const indiceAbierta = filas.findIndex((f) => f.clave === abierta);

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,17rem)_1fr] lg:items-start lg:gap-6">
      <TortaEgresos
        porciones={filas.map(({ categoria, monto, color }) => ({ categoria, monto, color }))}
        total={total}
        activo={hover ?? (indiceAbierta === -1 ? null : indiceAbierta)}
        onResaltar={setHover}
        onElegir={elegirPorcion}
      />

      <div className="flex flex-col gap-2">
        {esMesEnCurso && (
          <p className="px-2 text-xs opacity-60">
            Mes en curso: las comparaciones van a cambiar a medida que cargues
            gastos.
          </p>
        )}
        <ul className="flex flex-col gap-0.5">
          {filas.map((fila, i) => {
            const idPanel = `${idBase}-panel-${i}`;
            const estaAbierta = abierta === fila.clave;
            return (
              <li
                key={fila.clave}
                ref={(el) => {
                  filasRef.current[i] = el;
                }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <BotonFila
                  fila={fila}
                  abierta={estaAbierta}
                  idPanel={idPanel}
                  onClick={() => alternar(fila)}
                />
                {estaAbierta &&
                  (fila.tipo === "otras" ? (
                    <div id={idPanel} className="animar-entrada ml-5 mt-1 border-l border-black/10 pl-2 dark:border-white/15">
                      <p className="px-2 py-1 text-xs opacity-60">
                        Las categorías más chicas, agrupadas en la torta.
                      </p>
                      <ul className="flex flex-col gap-0.5">
                        {fila.agrupadas.map((c, j) => {
                          const idSub = `${idBase}-otras-${j}`;
                          const subAbierta = abiertaEnOtras === c.clave;
                          return (
                            <li key={c.clave}>
                              <BotonFila
                                fila={c}
                                abierta={subAbierta}
                                idPanel={idSub}
                                onClick={() => alternarEnOtras(fila, c)}
                              />
                              {subAbierta && <PanelDetalle detalle={c} id={idSub} />}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    <PanelDetalle detalle={fila} id={idPanel} />
                  ))}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** La fila de una categoría (o del grupo "Otras"): un botón de 44px o más. */
function BotonFila({
  fila,
  abierta,
  idPanel,
  onClick,
}: {
  fila: FilaCategoria;
  abierta: boolean;
  idPanel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={abierta}
      aria-controls={abierta ? idPanel : undefined}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${
        abierta ? "bg-black/5 dark:bg-white/10" : ""
      }`}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: fila.color }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{fila.categoria}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          {fila.porcentaje !== null && (
            <span className="tabular-nums opacity-60">
              {fila.porcentaje.toLocaleString("es-AR")}%
            </span>
          )}
          {fila.tipo === "otras" ? (
            <span className="opacity-60">
              {fila.agrupadas.length}{" "}
              {fila.agrupadas.length === 1 ? "categoría" : "categorías"}
            </span>
          ) : (
            <IndicadorComparacion comparacion={fila.comparacion} />
          )}
        </span>
      </span>
      <span className="shrink-0 tabular-nums">{formatearARS(fila.monto)}</span>
      <Chevron abierta={abierta} />
    </button>
  );
}

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
function textoComparacion(c: Comparacion): string {
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
 * ▲/▼ con el porcentaje. Nunca sólo color: el símbolo y el número dicen lo
 * mismo, y el texto completo va para lectores de pantalla (y como `title`).
 * Más gasto se tiñe con el tono de egreso y menos con el de ingreso.
 */
function IndicadorComparacion({
  comparacion: c,
  largo = false,
}: {
  comparacion: Comparacion;
  largo?: boolean;
}) {
  const texto = textoComparacion(c);
  if (largo) {
    return (
      <p className="text-xs">
        <Simbolo comparacion={c} />{" "}
        <span className="opacity-70">{restoComparacion(c)}</span>
      </p>
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

/** Lo que se despliega al abrir una categoría. */
function PanelDetalle({ detalle: d, id }: { detalle: DetalleCategoria; id: string }) {
  const cantidad = d.movimientos.length;
  return (
    <div
      id={id}
      role="region"
      aria-label={`Detalle de ${d.categoria}`}
      className="animar-entrada mx-1 mb-2 mt-1 flex flex-col gap-4 rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.06]"
    >
      <div className="flex flex-col gap-1">
        <span className="fuente-display text-xl font-semibold tabular-nums">
          {formatearARS(d.monto)}
        </span>
        <span className="text-xs opacity-70">
          {cantidad} {cantidad === 1 ? "transacción" : "transacciones"}
          {d.porcentaje !== null &&
            ` · ${d.porcentaje.toLocaleString("es-AR")}% de los egresos del mes`}
        </span>
        <IndicadorComparacion comparacion={d.comparacion} largo />
      </div>

      <MiniBarras serie={d.serie} color={d.color} />

      <ListaMovimientos movimientos={d.movimientos} />

      {d.devoluciones.cantidad > 0 && (
        <div className="flex items-start justify-between gap-3 border-t border-black/10 pt-2 text-sm dark:border-white/15">
          <span>
            Devoluciones ({d.devoluciones.cantidad})
            <span className="block text-xs opacity-60">
              Van aparte: no se restan del total de arriba.
            </span>
          </span>
          <span className="shrink-0 tabular-nums text-ingreso">
            {formatearARSConSigno(-d.devoluciones.total)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * La categoría en los últimos 6 meses. Barras de HTML: el mes que se está
 * mirando con el color de la categoría a full, los demás con ese mismo color
 * atenuado (sin colores nuevos). Un mes en $0 queda como una línea de base.
 */
function MiniBarras({ serie, color }: { serie: PuntoSerie[]; color: string }) {
  const maximo = Math.max(0, ...serie.map((p) => p.monto));
  return (
    <figure>
      <figcaption className="text-xs opacity-60">Últimos 6 meses</figcaption>
      <ul aria-hidden className="mt-2 flex h-14 items-end gap-1.5">
        {serie.map((p) => (
          <li
            key={p.mes}
            title={`${p.etiqueta}: ${formatearARS(p.monto)}`}
            className="flex h-full flex-1 items-end justify-center"
          >
            <span
              className="block w-full max-w-7 rounded-t"
              style={
                p.monto > 0 && maximo > 0
                  ? {
                      height: `max(${(p.monto / maximo) * 100}%, 3px)`,
                      backgroundColor: color,
                      opacity: p.actual ? 1 : 0.35,
                    }
                  : { height: "1px", backgroundColor: "var(--viz-axis)" }
              }
            />
          </li>
        ))}
      </ul>
      <ul aria-hidden className="mt-1 flex gap-1.5 text-[10px]">
        {serie.map((p) => (
          <li
            key={p.mes}
            className={`flex-1 text-center ${p.actual ? "font-medium" : "opacity-60"}`}
          >
            {p.etiqueta}
          </li>
        ))}
      </ul>
      {/* Los mismos números, para lectores de pantalla. */}
      <ul className="sr-only">
        {serie.map((p) => (
          <li key={p.mes}>
            {p.etiqueta}: {formatearARS(p.monto)}
            {p.actual ? " (este mes)" : ""}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function ListaMovimientos({ movimientos }: { movimientos: Movimiento[] }) {
  const [todos, setTodos] = useState(false);
  const visibles = todos ? movimientos : movimientos.slice(0, MOVIMIENTOS_VISIBLES);
  const ocultos = movimientos.length - visibles.length;

  return (
    <div>
      <ul className="divide-y divide-black/5 dark:divide-white/10">
        {visibles.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-11 shrink-0 text-xs tabular-nums opacity-60">
              {formatearFechaCorta(m.fecha)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{m.descripcion}</span>
              <span className="block truncate text-xs opacity-60">
                {m.cuenta ?? "Sin cuenta"}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{formatearARS(m.monto)}</span>
          </li>
        ))}
      </ul>
      {ocultos > 0 && (
        <button
          type="button"
          onClick={() => setTodos(true)}
          className="mt-1 min-h-11 w-full rounded-lg text-sm underline underline-offset-4 opacity-70 hover:opacity-100"
        >
          Ver {ocultos} {ocultos === 1 ? "transacción más" : "transacciones más"}
        </button>
      )}
    </div>
  );
}

function Chevron({ abierta }: { abierta: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 opacity-50 transition-transform duration-150 motion-reduce:transition-none ${
        abierta ? "rotate-90" : ""
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

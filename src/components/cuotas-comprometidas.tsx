"use client";

import { useState } from "react";
import type { ProyeccionCuotas } from "@/lib/cuotas";
import { MESES_CUOTAS } from "@/lib/cuotas";
import { etiquetaMesCorta, formatearARS, nombreMes } from "@/lib/formato";

/** Cuántas barras entran a la vez: más, en un celular, no se leen. */
const VENTANA = 12;

const FLECHA =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/15 text-lg leading-none transition-colors hover:bg-black/5 active:scale-95 disabled:pointer-events-none disabled:opacity-30 dark:border-white/20 dark:hover:bg-white/10";

/**
 * Lo comprometido en cuotas para los meses que vienen. Arranca en el mes que
 * viene; con las flechas ‹ › (iguales a las del selector de mes) o tocando
 * una barra se recorre cualquier mes futuro con cuotas, y el detalle muestra
 * qué compras componen ESE mes.
 *
 * El mes elegido es estado local y no va a la URL: es una vista dentro de la
 * tarjeta, no cambia qué mes muestra el resto del Dashboard. Se mira siempre
 * desde hoy, como la meta de ahorro.
 */
export default function CuotasComprometidas({
  proyeccion: p,
}: {
  proyeccion: ProyeccionCuotas;
}) {
  // Los meses que se pueden elegir: los que tienen alguna cuota. Uno del
  // medio en $0 (una compra terminó y la otra todavía no empezó) se saltea.
  const navegables = p.meses.flatMap((m, i) => (m.total > 0 ? [i] : []));
  const [guardado, setElegido] = useState(navegables[0] ?? 0);
  // Si el servidor revalida y el mes elegido ya no tiene cuotas (o no existe),
  // se vuelve al primero en vez de romper.
  const elegido = navegables.includes(guardado) ? guardado : (navegables[0] ?? 0);
  const [detalleAbierto, setDetalleAbierto] = useState(false);

  const nota = (
    <p className="text-xs opacity-60">
      Se detectan por la indicación de cuota en la descripción (&quot;Cuota
      03/06&quot;, &quot;C.03/06&quot;, &quot;Cta 3 de 6&quot;…) de lo cargado
      en los últimos {MESES_CUOTAS} meses. La cuota de este mes no se cuenta:
      ya está en los gastos del mes o se paga con el resumen actual.
    </p>
  );

  if (navegables.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm opacity-60">
          No hay cuotas pendientes para los próximos meses.
        </p>
        {nota}
      </div>
    );
  }

  const mes = p.meses[elegido];
  const posicion = navegables.indexOf(elegido);
  const anterior = posicion > 0 ? navegables[posicion - 1] : null;
  const siguiente = posicion < navegables.length - 1 ? navegables[posicion + 1] : null;
  const compras = new Map(p.compras.map((c) => [c.clave, c]));
  const mesFinal = p.compras.reduce(
    (a, c) => (c.mesUltima > a ? c.mesUltima : a),
    p.meses[p.meses.length - 1].mes,
  );

  // Las barras van de a 12: la ventana es la que contiene al mes elegido.
  const inicio = Math.floor(elegido / VENTANA) * VENTANA;
  const visibles = p.meses.slice(inicio, inicio + VENTANA);
  const maximo = Math.max(...visibles.map((m) => m.total));

  /** Elegir un mes a propósito es para ver qué lo compone: abre el detalle. */
  function elegir(indice: number) {
    setElegido(indice);
    setDetalleAbierto(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => anterior !== null && elegir(anterior)}
          disabled={anterior === null}
          aria-label="Mes anterior con cuotas"
          className={FLECHA}
        >
          ‹
        </button>
        {/* aria-live: al cambiar de mes, el lector de pantalla lee el nuevo
            monto sin tener que ir a buscarlo. */}
        <div aria-live="polite" className="min-w-0 flex-1 text-center">
          <p className="fuente-display text-2xl font-semibold tabular-nums">
            {formatearARS(mes.total)}
          </p>
          <p className="text-sm opacity-60">
            en cuotas para <span className="whitespace-nowrap">{nombreMes(mes.mes)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => siguiente !== null && elegir(siguiente)}
          disabled={siguiente === null}
          aria-label="Mes siguiente con cuotas"
          className={FLECHA}
        >
          ›
        </button>
      </div>

      <figure>
        {/* Cada barra con cuotas es un botón: tocarla elige ese mes. El mes
            elegido va a full; los demás, atenuados (mismo lenguaje que las
            mini barras del detalle de categoría). */}
        <ul className="flex h-14 items-end gap-1.5">
          {visibles.map((m, j) => {
            const i = inicio + j;
            const actual = i === elegido;
            const barra = (
              <span
                aria-hidden
                className="block w-full max-w-7 rounded-t transition-opacity duration-150"
                style={
                  m.total > 0
                    ? {
                        height: `max(${(m.total / maximo) * 100}%, 3px)`,
                        backgroundColor: "var(--viz-egreso)",
                        opacity: actual ? 1 : 0.35,
                      }
                    : { height: "1px", backgroundColor: "var(--viz-axis)" }
                }
              />
            );
            return (
              <li key={m.mes} className="flex h-full flex-1">
                {m.total > 0 ? (
                  <button
                    type="button"
                    onClick={() => elegir(i)}
                    aria-label={`${nombreMes(m.mes)}: ${formatearARS(m.total)} en cuotas`}
                    aria-pressed={actual}
                    title={`${etiquetaMesCorta(m.mes)}: ${formatearARS(m.total)}`}
                    className="flex h-full w-full cursor-pointer items-end justify-center rounded-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    {barra}
                  </button>
                ) : (
                  <span className="flex h-full w-full items-end justify-center">{barra}</span>
                )}
              </li>
            );
          })}
        </ul>
        <ul aria-hidden className="mt-1 flex gap-1.5 text-[10px]">
          {visibles.map((m, j) => (
            <li
              key={m.mes}
              className={`flex-1 text-center ${inicio + j === elegido ? "font-medium" : "opacity-60"}`}
            >
              {etiquetaMesCorta(m.mes)}
            </li>
          ))}
        </ul>
        <figcaption className="mt-1.5 text-xs opacity-60">
          En total quedan {formatearARS(p.totalPendiente)} en {p.compras.length}{" "}
          {p.compras.length === 1 ? "compra" : "compras"}, hasta {nombreMes(mesFinal)}.
          Tocá un mes o usá las flechas para ver sus cuotas.
        </figcaption>
      </figure>

      <details
        open={detalleAbierto}
        onToggle={(e) => setDetalleAbierto(e.currentTarget.open)}
        className="text-sm"
      >
        <summary className="cursor-pointer text-xs opacity-60 hover:opacity-100">
          Ver las {mes.cuotas.length} {mes.cuotas.length === 1 ? "compra" : "compras"} de{" "}
          {nombreMes(mes.mes)}
        </summary>
        {/* key por mes: al cambiar, la lista entra con la misma animación
            que el resto del Dashboard. */}
        <ul
          key={mes.mes}
          className="animar-entrada mt-2 divide-y divide-black/5 dark:divide-white/10"
        >
          {mes.cuotas.map((c) => {
            const compra = compras.get(c.clave);
            const ultima = c.numero === c.total;
            return (
              <li key={c.clave} className="flex items-start gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {c.nombre}
                    {c.copias > 1 && <span className="opacity-60"> ×{c.copias}</span>}
                  </span>
                  <span className="block text-xs opacity-60">
                    Cuota {c.numero} de {c.total}
                    {ultima
                      ? " · la última"
                      : compra && ` · termina en ${nombreMes(compra.mesUltima)}`}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatearARS(c.monto)}</span>
              </li>
            );
          })}
        </ul>
      </details>

      {nota}
    </div>
  );
}

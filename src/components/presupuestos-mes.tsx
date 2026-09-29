"use client";

import { useId, useState, useTransition } from "react";
import { guardarPresupuestos } from "@/app/actions/presupuestos";
import { colorDeCategoria } from "@/lib/categorias";
import { formatearARS } from "@/lib/formato";
import type { FilaPresupuesto, Presupuesto } from "@/lib/presupuestos";
import { CAMPO_COMPACTO } from "@/lib/ui";

/**
 * Presupuestos del mes: cuánto se gastó de cada tope, contra cuánto pasó del
 * mes. Vive en el Dashboard, que es donde se miran; se editan en la misma
 * tarjeta ("Editar") para no tener otra pantalla que mantener.
 *
 * Sólo aparecen las categorías con presupuesto. Las demás siguen en la torta
 * y la lista de categorías como siempre, sin indicador.
 *
 * El aviso es ámbar y en texto chico: informa, no alarma. El color de la
 * barra es el de la categoría (como en la torta); el estado se dice con
 * palabras, nunca sólo con color.
 */
export default function PresupuestosMes({
  filas,
  avance,
  esMesEnCurso,
  categorias,
  presupuestos,
  error,
}: {
  filas: FilaPresupuesto[];
  /** Cuánto pasó del mes, 0–100. */
  avance: number;
  esMesEnCurso: boolean;
  /** Las que se pueden presupuestar: las del sistema y las propias. */
  categorias: string[];
  presupuestos: Presupuesto[];
  /** Si no se pudieron leer (p. ej. falta correr el SQL). */
  error: string | null;
}) {
  const [editando, setEditando] = useState(false);

  if (error) {
    return (
      <p className="text-sm opacity-60">
        No pudimos leer tus presupuestos. Si todavía no corriste
        supabase/presupuestos.sql, corrélo en Supabase y recargá.
      </p>
    );
  }

  if (editando) {
    return (
      <EditorPresupuestos
        categorias={categorias}
        presupuestos={presupuestos}
        onListo={() => setEditando(false)}
      />
    );
  }

  const botonEditar = (texto: string) => (
    <button
      type="button"
      onClick={() => setEditando(true)}
      className="shrink-0 rounded-lg border border-black/15 px-2.5 py-1 text-xs transition-colors hover:bg-black/5 active:scale-[.98] dark:border-white/20 dark:hover:bg-white/10"
    >
      {texto}
    </button>
  );

  if (filas.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm opacity-60">
          Poné un tope mensual a las categorías que quieras seguir. Las demás
          no cambian.
        </p>
        {botonEditar("Definir presupuestos")}
      </div>
    );
  }

  // La marca de "hoy" sólo tiene sentido con el mes a medio camino.
  const conMarca = esMesEnCurso && avance > 0 && avance < 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs opacity-60">
          {conMarca ? (
            <>
              Pasó el <span className="tabular-nums">{avance}%</span> del mes.
              La marca en cada barra es ese punto: si el gasto la pasa, vas más
              rápido que el mes.
            </>
          ) : esMesEnCurso ? (
            "Mes en curso."
          ) : (
            "Mes cerrado."
          )}
        </p>
        {botonEditar("Editar")}
      </div>

      <ul className="animar-entrada flex flex-col gap-4">
        {filas.map((f) => (
          <FilaProgreso key={f.categoria} fila={f} avance={avance} conMarca={conMarca} />
        ))}
      </ul>
    </div>
  );
}

function FilaProgreso({
  fila: f,
  avance,
  conMarca,
}: {
  fila: FilaPresupuesto;
  avance: number;
  conMarca: boolean;
}) {
  return (
    <li className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-baseline gap-2.5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 self-center rounded-full"
          style={{ backgroundColor: f.color }}
        />
        <span className="min-w-0 flex-1 truncate">{f.categoria}</span>
        <span className="shrink-0 tabular-nums">
          {formatearARS(f.gastado)}{" "}
          <span className="opacity-60">de {formatearARS(f.presupuesto)}</span>
        </span>
      </div>

      {/* La barra repite lo que dice el texto: para lectores de pantalla
          alcanza con el texto. */}
      <div aria-hidden className="relative h-2 rounded-full" style={{ backgroundColor: "var(--viz-grid)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(f.porcentaje, 100)}%`,
            // Un gasto chiquito igual se ve: 3px como en las mini barras.
            minWidth: f.gastado > 0 ? "3px" : 0,
            backgroundColor: f.color,
          }}
        />
        {conMarca && (
          <span
            className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground opacity-70"
            style={{ left: `${avance}%` }}
          />
        )}
      </div>

      <p className="flex flex-wrap justify-between gap-x-3 text-xs">
        <span className="tabular-nums opacity-60">
          {f.porcentaje}% gastado
          {conMarca && ` · ${avance}% del mes`}
        </span>
        <span className="tabular-nums opacity-60">
          {f.restante >= 0
            ? `Quedan ${formatearARS(f.restante)}`
            : `${formatearARS(-f.restante)} por encima`}
        </span>
      </p>

      {f.estado === "adelantado" && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Vas más rápido que el mes: {f.porcentaje}% del presupuesto con el{" "}
          {avance}% del mes.
        </p>
      )}
      {f.estado === "excedido" && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Pasaste el presupuesto por {formatearARS(-f.restante)}.
        </p>
      )}
    </li>
  );
}

/** Un monto guardado como lo muestra el campo: "150000" o "1234,50". */
function montoComoTexto(monto: number): string {
  return Number.isInteger(monto) ? String(monto) : monto.toFixed(2).replace(".", ",");
}

/**
 * Todas las categorías con un campo de monto cada una. Vacío = sin
 * presupuesto: así se crea, se cambia y se borra desde el mismo lugar.
 */
function EditorPresupuestos({
  categorias,
  presupuestos,
  onListo,
}: {
  categorias: string[];
  presupuestos: Presupuesto[];
  onListo: () => void;
}) {
  const [montos, setMontos] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      categorias.map((c) => {
        const p = presupuestos.find((x) => x.categoria === c);
        return [c, p ? montoComoTexto(p.monto_mensual) : ""];
      }),
    ),
  );
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  // Ids por posición: un nombre de categoría puede tener espacios, que un id
  // de HTML no admite.
  const uid = useId();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrores({});
    iniciar(async () => {
      const resultado = await guardarPresupuestos(
        categorias.map((categoria) => ({ categoria, monto: montos[categoria] ?? "" })),
      );
      if (resultado.ok) {
        onListo();
        return;
      }
      setErrores(resultado.errores ?? {});
      setError(resultado.error ?? null);
    });
  }

  return (
    <form onSubmit={guardar} className="animar-entrada flex flex-col gap-3">
      <p className="text-xs opacity-60">
        Un tope por mes, el mismo todos los meses. Dejá vacío para no tener
        presupuesto en esa categoría.
      </p>

      <ul className="flex flex-col gap-2">
        {categorias.map((c, i) => {
          const id = `${uid}-${i}`;
          return (
            <li key={c}>
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorDeCategoria(c) }}
                />
                <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm">
                  {c}
                </label>
                <div className="w-36 shrink-0">
                  <input
                    id={id}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Sin tope"
                    value={montos[c] ?? ""}
                    onChange={(e) => setMontos((m) => ({ ...m, [c]: e.target.value }))}
                    aria-invalid={errores[c] ? true : undefined}
                    className={`${CAMPO_COMPACTO} text-right tabular-nums`}
                  />
                </div>
              </div>
              {errores[c] && (
                <p role="alert" className="mt-1 text-right text-xs text-rose-600 dark:text-rose-400">
                  {errores[c]}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 active:scale-[.99] disabled:opacity-50 disabled:active:scale-100"
        >
          {pendiente ? "Guardando…" : "Guardar presupuestos"}
        </button>
        <button
          type="button"
          onClick={onListo}
          disabled={pendiente}
          className="text-sm underline underline-offset-4 opacity-60 hover:opacity-100 disabled:opacity-30"
        >
          Cancelar
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </form>
  );
}

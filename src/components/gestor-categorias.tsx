"use client";

import { useEffect, useRef, useState } from "react";
import { colorDeCategoria } from "@/lib/categorias";
import type { CategoriaUsuario } from "@/lib/types";
import type { ResultadoEliminar } from "@/app/actions/categorias";

/**
 * Modal para ver y borrar las categorías personalizadas. Las 8 del sistema no
 * se listan acá: no se pueden borrar. Todo el flujo (confirmar, avisar que
 * tiene transacciones) usa UI propia de la app; nada de window.confirm nativo,
 * que en la PWA instalada no es confiable.
 */
export default function GestorCategorias({
  custom,
  eliminar,
}: {
  custom: CategoriaUsuario[];
  eliminar: (id: string) => Promise<ResultadoEliminar>;
}) {
  const [abierto, setAbierto] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (abierto && !dlg.open) dlg.showModal();
    else if (!abierto && dlg.open) dlg.close();
  }, [abierto]);

  return (
    <>
      {/* Mismo alto/padding/borde que los inputs y selects del formulario
          (px-3 py-2, border /15), para que se lea como un control más. */}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm transition-colors hover:bg-black/5 active:scale-[.98] dark:border-white/20 dark:hover:bg-white/10"
      >
        <IconoEtiqueta />
        Categorías
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setAbierto(false)}
        className="m-auto w-[min(28rem,92vw)] rounded-xl border border-black/10 bg-background p-0 text-foreground backdrop:bg-black/40 dark:border-white/15"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Categorías propias</h2>
              <p className="mt-0.5 text-xs opacity-60">
                Sólo las que creaste vos. Las del sistema no se pueden borrar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar"
              className="rounded-lg px-2 py-1 text-lg leading-none opacity-60 hover:bg-black/5 dark:hover:bg-white/10"
            >
              ✕
            </button>
          </div>

          {custom.length === 0 ? (
            <p className="py-4 text-center text-sm opacity-60">
              Todavía no creaste ninguna. Agregalas desde el selector de
              categoría al cargar o importar un gasto.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-black/10 dark:divide-white/10">
              {custom.map((c) => (
                <FilaCategoria key={c.id} categoria={c} eliminar={eliminar} />
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}

/** Estado de una fila: normal, pidiendo confirmación, borrando o bloqueada. */
type Fase = "normal" | "confirmar" | "borrando" | "bloqueada";

function FilaCategoria({
  categoria,
  eliminar,
}: {
  categoria: CategoriaUsuario;
  eliminar: (id: string) => Promise<ResultadoEliminar>;
}) {
  const [fase, setFase] = useState<Fase>("normal");
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function borrar() {
    setFase("borrando");
    const resultado = await eliminar(categoria.id);
    // Si salió bien, la fila desaparece sola (el padre la saca del estado).
    if (!resultado.ok) {
      // Tiene transacciones (u otro error): se muestra el motivo, no se borra.
      setMensaje(resultado.error);
      setFase("bloqueada");
    }
  }

  return (
    <li className="flex flex-col gap-2 py-2.5">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: colorDeCategoria(categoria.nombre) }}
        />
        <span className="min-w-0 flex-1 truncate text-sm">
          {categoria.nombre}
        </span>

        {fase === "normal" && (
          <button
            type="button"
            onClick={() => setFase("confirmar")}
            aria-label={`Eliminar ${categoria.nombre}`}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
          >
            <IconoBasura />
            Eliminar
          </button>
        )}

        {fase === "bloqueada" && (
          <button
            type="button"
            onClick={() => {
              setMensaje(null);
              setFase("normal");
            }}
            className="rounded-lg px-2 py-1 text-xs opacity-70 hover:bg-black/5 dark:hover:bg-white/10"
          >
            Entendido
          </button>
        )}
      </div>

      {/* Confirmación propia de la app (nada de window.confirm nativo). */}
      {fase === "confirmar" && (
        <div className="animar-entrada flex flex-wrap items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 text-xs dark:bg-white/10">
          <span className="flex-1">¿Eliminar “{categoria.nombre}”?</span>
          <button
            type="button"
            onClick={borrar}
            className="rounded-lg bg-rose-600 px-2.5 py-1 font-medium text-white transition hover:bg-rose-700 active:scale-95"
          >
            Sí, eliminar
          </button>
          <button
            type="button"
            onClick={() => setFase("normal")}
            className="rounded-lg border border-black/15 px-2.5 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
        </div>
      )}

      {fase === "borrando" && (
        <p className="px-1 text-xs opacity-60">Eliminando…</p>
      )}

      {fase === "bloqueada" && mensaje && (
        <p
          role="alert"
          className="animar-entrada rounded-lg border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400"
        >
          {mensaje}
        </p>
      )}
    </li>
  );
}

function IconoEtiqueta() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4 opacity-70"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconoBasura() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import FormularioTransaccion from "@/components/formulario-transaccion";
import type { Transaccion } from "@/lib/types";

/**
 * El lápiz de cada fila de Movimientos: abre el mismo formulario que el alta,
 * precargado, en un modal. El formulario se monta recién al abrir, así cada
 * apertura arranca con los datos actuales de la fila y sin errores viejos.
 */
export default function BotonEditar({ transaccion }: { transaccion: Transaccion }) {
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
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Editar ${transaccion.descripcion}`}
        title="Editar"
        className="flex h-8 w-8 items-center justify-center rounded-lg opacity-40 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
      >
        <IconoLapiz />
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setAbierto(false)}
        aria-labelledby={`editar-${transaccion.id}`}
        className="m-auto w-[min(28rem,92vw)] rounded-xl border border-black/10 bg-background p-0 text-foreground backdrop:bg-black/40 dark:border-white/15"
      >
        {abierto && (
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-4">
              <h2 id={`editar-${transaccion.id}`} className="text-base font-semibold">
                Editar transacción
              </h2>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="rounded-lg px-2 py-1 text-lg leading-none opacity-60 hover:bg-black/5 dark:hover:bg-white/10"
              >
                ✕
              </button>
            </div>
            <FormularioTransaccion
              transaccion={transaccion}
              onGuardado={() => setAbierto(false)}
            />
          </div>
        )}
      </dialog>
    </>
  );
}

function IconoLapiz() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

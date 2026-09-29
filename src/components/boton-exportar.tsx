"use client";

import { useEffect, useId, useRef, useState } from "react";
import { nombreArchivoExport, nombreArchivoExportMes } from "@/lib/csv";
import { esMesValido, hoyISO, nombreMes } from "@/lib/formato";
import { CAMPO } from "@/lib/ui";

const RUTA = "/api/exportar";
const TIPO = "text/csv";

type Estado = "listo" | "preparando" | "error";
type Periodo = "actual" | "otro" | "todo";

/** `userAgentData` todavía no está en los tipos del DOM. */
type NavigatorConUA = Navigator & { userAgentData?: { mobile?: boolean } };

/**
 * Compartir sólo en dispositivos táctiles. Chrome de escritorio también tiene
 * Web Share (abre el panel de Windows), pero en la compu lo que se espera es
 * una descarga común y silenciosa.
 */
function convieneCompartir(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;

  const ua = (navigator as NavigatorConUA).userAgentData;
  if (typeof ua?.mobile === "boolean") return ua.mobile;

  // Safari en iOS no tiene userAgentData: ahí decide el tipo de puntero.
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * "Exportar" abre un modal para elegir qué se exporta: el mes que se está
 * viendo en Movimientos (por defecto), otro mes, o todo el historial. Las
 * columnas y el formato del CSV son siempre los mismos.
 *
 * "Descargar" es un <a> de verdad apuntando al endpoint: en la compu (y en
 * cualquier navegador sin Web Share) el browser descarga solo, sin
 * JavaScript de por medio. En el celular interceptamos el click y abrimos la
 * hoja de compartir, que es la forma natural de guardar o mandar un archivo
 * ahí — sobre todo con la PWA instalada, donde una descarga suelta es
 * incómoda de encontrar.
 */
export default function BotonExportar({ mes }: { mes: string }) {
  const [abierto, setAbierto] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>("actual");
  const [otroMes, setOtroMes] = useState(mes);
  const [estado, setEstado] = useState<Estado>("listo");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId();

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (abierto && !dlg.open) dlg.showModal();
    else if (!abierto && dlg.open) dlg.close();
  }, [abierto]);

  // Qué se pide y cómo se llama el archivo. Con un mes inválido (el campo a
  // medio escribir en un navegador sin selector de mes) no se puede descargar.
  const mesPedido = periodo === "actual" ? mes : periodo === "otro" ? otroMes : null;
  const valido = mesPedido === null || esMesValido(mesPedido);
  const ruta = mesPedido ? `${RUTA}?mes=${mesPedido}` : RUTA;
  const nombre =
    mesPedido && valido ? nombreArchivoExportMes(mesPedido) : nombreArchivoExport(hoyISO());

  function abrir() {
    setPeriodo("actual");
    setOtroMes(mes);
    setEstado("listo");
    setAbierto(true);
  }

  async function alDescargar(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!valido) {
      e.preventDefault();
      return;
    }
    // En la compu, el <a> descarga solo: cerramos el modal y listo.
    if (!convieneCompartir()) {
      setAbierto(false);
      return;
    }

    e.preventDefault();
    setEstado("preparando");

    let archivo: File;
    try {
      const respuesta = await fetch(ruta);

      // Si venció la sesión, el proxy redirige al login: sin este chequeo
      // terminaríamos compartiendo el HTML del login con nombre .csv.
      if (respuesta.redirected) {
        window.location.href = respuesta.url;
        return;
      }
      if (!respuesta.ok) throw new Error(String(respuesta.status));

      archivo = new File([await respuesta.blob()], nombre, { type: TIPO });
    } catch {
      setEstado("error");
      return;
    }

    try {
      if (navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: nombre });
      } else {
        descargar(archivo, nombre);
      }
    } catch (error) {
      // Cancelar la hoja de compartir no es un error.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        // Safari a veces rechaza share() si perdió el gesto del usuario
        // mientras bajábamos el archivo: ahí lo guardamos igual.
        descargar(archivo, nombre);
      }
    }

    setEstado("listo");
    setAbierto(false);
  }

  const opcion = (valor: Periodo, titulo: React.ReactNode, detalle?: React.ReactNode) => (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-black/5 dark:hover:bg-white/10">
      <input
        type="radio"
        name={`${uid}-periodo`}
        value={valor}
        checked={periodo === valor}
        onChange={() => setPeriodo(valor)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-current"
      />
      <span className="min-w-0 flex-1 text-sm">
        {titulo}
        {detalle && <span className="block text-xs opacity-60">{detalle}</span>}
      </span>
    </label>
  );

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="rounded-lg border border-black/15 px-3 py-1.5 text-xs transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        Exportar
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setAbierto(false)}
        aria-labelledby={`${uid}-titulo`}
        className="m-auto w-[min(24rem,92vw)] rounded-xl border border-black/10 bg-background p-0 text-foreground backdrop:bg-black/40 dark:border-white/15"
      >
        {abierto && (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={`${uid}-titulo`} className="text-base font-semibold">
                  Exportar a CSV
                </h2>
                <p className="mt-0.5 text-xs opacity-60">
                  Mismas columnas siempre; elegí qué período.
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

            <fieldset className="-mx-2 flex flex-col">
              <legend className="sr-only">Qué exportar</legend>
              {opcion(
                "actual",
                <>
                  Mes actual{" "}
                  <span className="opacity-60">
                    ({nombreMes(mes)})
                  </span>
                </>,
                "El que estás viendo en Movimientos.",
              )}
              {opcion("otro", "Elegir mes específico")}
              {periodo === "otro" && (
                <div className="animar-entrada px-2 pb-2 pl-[2.1rem]">
                  <label htmlFor={`${uid}-mes`} className="sr-only">
                    Mes a exportar
                  </label>
                  <input
                    id={`${uid}-mes`}
                    type="month"
                    value={otroMes}
                    onChange={(e) => setOtroMes(e.target.value)}
                    className={CAMPO}
                  />
                </div>
              )}
              {opcion("todo", "Todo el historial", "Todas tus transacciones, de la primera a la última.")}
            </fieldset>

            <p className="text-xs opacity-60">
              {valido ? (
                <>
                  Se descarga como <span className="font-medium">{nombre}</span>
                </>
              ) : (
                "Elegí un mes válido."
              )}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href={ruta}
                download={nombre}
                onClick={alDescargar}
                aria-disabled={!valido}
                aria-busy={estado === "preparando"}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 active:scale-[.99] aria-busy:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-40"
              >
                {estado === "preparando" ? "Preparando…" : "Descargar"}
              </a>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="text-sm underline underline-offset-4 opacity-60 hover:opacity-100"
              >
                Cancelar
              </button>
            </div>

            {estado === "error" && (
              <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
                No se pudo exportar. Probá de nuevo.
              </p>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

function descargar(archivo: File, nombre: string) {
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

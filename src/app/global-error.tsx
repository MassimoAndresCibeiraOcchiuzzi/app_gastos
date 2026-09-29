"use client"; // Los error boundaries tienen que ser Client Components.

import { useEffect } from "react";
import "./globals.css";
import { CLASES_FUENTES } from "./fuentes";
import PantallaEstado, {
  BOTON_PRINCIPAL,
  BOTON_SECUNDARIO,
} from "@/components/pantalla-estado";

/**
 * Último recurso: se activa cuando falla el propio layout raíz, que es
 * justo lo que `error.tsx` no cubre. Cuando pasa, este archivo REEMPLAZA al
 * layout, así que trae lo suyo: <html>, <body>, estilos globales y fuentes.
 *
 * "Volver a Movimientos" es un <a> común y no un <Link>: si el layout se
 * rompió, conviene una recarga completa en vez de una navegación del lado del
 * cliente que reusa el estado roto.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[global-error.tsx]", error);
  }, [error]);

  return (
    <html lang="es" className={`${CLASES_FUENTES} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Sin `metadata` en un Client Component: el título va a mano. */}
        <title>Error · Gastos</title>
        <PantallaEstado
          titulo="La app no pudo cargar"
          mensaje="Hubo un error al abrir la aplicación. Probá de nuevo en un momento."
          detalle={error.digest ? `Código del error: ${error.digest}` : undefined}
        >
          <button type="button" onClick={() => unstable_retry()} className={BOTON_PRINCIPAL}>
            Reintentar
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- recarga completa a propósito (ver arriba) */}
          <a href="/" className={BOTON_SECUNDARIO}>
            Volver a Movimientos
          </a>
        </PantallaEstado>
      </body>
    </html>
  );
}

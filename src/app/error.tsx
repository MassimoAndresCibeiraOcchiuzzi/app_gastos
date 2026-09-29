"use client"; // Los error boundaries tienen que ser Client Components.

import { useEffect } from "react";
import Link from "next/link";
import PantallaEstado, {
  BOTON_PRINCIPAL,
  BOTON_SECUNDARIO,
} from "@/components/pantalla-estado";

/**
 * Lo que se ve cuando una pantalla tira una excepción no controlada (por
 * ejemplo, Supabase caído mientras un Server Component trae datos). Envuelve
 * todas las páginas; el layout raíz queda afuera y lo cubre `global-error.tsx`.
 *
 * En producción, Next no manda al navegador el mensaje de un error del
 * servidor (podría tener datos sensibles): sólo un `digest`, que es el mismo
 * código que aparece en los logs del servidor. Por eso se muestra: sirve para
 * encontrar el error real.
 */
export default function ErrorPantalla({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[error.tsx]", error);
  }, [error]);

  return (
    <PantallaEstado
      titulo="Algo salió mal"
      mensaje="No pudimos mostrar esta pantalla. Puede ser un problema pasajero: probá de nuevo, o volvé al inicio."
      detalle={error.digest ? `Código del error: ${error.digest}` : undefined}
    >
      {/* Reintenta pidiendo los datos de nuevo al servidor, no sólo
          re-renderizando lo que ya había. */}
      <button type="button" onClick={() => unstable_retry()} className={BOTON_PRINCIPAL}>
        Reintentar
      </button>
      <Link href="/" className={BOTON_SECUNDARIO}>
        Volver a Movimientos
      </Link>
    </PantallaEstado>
  );
}

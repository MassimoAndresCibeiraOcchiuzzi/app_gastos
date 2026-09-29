/**
 * Pantalla completa para estados sin contenido: error, página inexistente.
 * Mismo lenguaje visual que la de carga (`app/loading.tsx`) y la de error de
 * login: el wordmark de la app, un título, una explicación corta y acciones.
 *
 * Sin hooks ni "use client": la usan tanto `not-found.tsx` (servidor) como
 * `error.tsx` y `global-error.tsx` (cliente).
 */
export default function PantallaEstado({
  titulo,
  mensaje,
  detalle,
  children,
}: {
  titulo: string;
  mensaje: string;
  /** Dato técnico chico, p. ej. el código para buscar el error en los logs. */
  detalle?: string;
  /** Los botones o links de acción. */
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <p
          aria-hidden
          className="fuente-display text-2xl font-semibold tracking-tight opacity-40"
        >
          Gastos
        </p>
        <h1 className="mt-6 text-xl font-semibold">{titulo}</h1>
        <p className="mt-3 text-sm opacity-70">{mensaje}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {children}
        </div>
        {detalle && (
          <p className="mt-6 text-xs tabular-nums opacity-60">{detalle}</p>
        )}
      </div>
    </main>
  );
}

/** Acción principal (mismo estilo que "Guardar" o "Analizar PDF"). */
export const BOTON_PRINCIPAL =
  "inline-block rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 active:scale-[.99]";

/** Acción secundaria (mismo estilo que "Salir" o "Exportar historial"). */
export const BOTON_SECUNDARIO =
  "inline-block rounded-lg border border-black/15 px-4 py-2.5 text-sm transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

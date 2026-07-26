/**
 * Pantalla de carga. Next la muestra automáticamente mientras la próxima
 * pantalla resuelve sus datos en el servidor (al navegar entre secciones o al
 * entrar). No es un spinner del navegador: es el wordmark de la app con una
 * animación sutil, en la misma paleta y tipografía que el resto.
 */
export default function Cargando() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div
        role="status"
        aria-label="Cargando"
        className="flex flex-col items-center gap-4"
      >
        <span className="fuente-display cargando-latido text-3xl font-semibold tracking-tight">
          Gastos
        </span>
        <span aria-hidden className="cargando-barra" />
      </div>
    </main>
  );
}

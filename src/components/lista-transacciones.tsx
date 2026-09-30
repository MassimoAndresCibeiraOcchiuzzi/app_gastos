import type { Transaccion } from "@/lib/types";
import { formatearARSConSigno, formatearFechaCorta } from "@/lib/formato";
import BotonEditar from "./boton-editar";
import BotonEliminar from "./boton-eliminar";

export default function ListaTransacciones({
  transacciones,
}: {
  transacciones: Transaccion[];
}) {
  if (transacciones.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-black/15 p-8 text-center text-sm opacity-60 dark:border-white/20">
        No hay movimientos en este mes.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-black/10 overflow-hidden rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/15">
      {transacciones.map((t) => {
        const esIngreso = t.tipo === "ingreso";
        // "Fijo" va primero: la línea se trunca en el celular y así no se pierde.
        const detalle = [t.es_fijo ? "Fijo" : null, t.categoria, t.cuenta]
          .filter(Boolean)
          .join(" · ");

        return (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
            <div
              aria-hidden
              className="w-11 shrink-0 text-center text-xs tabular-nums opacity-60"
            >
              {formatearFechaCorta(t.fecha)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{t.descripcion}</div>
              {detalle && (
                <div className="truncate text-xs opacity-60">{detalle}</div>
              )}
            </div>

            <div
              className={`shrink-0 text-sm font-medium tabular-nums ${
                esIngreso ? "text-ingreso" : "text-egreso"
              }`}
            >
              {formatearARSConSigno(esIngreso ? t.monto : -t.monto)}
            </div>

            {/* Juntos y sin espacio extra: en el celular cada px de la
                descripción cuenta. */}
            <div className="flex shrink-0">
              <BotonEditar transaccion={t} />
              <BotonEliminar id={t.id} descripcion={t.descripcion} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import FormularioTransaccion from "@/components/formulario-transaccion";
import GestorCategorias from "@/components/gestor-categorias";
import { useMovimientos } from "@/components/proveedor-movimientos";

/**
 * El alta de transacciones y el gestor de categorías. La lista de categorías
 * la comparten con la edición de cada fila, vía `ProveedorMovimientos`: si
 * creás una categoría desde el selector, aparece al toque en el modal, y si
 * la borrás en el modal, desaparece del selector.
 */
export default function PanelAlta({
  fechaPorDefecto,
}: {
  fechaPorDefecto: string;
}) {
  const { custom, eliminar, reglas } = useMovimientos();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <GestorCategorias custom={custom} eliminar={eliminar} reglas={reglas} />
      </div>
      {/* key={fechaPorDefecto}: al cambiar de mes el form se rearma con la
          fecha nueva, pero la lista de categorías se mantiene. */}
      <FormularioTransaccion
        key={fechaPorDefecto}
        fechaPorDefecto={fechaPorDefecto}
      />
    </div>
  );
}

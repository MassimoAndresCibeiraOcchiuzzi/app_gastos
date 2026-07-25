"use client";

import FormularioTransaccion from "@/components/formulario-transaccion";
import GestorCategorias from "@/components/gestor-categorias";
import { useCategorias } from "@/components/use-categorias";
import type { CategoriaUsuario } from "@/lib/types";

/**
 * Junta el alta de transacciones con el gestor de categorías para que
 * compartan la misma lista: si creás una categoría desde el selector, aparece
 * al toque en el modal, y si la borrás en el modal, desaparece del selector.
 */
export default function PanelAlta({
  fechaPorDefecto,
  cuentasConocidas,
  categoriasIniciales,
}: {
  fechaPorDefecto: string;
  cuentasConocidas: string[];
  categoriasIniciales: CategoriaUsuario[];
}) {
  const { custom, nombres, crear, eliminar } = useCategorias(categoriasIniciales);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <GestorCategorias custom={custom} eliminar={eliminar} />
      </div>
      {/* key={fechaPorDefecto}: al cambiar de mes el form se rearma con la
          fecha nueva, pero la lista de categorías (arriba) se mantiene. */}
      <FormularioTransaccion
        key={fechaPorDefecto}
        fechaPorDefecto={fechaPorDefecto}
        cuentasConocidas={cuentasConocidas}
        categorias={nombres}
        onCrearCategoria={crear}
      />
    </div>
  );
}

/** Espejo en TypeScript de la tabla `transacciones` (ver supabase/schema.sql). */
export type Tipo = "ingreso" | "egreso";
export type Origen = "manual" | "pdf";

export type Transaccion = {
  id: string;
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  monto: number;
  tipo: Tipo;
  categoria: string | null;
  cuenta: string | null;
  origen: Origen;
  /**
   * Gasto fijo (marca informativa, supabase/gastos_fijos.sql). Opcional: si
   * todavía no se corrió ese SQL, la columna no viene.
   */
  es_fijo?: boolean;
  usuario_id: string;
  created_at: string;
};

/** Una categoría personalizada (ver supabase/categorias.sql). */
export type CategoriaUsuario = { id: string; nombre: string };

/**
 * Resultado del alta o la edición de una transacción.
 * Vive acá y no en el archivo de server actions porque un módulo `"use server"`
 * sólo puede exportar funciones async.
 */
export type CampoFormulario =
  | "monto"
  | "descripcion"
  | "tipo"
  | "categoria"
  | "cuenta"
  | "fecha";

export type EstadoFormulario = {
  ok: boolean;
  /** Error general (sesión caída, falla de Supabase). */
  error?: string;
  /**
   * Algo salió a medias pero lo principal se guardó (p. ej. la transacción sí,
   * la regla de categoría no). Se muestra sin tratarlo como error.
   */
  aviso?: string;
  /** Errores de validación, por campo. */
  errores?: Partial<Record<CampoFormulario, string>>;
};

export const ESTADO_INICIAL: EstadoFormulario = { ok: false };

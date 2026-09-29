import { totalesPorMes } from "./agregados";
import {
  MONTO_MAXIMO,
  esFechaISO,
  parsearMonto,
  redondearCentavos,
  sumarMeses,
} from "./formato";
import type { Transaccion } from "./types";
import { FECHA_MAXIMA, FECHA_MINIMA } from "./validacion";

/**
 * La meta de ahorro: juntar `monto_objetivo` para `fecha_objetivo`, contando
 * desde `fecha_inicio`. Este módulo es puro (sin Supabase): hace las cuentas
 * para el Dashboard y valida el formulario. Lo testean los tests.
 *
 * Todo se cuenta por mes, no por día: el balance de un mes es ingresos −
 * egresos de ese mes, el mismo número que "Balance" en Movimientos.
 */

/** La meta guardada (ver supabase/metas_ahorro.sql). */
export type MetaAhorro = {
  nombre: string;
  monto_objetivo: number;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_objetivo: string; // YYYY-MM-DD
};

export const MAX_NOMBRE_META = 60;

/** Meses completos que se miran para el ritmo reciente. */
export const MESES_RITMO = 6;
/** Con menos meses con datos que esto, no se proyecta: sería adivinar. */
export const MINIMO_MESES_RITMO = 3;

export type BalanceMes = { mes: string; balance: number };

export type Proyeccion =
  /** El acumulado ya llegó al objetivo. */
  | { tipo: "alcanzada" }
  /** Menos de 3 meses completos con movimientos: no hay ritmo confiable. */
  | { tipo: "sin-datos"; mesesConDatos: number }
  /** El ritmo reciente es 0 o negativo: a este paso no se llega nunca. */
  | { tipo: "sin-ritmo" }
  /**
   * A este ritmo se llega en `mes` (dentro de `meses` meses).
   * `estado` compara ese mes contra el de la fecha objetivo.
   */
  | {
      tipo: "estimada";
      mes: string;
      meses: number;
      estado: "adelantado" | "a-tiempo" | "atrasado";
    };

export type ProgresoMeta = {
  /** Suma de los balances desde el mes de inicio hasta el actual, incluido. */
  acumulado: number;
  /** Los balances que suman el acumulado, mes por mes. */
  balances: BalanceMes[];
  /** objetivo − acumulado. 0 o negativo = meta cumplida. */
  falta: number;
  /** acumulado / objetivo, en %, entero, entre 0 y 100 (para la barra). */
  porcentaje: number;
  /**
   * Meses que quedan para seguir ahorrando: del mes que viene al de la fecha
   * objetivo, inclusive. El mes actual no cuenta: su balance ya está (a
   * medias) en el acumulado.
   */
  mesesRestantes: number;
  /** falta / mesesRestantes. null si no falta nada o no quedan meses. */
  necesarioPorMes: number | null;
  /**
   * Promedio del balance de los últimos meses completos con movimientos
   * (hasta 6, sin el actual). null si hay menos de 3.
   */
  ritmo: { promedio: number; meses: number } | null;
  proyeccion: Proyeccion;
  /** La fecha objetivo ya pasó y no se llegó. */
  vencida: boolean;
};

/** Meses de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function mesesEntre(desde: string, hasta: string): number {
  const n = (mes: string) => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7));
  return n(hasta) - n(desde);
}

/** Los meses de `desde` a `hasta`, inclusive. Vacío si `desde` es posterior. */
function rangoDeMeses(desde: string, hasta: string): string[] {
  const cantidad = mesesEntre(desde, hasta) + 1;
  return Array.from({ length: Math.max(0, cantidad) }, (_, i) => sumarMeses(desde, i));
}

function balancesDe(transacciones: Transaccion[], meses: string[]): BalanceMes[] {
  return totalesPorMes(transacciones, meses).map((m) => ({
    mes: m.mes,
    balance: redondearCentavos(m.ingresos - m.egresos),
  }));
}

/**
 * Las transacciones que hacen falta para calcular la meta: desde el mes de
 * inicio (o 6 meses antes del actual, para el ritmo, lo que sea antes) hasta
 * el fin del mes actual. `desde` inclusive, `hasta` exclusive, como
 * `traerTransacciones`.
 */
export function rangoParaMeta(
  meta: MetaAhorro,
  mesHoy: string,
): { desde: string; hasta: string } {
  const inicio = meta.fecha_inicio.slice(0, 7);
  const ritmo = sumarMeses(mesHoy, -MESES_RITMO);
  const primero = inicio < ritmo ? inicio : ritmo;
  return { desde: `${primero}-01`, hasta: `${sumarMeses(mesHoy, 1)}-01` };
}

/**
 * Todas las cuentas de la meta al día de hoy (`hoy` = "YYYY-MM-DD").
 *
 * El acumulado suma el balance de CADA mes desde el de `fecha_inicio`
 * (entero, aunque la meta se haya creado a mitad de mes: lo importado de un
 * resumen cae el día 1) hasta el actual, con lo que lleve cargado. Un mes que
 * cerró con plata de sobra suma; uno que cerró en rojo, resta.
 *
 * El ritmo sale de los meses completos anteriores al actual que tienen al
 * menos un movimiento, sin importar cuándo empezó la meta: un mes vacío
 * seguramente es un mes que no se cargó, y promediarlo como $0 mentiría.
 */
export function progresoMeta(
  meta: MetaAhorro,
  transacciones: Transaccion[],
  hoy: string,
): ProgresoMeta {
  const mesHoy = hoy.slice(0, 7);
  const mesInicio = meta.fecha_inicio.slice(0, 7);
  const mesObjetivo = meta.fecha_objetivo.slice(0, 7);

  const balances = balancesDe(transacciones, rangoDeMeses(mesInicio, mesHoy));
  const acumulado = redondearCentavos(balances.reduce((acc, b) => acc + b.balance, 0));
  const falta = redondearCentavos(meta.monto_objetivo - acumulado);
  const porcentaje = Math.min(
    100,
    Math.max(0, Math.floor((acumulado / meta.monto_objetivo) * 100)),
  );

  const mesesRestantes = Math.max(0, mesesEntre(mesHoy, mesObjetivo));
  const necesarioPorMes =
    falta > 0 && mesesRestantes > 0 ? redondearCentavos(falta / mesesRestantes) : null;

  const conDatos = new Set(transacciones.map((t) => t.fecha.slice(0, 7)));
  const completos = rangoDeMeses(sumarMeses(mesHoy, -MESES_RITMO), sumarMeses(mesHoy, -1))
    .filter((m) => conDatos.has(m));
  const ritmo =
    completos.length >= MINIMO_MESES_RITMO
      ? {
          promedio: redondearCentavos(
            balancesDe(transacciones, completos).reduce((acc, b) => acc + b.balance, 0) /
              completos.length,
          ),
          meses: completos.length,
        }
      : null;

  let proyeccion: Proyeccion;
  if (falta <= 0) proyeccion = { tipo: "alcanzada" };
  else if (!ritmo) proyeccion = { tipo: "sin-datos", mesesConDatos: completos.length };
  else if (ritmo.promedio <= 0) proyeccion = { tipo: "sin-ritmo" };
  else {
    const meses = Math.ceil(falta / ritmo.promedio);
    const mes = sumarMeses(mesHoy, meses);
    proyeccion = {
      tipo: "estimada",
      mes,
      meses,
      estado: mes < mesObjetivo ? "adelantado" : mes === mesObjetivo ? "a-tiempo" : "atrasado",
    };
  }

  return {
    acumulado,
    balances,
    falta,
    porcentaje,
    mesesRestantes,
    necesarioPorMes,
    ritmo,
    proyeccion,
    vencida: falta > 0 && hoy > meta.fecha_objetivo,
  };
}

/** Lo que manda el formulario: todo texto. */
export type EntradaMeta = {
  nombre: string;
  monto: string;
  fecha_inicio: string;
  fecha_objetivo: string;
};

export type CampoMeta = keyof EntradaMeta;

export type ResultadoValidacionMeta =
  | { ok: true; valor: MetaAhorro }
  | { ok: false; errores: Partial<Record<CampoMeta, string>> };

/** Valida el formulario de la meta. Mismas reglas que el CHECK del SQL. */
export function validarMeta(entrada: EntradaMeta): ResultadoValidacionMeta {
  const errores: Partial<Record<CampoMeta, string>> = {};

  const nombre = entrada.nombre.trim();
  if (nombre === "") errores.nombre = "Poné un nombre.";
  else if (nombre.length > MAX_NOMBRE_META) {
    errores.nombre = `Máximo ${MAX_NOMBRE_META} caracteres.`;
  }

  const monto = parsearMonto(entrada.monto);
  if (monto === null) errores.monto = "Poné un número.";
  else if (monto <= 0) errores.monto = "Tiene que ser mayor a cero.";
  else if (monto > MONTO_MAXIMO) errores.monto = "Demasiado grande.";

  const fechaValida = (f: string) => esFechaISO(f) && f >= FECHA_MINIMA && f <= FECHA_MAXIMA;
  if (!fechaValida(entrada.fecha_inicio)) errores.fecha_inicio = "Fecha inválida.";
  if (!fechaValida(entrada.fecha_objetivo)) errores.fecha_objetivo = "Fecha inválida.";
  else if (!errores.fecha_inicio && entrada.fecha_objetivo <= entrada.fecha_inicio) {
    errores.fecha_objetivo = "Tiene que ser posterior a la de inicio.";
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return {
    ok: true,
    valor: {
      nombre,
      monto_objetivo: monto!,
      fecha_inicio: entrada.fecha_inicio,
      fecha_objetivo: entrada.fecha_objetivo,
    },
  };
}

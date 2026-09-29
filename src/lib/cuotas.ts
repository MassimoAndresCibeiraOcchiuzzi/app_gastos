import { redondearCentavos, sumarMeses } from "./formato";
import { mesesEntre } from "./metas";
import { claveComercio } from "./reglas";
import type { Transaccion } from "./types";

/**
 * Compras en cuotas: se detectan por la descripción ("SMARTPHONE XYZ - Cuota
 * 03/06"), se agrupan las cuotas de una misma compra a lo largo de los meses y
 * se proyecta cuánto queda comprometido en los meses que vienen.
 *
 * Todo es puro y tolerante: una descripción que no tiene un patrón de cuota
 * reconocible simplemente no entra al cálculo. Nunca tira error.
 */

/**
 * El patrón de cuota. Reconoce, sin importar mayúsculas:
 *
 * - la palabra: "Cuota", "Cuotas", "Cuot", "Cta", "Ctas" o "C" sola;
 * - un separador opcional después: "." ":" "-" "#" o nada ("C.03/06",
 *   "CUOTA: 3/6", "C03/06");
 * - opcionalmente "N°", "Nº", "Nro" ("Cuota N° 3/6");
 * - dos números de 1 o 2 dígitos separados por "/", "-" o "de", con o sin
 *   espacios ("03/06", "3 / 6", "03-06", "3 de 6").
 *
 * La palabra tiene que empezar después de algo que no sea letra ni número:
 * así "MC 03/06" o "ETC 3/6" no se toman por "C 03/06".
 *
 * Un "03/06" suelto, sin palabra, NO se reconoce a propósito: es
 * indistinguible de una fecha (3 de junio).
 */
const PATRON_CUOTA =
  /(?<![\p{L}\p{N}])(?:cuotas?|cuot|ctas?|c)\.?\s*(?:[:#-]\s*)?(?:(?:n|nro)\s*[.°º]?\s*)?(\d{1,2})\s*(?:\/|-|de)\s*(\d{1,2})(?!\d)/giu;

/** Máximo de cuotas que se acepta: más que esto es seguro otra cosa. */
const MAX_CUOTAS = 60;

export type CuotaDetectada = {
  /** Qué cuota es ésta (1 = la primera). */
  actual: number;
  /** De cuántas cuotas es la compra (2 o más). */
  total: number;
  /** La descripción sin la indicación de cuota: "SMARTPHONE XYZ". */
  base: string;
};

/** Separadores que quedan colgando al sacar la cuota: " - ", "()", ",". */
const BORDES = /^[\s\-–—.,:;/|()[\]]+|[\s\-–—.,:;/|()[\]]+$/g;

/**
 * Busca la indicación de cuota en una descripción. Si hay más de una, toma la
 * última (la cuota suele ir al final). null si no hay ninguna válida: la
 * cuota tiene que estar entre 1 y el total, y el total entre 2 y 60.
 */
export function detectarCuota(descripcion: string): CuotaDetectada | null {
  if (typeof descripcion !== "string" || descripcion === "") return null;

  const coincidencias = [...descripcion.matchAll(PATRON_CUOTA)];
  for (let i = coincidencias.length - 1; i >= 0; i--) {
    const m = coincidencias[i];
    const actual = Number(m[1]);
    const total = Number(m[2]);
    if (total < 2 || total > MAX_CUOTAS || actual < 1 || actual > total) continue;

    const inicio = m.index ?? 0;
    const sinCuota =
      descripcion.slice(0, inicio) + " " + descripcion.slice(inicio + m[0].length);
    const base = sinCuota.replace(/\s+/g, " ").replace(BORDES, "").trim();
    return { actual, total, base: base === "" ? "Compra en cuotas" : base };
  }
  return null;
}

/** Una compra en cuotas, armada con todas sus cuotas vistas. */
export type CompraEnCuotas = {
  /** Identifica la compra: comercio + cuotas + monto + mes de la cuota 1. */
  clave: string;
  /** Cómo se muestra: la descripción de la última cuota, sin la cuota. */
  nombre: string;
  /** Monto de cada cuota (el de la última vista), por las copias. */
  montoCuota: number;
  total: number;
  /** El mes de la cuota 1 (calculado, puede ser anterior a lo cargado). */
  mesPrimera: string;
  /** El mes de la última cuota. */
  mesUltima: string;
  /** La cuota más alta que está cargada. */
  ultimaCargada: number;
  /**
   * Cuántas compras idénticas hay (mismo comercio, monto, cuotas y mes): dos
   * cuotas con el mismo número en el mismo mes son dos compras, no una.
   */
  copias: number;
};

/**
 * Agrupa las cuotas de cada compra. Dos cuotas son de la misma compra si
 * tienen el mismo comercio (normalizado como las reglas: sin tildes, números
 * sueltos ni separadores), la misma cantidad de cuotas, el mismo monto
 * (redondeado al peso) y apuntan al mismo mes de primera cuota.
 *
 * El mes de la primera cuota sale de la fecha: la cuota 3 registrada en
 * septiembre dice que la 1 fue en julio. Así dos compras iguales hechas en
 * meses distintos no se mezclan. Sirve porque lo importado se registra en el
 * mes en que se paga el resumen.
 *
 * Sólo egresos: una devolución de una compra en cuotas no es una cuota más.
 */
export function comprasEnCuotas(transacciones: Transaccion[]): CompraEnCuotas[] {
  type Grupo = {
    nombre: string;
    monto: number;
    total: number;
    mesPrimera: string;
    ultima: number;
    porNumero: Map<number, number>;
  };
  const grupos = new Map<string, Grupo>();

  for (const t of transacciones) {
    if (t.tipo !== "egreso" || !(t.monto > 0)) continue;
    const cuota = detectarCuota(t.descripcion);
    if (!cuota) continue;

    const mesPrimera = sumarMeses(t.fecha.slice(0, 7), -(cuota.actual - 1));
    const comercio = claveComercio(cuota.base) ?? cuota.base.toUpperCase();
    const clave = `${comercio}|${cuota.total}|${Math.round(t.monto)}|${mesPrimera}`;

    let g = grupos.get(clave);
    if (!g) {
      g = {
        nombre: cuota.base,
        monto: t.monto,
        total: cuota.total,
        mesPrimera,
        ultima: 0,
        porNumero: new Map(),
      };
      grupos.set(clave, g);
    }
    if (cuota.actual >= g.ultima) {
      g.ultima = cuota.actual;
      g.nombre = cuota.base;
      g.monto = t.monto;
    }
    g.porNumero.set(cuota.actual, (g.porNumero.get(cuota.actual) ?? 0) + 1);
  }

  return [...grupos.entries()].map(([clave, g]) => ({
    clave,
    nombre: g.nombre,
    montoCuota: g.monto,
    total: g.total,
    mesPrimera: g.mesPrimera,
    mesUltima: sumarMeses(g.mesPrimera, g.total - 1),
    ultimaCargada: g.ultima,
    copias: Math.max(...g.porNumero.values()),
  }));
}

/** Lo que aporta una compra a un mes de la proyección. */
export type CuotaDelMes = {
  clave: string;
  nombre: string;
  /** Qué cuota cae ese mes. */
  numero: number;
  total: number;
  /** Monto de la cuota × copias. */
  monto: number;
  copias: number;
};

export type MesComprometido = { mes: string; total: number; cuotas: CuotaDelMes[] };

/** Una compra que sigue teniendo cuotas por pagar después del mes actual. */
export type CompraActiva = {
  clave: string;
  nombre: string;
  montoCuota: number;
  copias: number;
  total: number;
  /** La próxima cuota a pagar (la del mes que viene). */
  proxima: number;
  /** Cuántas quedan desde el mes que viene, inclusive. */
  restantes: number;
  /** restantes × monto de la cuota × copias. */
  pendiente: number;
  mesUltima: string;
};

export type ProyeccionCuotas = {
  /** Los meses que vienen, del siguiente al actual en adelante. */
  meses: MesComprometido[];
  compras: CompraActiva[];
  /** Todo lo que queda por pagar en cuotas, sin límite de meses. */
  totalPendiente: number;
};

/**
 * Proyecta lo comprometido a partir del mes que viene. La cuota del mes
 * actual no entra: ese resumen ya se pagó o se está por pagar, y si se
 * importó ya está en los gastos del mes.
 *
 * La cuota de un mes futuro sale del calendario de la compra (la cuota 1 en
 * `mesPrimera`, una por mes), no de lo último cargado: si un mes no se
 * importó, la proyección no se corre.
 *
 * `horizonte` limita cuántos meses se devuelven en `meses` (para el gráfico);
 * `totalPendiente` y `compras` cuentan todo, hasta la última cuota.
 */
export function proyectarCuotas(
  compras: CompraEnCuotas[],
  mesHoy: string,
  horizonte = 12,
): ProyeccionCuotas {
  const activas: CompraActiva[] = [];
  for (const c of compras) {
    const restantes = mesesEntre(mesHoy, c.mesUltima);
    if (restantes <= 0) continue;
    const proxima = mesesEntre(c.mesPrimera, sumarMeses(mesHoy, 1)) + 1;
    activas.push({
      clave: c.clave,
      nombre: c.nombre,
      montoCuota: c.montoCuota,
      copias: c.copias,
      total: c.total,
      // Una compra cuya primera cuota todavía no llegó arranca en la 1.
      proxima: Math.max(1, proxima),
      restantes: Math.min(restantes, c.total),
      pendiente: redondearCentavos(
        Math.min(restantes, c.total) * c.montoCuota * c.copias,
      ),
      mesUltima: c.mesUltima,
    });
  }
  activas.sort(
    (a, b) => b.pendiente - a.pendiente || a.nombre.localeCompare(b.nombre, "es"),
  );

  const meses: MesComprometido[] = [];
  for (let i = 1; i <= horizonte; i++) {
    const mes = sumarMeses(mesHoy, i);
    const cuotas: CuotaDelMes[] = [];
    for (const c of compras) {
      const numero = mesesEntre(c.mesPrimera, mes) + 1;
      if (numero < 1 || numero > c.total) continue;
      cuotas.push({
        clave: c.clave,
        nombre: c.nombre,
        numero,
        total: c.total,
        monto: redondearCentavos(c.montoCuota * c.copias),
        copias: c.copias,
      });
    }
    cuotas.sort((a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre, "es"));
    meses.push({
      mes,
      total: redondearCentavos(cuotas.reduce((acc, c) => acc + c.monto, 0)),
      cuotas,
    });
  }
  // Sin meses vacíos al final: el gráfico termina con la última cuota.
  while (meses.length > 0 && meses[meses.length - 1].total === 0) meses.pop();

  return {
    meses,
    compras: activas,
    totalPendiente: redondearCentavos(activas.reduce((acc, c) => acc + c.pendiente, 0)),
  };
}

/** Meses de historia que se miran para encontrar las compras en cuotas. */
export const MESES_CUOTAS = 12;

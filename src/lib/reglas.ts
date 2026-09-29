import { CATEGORIA_AJUSTES, MAX_CATEGORIA } from "./categorias";
import { contieneClave, palabras } from "./extraccion";

/**
 * Reglas de categorización por comercio: "lo de COTO va en Comida". Se crean
 * cuando el usuario corrige la categoría de un gasto (al editarlo en
 * Movimientos o en la revisión de un import) y se aplican en el próximo
 * import, por encima de lo que sugiera la IA.
 *
 * Este módulo es puro (sin Supabase): lo usan el servidor, para guardar y
 * aplicar, y el navegador, para mostrar qué patrón se va a recordar.
 */

/** Una regla guardada (ver supabase/reglas_categoria.sql). */
export type ReglaCategoria = {
  id: string;
  patron_comercio: string;
  categoria: string;
};

/** Largo máximo del patrón, igual que el CHECK del SQL. */
export const MAX_PATRON = 100;

/**
 * Mínimo de letras/números del patrón, sin contar espacios. Un patrón de una
 * o dos letras ("YP", "A") coincidiría con demasiados comercios distintos.
 */
const MIN_PATRON = 3;

/**
 * Palabras que no identifican al comercio: la indicación de cuota. Los
 * números sueltos (sucursal, comprobante, "03/06") se sacan aparte.
 */
const SIN_COMERCIO = new Set(["CUOTA", "CUOTAS", "CTA", "CUO"]);

/**
 * Las palabras que identifican al comercio: las mismas que usa el filtro de
 * importación (MAYÚSCULAS, sin tildes, cortadas en cualquier separador), sin
 * números sueltos ni la indicación de cuota.
 *
 * "Coto Suc. 123" y "COTO SUC 45" → [COTO, SUC].
 * "SMARTPHONE XYZ - Cuota 03/06" → [SMARTPHONE, XYZ].
 */
function palabrasDeComercio(descripcion: string): string[] {
  return palabras(descripcion).filter(
    (p) => !/^\d+$/.test(p) && !SIN_COMERCIO.has(p),
  );
}

/**
 * El patrón que se guarda para una descripción: sus palabras de comercio,
 * separadas por un espacio. null si no queda nada que sirva (una descripción
 * que es sólo números, o de menos de 3 letras).
 *
 * Si la descripción es muy larga, se cortan palabras enteras del final: un
 * patrón con media palabra no coincidiría nunca.
 */
export function claveComercio(descripcion: string): string | null {
  let clave = "";
  for (const p of palabrasDeComercio(descripcion)) {
    const siguiente = clave === "" ? p : `${clave} ${p}`;
    if (siguiente.length > MAX_PATRON) break;
    clave = siguiente;
  }
  return clave.replace(/ /g, "").length >= MIN_PATRON ? clave : null;
}

/**
 * ¿La regla aplica a esta descripción? Las palabras del patrón tienen que
 * aparecer completas y seguidas entre las de comercio de la descripción. La
 * comparación es la del filtro (`contieneClave`): "COTO SUC" coincide con
 * "Coto Suc. 45" y con "MERPAGO*COTO SUC 9", pero "COTO" no coincide con
 * "COTORRA".
 */
function coincide(palabrasDescripcion: string[], patron: string): boolean {
  const compacto = patron.replace(/ /g, "");
  return compacto !== "" && contieneClave(palabrasDescripcion, compacto);
}

/**
 * La regla que corresponde a una descripción, o null. Si coinciden varias,
 * gana la más específica (el patrón más largo): "MERPAGO RAPPI" le gana a
 * "MERPAGO". Con el mismo largo, la primera en orden alfabético, para que el
 * resultado no dependa del orden en que vinieron de la base.
 */
export function buscarRegla<R extends { patron_comercio: string }>(
  descripcion: string,
  reglas: readonly R[],
): R | null {
  const tokens = palabrasDeComercio(descripcion);
  let mejor: R | null = null;
  for (const regla of reglas) {
    if (!coincide(tokens, regla.patron_comercio)) continue;
    if (
      mejor === null ||
      regla.patron_comercio.length > mejor.patron_comercio.length ||
      (regla.patron_comercio.length === mejor.patron_comercio.length &&
        regla.patron_comercio < mejor.patron_comercio)
    ) {
      mejor = regla;
    }
  }
  return mejor;
}

/**
 * Pisa la categoría de la IA con la de la regla del usuario, en los ítems que
 * tengan una. Anota en `regla` qué patrón se usó, para mostrarlo en la
 * revisión.
 *
 * `validas` son las categorías que el usuario puede elegir hoy. Una regla que
 * apunta a una categoría que ya no existe se ignora (queda la sugerencia de la
 * IA) en vez de meter una categoría fantasma. El nombre se devuelve como está
 * en `validas`, igual que `resolverCategoria`.
 */
export function aplicarReglas<T extends { descripcion: string; categoria: string }>(
  items: readonly T[],
  reglas: readonly ReglaCategoria[],
  validas: readonly string[],
): (T & { regla?: string })[] {
  if (reglas.length === 0) return [...items];

  const porNombre = new Map(validas.map((v) => [v.trim().toLowerCase(), v]));
  const utiles = reglas.filter(
    (r) =>
      r.categoria !== CATEGORIA_AJUSTES &&
      porNombre.has(r.categoria.trim().toLowerCase()),
  );

  return items.map((item) => {
    const regla = buscarRegla(item.descripcion, utiles);
    if (!regla) return item;
    return {
      ...item,
      categoria: porNombre.get(regla.categoria.trim().toLowerCase())!,
      regla: regla.patron_comercio,
    };
  });
}

/** Lo que manda el cliente para recordar: la descripción y la categoría elegida. */
export type PedidoRegla = { descripcion: string; categoria: string };

/** Una regla lista para guardar. */
export type ReglaNueva = { patron_comercio: string; categoria: string };

/**
 * Valida y deduplica lo que mandó el cliente. El patrón se calcula acá, de la
 * descripción, y nunca se acepta uno armado por el cliente. Se descartan en
 * silencio los pedidos que no sirven (sin patrón, categoría vacía o
 * demasiado larga, o el ajuste de impuestos, que no es un comercio). Si el
 * mismo comercio aparece dos veces, gana el último: es la corrección más
 * reciente.
 */
export function reglasParaGuardar(pedidos: readonly PedidoRegla[]): ReglaNueva[] {
  const porPatron = new Map<string, ReglaNueva>();
  for (const pedido of pedidos) {
    if (typeof pedido?.descripcion !== "string") continue;
    if (typeof pedido?.categoria !== "string") continue;

    const categoria = pedido.categoria.trim();
    if (categoria === "" || categoria.length > MAX_CATEGORIA) continue;
    if (categoria === CATEGORIA_AJUSTES) continue;

    const patron = claveComercio(pedido.descripcion);
    if (patron === null) continue;

    porPatron.delete(patron); // así el último queda al final del orden
    porPatron.set(patron, { patron_comercio: patron, categoria });
  }
  return [...porPatron.values()];
}

import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * El código de la app importa sin extensión (`./categorias`), que es lo que
 * espera el bundler de Next. Node, en cambio, exige la extensión exacta.
 * Este hook cierra esa diferencia para poder testear los módulos .ts directo,
 * sin build ni dependencias extra.
 */
registerHooks({
  resolve(especificador, contexto, siguiente) {
    // `server-only` existe para que el bundler de Next avise si un módulo de
    // servidor termina en el cliente. Fuera de Next simplemente explota, así
    // que acá lo reemplazamos por un módulo vacío: el guard sigue puesto en
    // producción y los tests pueden importar código de servidor.
    if (especificador === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }

    const esRelativo = especificador.startsWith(".");
    const tieneExtension = /\.[mc]?[jt]s$/.test(especificador);

    if (esRelativo && !tieneExtension && contexto.parentURL) {
      const url = new URL(`${especificador}.ts`, contexto.parentURL);
      // Sin `format`: dejamos que Node detecte que es TypeScript y le saque
      // los tipos. Forzar "module" lo hace parsear el .ts como JS y explota.
      if (existsSync(fileURLToPath(url))) {
        return { url: url.href, shortCircuit: true };
      }
    }

    return siguiente(especificador, contexto);
  },
});

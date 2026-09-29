import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarReglas,
  buscarRegla,
  claveComercio,
  reglasParaGuardar,
  MAX_PATRON,
} from "../src/lib/reglas.ts";
import { CATEGORIAS_CONSUMO } from "../src/lib/categorias.ts";

const regla = (patron_comercio, categoria, id = patron_comercio) => ({
  id,
  patron_comercio,
  categoria,
});

// El mismo formato que exige el CHECK de supabase/reglas_categoria.sql.
const FORMATO_SQL = /^[A-Z0-9]+( [A-Z0-9]+)*$/;

test("claveComercio normaliza como el filtro: mayúsculas, sin tildes ni separadores", () => {
  assert.equal(claveComercio("Café Martínez"), "CAFE MARTINEZ");
  assert.equal(claveComercio("MERPAGO*RAPPI"), "MERPAGO RAPPI");
  assert.equal(claveComercio("  coto   suc.  "), "COTO SUC");
});

test("claveComercio saca números sueltos y la indicación de cuota", () => {
  assert.equal(claveComercio("COTO SUC 123"), "COTO SUC");
  assert.equal(claveComercio("Coto Suc. 45"), "COTO SUC");
  assert.equal(claveComercio("SMARTPHONE XYZ - Cuota 03/06"), "SMARTPHONE XYZ");
  assert.equal(claveComercio("YPF 1234 PALERMO"), "YPF PALERMO");
  // Números pegados a letras sí identifican: "7ELEVEN" queda.
  assert.equal(claveComercio("7ELEVEN 001"), "7ELEVEN");
});

test("claveComercio devuelve null si no queda un comercio reconocible", () => {
  assert.equal(claveComercio(""), null);
  assert.equal(claveComercio("123 456"), null);
  assert.equal(claveComercio("AB"), null);
  assert.equal(claveComercio("Cuota 01/12"), null);
});

test("claveComercio respeta el formato y el largo del CHECK del SQL", () => {
  for (const d of ["Café Martínez", "MERPAGO*RAPPI", "Ñandú S.A. 12", "a-b-c"]) {
    const clave = claveComercio(d);
    assert.match(clave, FORMATO_SQL, d);
  }
  const larga = claveComercio("PALABRA ".repeat(40));
  assert.ok(larga.length <= MAX_PATRON);
  // Corta en palabras enteras, nunca a la mitad.
  assert.ok(larga.split(" ").every((p) => p === "PALABRA"));
});

test("buscarRegla reconoce variantes de escritura del mismo comercio", () => {
  const reglas = [regla("COTO SUC", "Comida")];
  for (const d of ["COTO SUC 123", "Coto Suc. 45", "coto-suc", "MERPAGO*COTO SUC 9"]) {
    assert.equal(buscarRegla(d, reglas)?.categoria, "Comida", d);
  }
});

test("buscarRegla compara palabras completas, no pedazos", () => {
  const reglas = [regla("COTO", "Comida")];
  assert.equal(buscarRegla("COTORRA SA", reglas), null);
  assert.equal(buscarRegla("ESCOTO", reglas), null);
  assert.equal(buscarRegla("COTO 45", reglas)?.categoria, "Comida");
});

test("buscarRegla ignora los números entre palabras (igual que al guardar)", () => {
  const reglas = [regla(claveComercio("YPF 1234 PALERMO"), "Transporte")];
  assert.equal(buscarRegla("YPF 9999 PALERMO", reglas)?.categoria, "Transporte");
});

test("buscarRegla: gana la regla más específica, sin depender del orden", () => {
  const a = regla("MERPAGO", "Otros");
  const b = regla("MERPAGO RAPPI", "Comida");
  assert.equal(buscarRegla("MERPAGO*RAPPI 12", [a, b])?.categoria, "Comida");
  assert.equal(buscarRegla("MERPAGO*RAPPI 12", [b, a])?.categoria, "Comida");
  assert.equal(buscarRegla("MERPAGO*UBER", [a, b])?.categoria, "Otros");
});

test("aplicarReglas pisa la categoría de la IA y anota la regla", () => {
  const items = [
    { descripcion: "COTO SUC 12", categoria: "Otros", monto: 100, fecha: "2026-01-02" },
    { descripcion: "NETFLIX", categoria: "Suscripciones", monto: 50, fecha: "2026-01-03" },
  ];
  const r = aplicarReglas(items, [regla("COTO SUC", "Comida")], CATEGORIAS_CONSUMO);
  assert.equal(r[0].categoria, "Comida");
  assert.equal(r[0].regla, "COTO SUC");
  assert.equal(r[0].monto, 100);
  // Sin regla: queda lo que sugirió la IA, sin marca.
  assert.equal(r[1].categoria, "Suscripciones");
  assert.equal(r[1].regla, undefined);
});

test("aplicarReglas ignora reglas a categorías que ya no existen", () => {
  const items = [{ descripcion: "GIMNASIO X", categoria: "Salud" }];
  const r = aplicarReglas(items, [regla("GIMNASIO X", "Deporte")], CATEGORIAS_CONSUMO);
  assert.equal(r[0].categoria, "Salud");
  assert.equal(r[0].regla, undefined);
  // Con la categoría propia creada, sí aplica, con el nombre como está en la lista.
  const conPropia = aplicarReglas(
    items,
    [regla("GIMNASIO X", "deporte")],
    [...CATEGORIAS_CONSUMO, "Deporte"],
  );
  assert.equal(conPropia[0].categoria, "Deporte");
});

test("aplicarReglas nunca manda un consumo a Ajustes tarjeta", () => {
  const items = [{ descripcion: "COTO", categoria: "Comida" }];
  const r = aplicarReglas(
    items,
    [regla("COTO", "Ajustes tarjeta")],
    [...CATEGORIAS_CONSUMO, "Ajustes tarjeta"],
  );
  assert.equal(r[0].categoria, "Comida");
});

test("aplicarReglas sin reglas devuelve los ítems como estaban", () => {
  const items = [{ descripcion: "COTO", categoria: "Comida" }];
  assert.deepEqual(aplicarReglas(items, [], CATEGORIAS_CONSUMO), items);
});

test("reglasParaGuardar calcula el patrón en el servidor y deduplica (gana el último)", () => {
  const r = reglasParaGuardar([
    { descripcion: "Coto Suc. 1", categoria: "Otros" },
    { descripcion: "NETFLIX", categoria: " Suscripciones " },
    { descripcion: "COTO SUC 2", categoria: "Comida" },
  ]);
  assert.deepEqual(r, [
    { patron_comercio: "NETFLIX", categoria: "Suscripciones" },
    { patron_comercio: "COTO SUC", categoria: "Comida" },
  ]);
});

test("reglasParaGuardar descarta pedidos inválidos", () => {
  const r = reglasParaGuardar([
    { descripcion: "123", categoria: "Comida" }, // sin comercio
    { descripcion: "COTO", categoria: "" }, // sin categoría
    { descripcion: "COTO", categoria: "x".repeat(41) }, // categoría larga
    { descripcion: "IIBB PERCEPCION", categoria: "Ajustes tarjeta" }, // el ajuste
    { descripcion: 5, categoria: "Comida" }, // basura del cliente
    null,
  ]);
  assert.deepEqual(r, []);
});

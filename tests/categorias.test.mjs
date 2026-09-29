import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLOR_CATEGORIA,
  COLOR_SIN_CATEGORIA,
  colorDeCategoria,
  normalizarNombreCategoria,
  CATEGORIAS_SUGERIBLES,
  CUENTA_IMPORTACION,
  categoriasParaSugerir,
  resolverCategoria,
} from "../src/lib/categorias.ts";

test("colorDeCategoria respeta el tono fijo de las del sistema", () => {
  assert.equal(colorDeCategoria("Comida"), COLOR_CATEGORIA.Comida);
  assert.equal(colorDeCategoria("Salud"), COLOR_CATEGORIA.Salud);
});

test("colorDeCategoria usa el neutro para null o vacío", () => {
  assert.equal(colorDeCategoria(null), COLOR_SIN_CATEGORIA);
  assert.equal(colorDeCategoria("   "), COLOR_SIN_CATEGORIA);
});

test("colorDeCategoria asigna a las personalizadas un tono de la paleta", () => {
  const color = colorDeCategoria("Viajes");
  assert.match(color, /^var\(--viz-[1-8]\)$/);
});

test("colorDeCategoria es estable: mismo nombre, mismo color", () => {
  assert.equal(colorDeCategoria("Mascotas"), colorDeCategoria("Mascotas"));
});

test("normalizarNombreCategoria ignora mayúsculas y bordes", () => {
  assert.equal(normalizarNombreCategoria("  Viajes "), "viajes");
  assert.equal(
    normalizarNombreCategoria("COMIDA"),
    normalizarNombreCategoria("comida"),
  );
});

test("CATEGORIAS_SUGERIBLES: los rubros del sistema, sin Tarjeta ni el ajuste", () => {
  assert.deepEqual([...CATEGORIAS_SUGERIBLES], [
    "Comida", "Transporte", "Suscripciones", "Alquiler",
    "Servicios", "Entretenimiento", "Salud", "Otros",
  ]);
});

test("categoriasParaSugerir suma las propias sin repetir ni colar Tarjeta", () => {
  assert.deepEqual(
    categoriasParaSugerir([" Viajes ", "viajes", "COMIDA", "tarjeta", "Ajustes Tarjeta", "", "Mascotas"]),
    [...CATEGORIAS_SUGERIBLES, "Viajes", "Mascotas"],
  );
  assert.deepEqual(categoriasParaSugerir([]), [...CATEGORIAS_SUGERIBLES]);
});

test("resolverCategoria: nombre canónico, u Otros si no está", () => {
  const validas = categoriasParaSugerir(["Viajes"]);
  assert.equal(resolverCategoria("salud", validas), "Salud");
  assert.equal(resolverCategoria("VIAJES", validas), "Viajes");
  assert.equal(resolverCategoria("Inventada", validas), "Otros");
  assert.equal(resolverCategoria(undefined, validas), "Otros");
  assert.equal(resolverCategoria("Tarjeta", [...validas, "Tarjeta"]), "Otros");
});

test("la cuenta de una importación arranca en Tarjeta", () => {
  assert.equal(CUENTA_IMPORTACION, "Tarjeta");
});

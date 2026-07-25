import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLOR_CATEGORIA,
  COLOR_SIN_CATEGORIA,
  colorDeCategoria,
  normalizarNombreCategoria,
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

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarTransaccion,
  aFilaTransaccion,
} from "../src/lib/validacion.ts";

const base = {
  monto: "1234,56",
  descripcion: "Verdulería",
  tipo: "egreso",
  categoria: "Comida",
  cuenta: "Efectivo",
  fecha: "2026-07-23",
};

test("validarTransaccion normaliza una entrada correcta", () => {
  const r = validarTransaccion(base);
  assert.equal(r.ok, true);
  assert.deepEqual(r.valor, {
    fecha: "2026-07-23",
    descripcion: "Verdulería",
    monto: 1234.56,
    tipo: "egreso",
    categoria: "Comida",
    cuenta: "Efectivo",
  });
});

test("validarTransaccion deja la cuenta vacía como null", () => {
  const r = validarTransaccion({ ...base, cuenta: "   " });
  assert.equal(r.valor.cuenta, null);
});

test("validarTransaccion recorta la descripción", () => {
  const r = validarTransaccion({ ...base, descripcion: "  Pan  " });
  assert.equal(r.valor.descripcion, "Pan");
});

test("validarTransaccion rechaza montos que no sirven", () => {
  for (const monto of ["", "abc", "0", "-50"]) {
    const r = validarTransaccion({ ...base, monto });
    assert.equal(r.ok, false, `debería rechazar "${monto}"`);
    assert.ok(r.errores.monto);
  }
});

test("validarTransaccion acepta monto negativo sólo con el permiso", () => {
  // El ajuste de impuestos: egreso negativo (crédito neto).
  const conPermiso = validarTransaccion({
    ...base,
    monto: "-17197,39",
    permitirMontoNegativo: true,
  });
  assert.equal(conPermiso.ok, true);
  assert.equal(conPermiso.valor.monto, -17197.39);

  // Sin el permiso (alta manual), el negativo sigue rechazado.
  const sinPermiso = validarTransaccion({ ...base, monto: "-17197,39" });
  assert.equal(sinPermiso.ok, false);
  assert.ok(sinPermiso.errores.monto);
});

test("validarTransaccion rechaza cero incluso con el permiso", () => {
  const r = validarTransaccion({
    ...base,
    monto: "0",
    permitirMontoNegativo: true,
  });
  assert.equal(r.ok, false);
  assert.ok(r.errores.monto);
});

test("validarTransaccion acepta la categoría Ajustes tarjeta", () => {
  const r = validarTransaccion({
    ...base,
    monto: "-500",
    categoria: "Ajustes tarjeta",
    permitirMontoNegativo: true,
  });
  assert.equal(r.ok, true);
  assert.equal(r.valor.categoria, "Ajustes tarjeta");
});

test("validarTransaccion acepta una categoría personalizada", () => {
  // "Viajes" no es del sistema, pero es un nombre válido que el usuario pudo
  // haber creado. La validación es texto libre: no conoce la lista.
  const r = validarTransaccion({ ...base, categoria: "Viajes" });
  assert.equal(r.ok, true);
  assert.equal(r.valor.categoria, "Viajes");
});

test("validarTransaccion rechaza categoría vacía o demasiado larga", () => {
  assert.ok(validarTransaccion({ ...base, categoria: "   " }).errores.categoria);
  assert.ok(
    validarTransaccion({ ...base, categoria: "x".repeat(41) }).errores.categoria,
  );
});

test("validarTransaccion rechaza el resto de los campos inválidos", () => {
  assert.ok(validarTransaccion({ ...base, descripcion: "   " }).errores.descripcion);
  assert.ok(validarTransaccion({ ...base, tipo: "otro" }).errores.tipo);
  assert.ok(validarTransaccion({ ...base, fecha: "2026-02-30" }).errores.fecha);
  assert.ok(validarTransaccion({ ...base, cuenta: "x".repeat(61) }).errores.cuenta);
  assert.ok(
    validarTransaccion({ ...base, descripcion: "x".repeat(201) }).errores.descripcion,
  );
});

test("validarTransaccion junta todos los errores de una", () => {
  const r = validarTransaccion({
    monto: "abc",
    descripcion: "",
    tipo: "",
    categoria: "",
    cuenta: "",
    fecha: "",
  });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errores).sort(), [
    "categoria",
    "descripcion",
    "fecha",
    "monto",
    "tipo",
  ]);
});

test("aFilaTransaccion agrega el usuario y el origen", () => {
  const { valor } = validarTransaccion(base);
  assert.deepEqual(aFilaTransaccion(valor, "u-1", "pdf"), {
    ...valor,
    usuario_id: "u-1",
    origen: "pdf",
  });
});

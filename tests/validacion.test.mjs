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

const ajuste = { ...base, categoria: "Ajustes tarjeta", tipo: "egreso" };

test("validarTransaccion acepta monto negativo sólo en el ajuste egreso", () => {
  // El ajuste de impuestos: egreso negativo (crédito neto).
  const r = validarTransaccion({ ...ajuste, monto: "-17197,39" });
  assert.equal(r.ok, true);
  assert.equal(r.valor.monto, -17197.39);
  assert.equal(r.valor.categoria, "Ajustes tarjeta");
});

test("validarTransaccion rechaza el negativo en cualquier otra combinación", () => {
  const casos = [
    { ...base, monto: "-500" }, // consumo común
    { ...ajuste, tipo: "ingreso", monto: "-500" }, // ajuste pero ingreso
    { ...base, categoria: "ajustes tarjeta", monto: "-500" }, // otra mayúscula
    { ...base, categoria: "Tarjeta", monto: "-500" },
  ];
  for (const caso of casos) {
    const r = validarTransaccion(caso);
    assert.equal(r.ok, false, JSON.stringify(caso));
    assert.ok(r.errores.monto);
  }
});

test("validarTransaccion ignora un permitirMontoNegativo que mande el cliente", () => {
  // Así llegaba antes el permiso: ahora es un campo cualquiera, sin efecto.
  const r = validarTransaccion({
    ...base,
    monto: "-500",
    permitirMontoNegativo: true,
  });
  assert.equal(r.ok, false);
  assert.ok(r.errores.monto);
});

test("validarTransaccion acepta el ajuste en positivo y el negativo con espacios", () => {
  assert.equal(validarTransaccion({ ...ajuste, monto: "500" }).ok, true);
  // La categoría se recorta antes de decidir, igual que lo que se guarda.
  const r = validarTransaccion({
    ...ajuste,
    categoria: "  Ajustes tarjeta ",
    monto: "-500",
  });
  assert.equal(r.ok, true);
  assert.equal(r.valor.categoria, "Ajustes tarjeta");
});

test("validarTransaccion rechaza cero incluso en el ajuste", () => {
  const r = validarTransaccion({ ...ajuste, monto: "0" });
  assert.equal(r.ok, false);
  assert.ok(r.errores.monto);
});

test("validarTransaccion acota la fecha a 2000-2100", () => {
  for (const fecha of ["2000-01-01", "2100-12-31"]) {
    assert.equal(validarTransaccion({ ...base, fecha }).ok, true, fecha);
  }
  for (const fecha of ["1999-12-31", "0202-05-01", "2101-01-01", "9999-12-31"]) {
    assert.ok(validarTransaccion({ ...base, fecha }).errores.fecha, fecha);
  }
});

test("aFilaTransaccion no arrastra campos extra que mande el cliente", () => {
  const r = validarTransaccion({ ...base, permitirMontoNegativo: true, x: 1 });
  const fila = aFilaTransaccion(r.valor, "u1", "pdf");
  assert.deepEqual(Object.keys(fila).sort(), [
    "categoria", "cuenta", "descripcion", "fecha", "monto", "origen", "tipo", "usuario_id",
  ]);
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

test("el monto precargado al editar se vuelve a leer igual", async () => {
  const { parsearMonto } = await import("../src/lib/formato.ts");
  // Mismo formato que `valoresDe` en formulario-transaccion.tsx.
  for (const monto of [1234.5, 12500, 0.01, -3210.99, 1234567.89]) {
    const texto = monto.toFixed(2).replace(".", ",");
    assert.equal(parsearMonto(texto), monto, texto);
  }
});

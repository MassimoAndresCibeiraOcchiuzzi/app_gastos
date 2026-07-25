import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escaparCelda,
  filasACSV,
  transaccionesACSV,
  nombreArchivoExport,
  COLUMNAS,
} from "../src/lib/csv.ts";

let id = 0;
const t = (campos) => ({
  id: String(++id),
  fecha: "2026-07-23",
  descripcion: "Verdulería",
  monto: 1234.5,
  tipo: "egreso",
  categoria: "Comida",
  cuenta: "Efectivo",
  origen: "manual",
  usuario_id: "u",
  created_at: "",
  ...campos,
});

test("escaparCelda deja el texto simple como está", () => {
  assert.equal(escaparCelda("Verdulería"), "Verdulería");
  assert.equal(escaparCelda(""), "");
});

test("escaparCelda entrecomilla lo que rompería el CSV", () => {
  assert.equal(escaparCelda("Pan, queso"), '"Pan, queso"');
  assert.equal(escaparCelda('Cine "Gaumont"'), '"Cine ""Gaumont"""');
  assert.equal(escaparCelda("dos\nlíneas"), '"dos\nlíneas"');
});

test("escaparCelda neutraliza fórmulas de Excel", () => {
  assert.equal(escaparCelda("=1+1"), "'=1+1");
  assert.equal(escaparCelda("+HYPERLINK(1)"), "'+HYPERLINK(1)");
  assert.equal(escaparCelda("@SUM(A1)"), "'@SUM(A1)");
  // Un guión al principio es texto normal, no lo tocamos.
  assert.equal(escaparCelda("-Uber"), "-Uber");
});

test("filasACSV separa con CRLF", () => {
  assert.equal(filasACSV([["a", "b"], ["c", "d"]]), "a,b\r\nc,d");
});

test("transaccionesACSV arranca con el encabezado pedido", () => {
  const csv = transaccionesACSV([]);
  assert.equal(csv, COLUMNAS.join(","));
  assert.equal(
    csv,
    "fecha,descripcion,monto,tipo,categoria,cuenta,origen",
  );
});

test("transaccionesACSV escribe una fila por transacción", () => {
  const csv = transaccionesACSV([t()]);
  const [encabezado, fila] = csv.split("\r\n");

  assert.equal(encabezado, "fecha,descripcion,monto,tipo,categoria,cuenta,origen");
  assert.equal(fila, "2026-07-23,Verdulería,1234.50,egreso,Comida,Efectivo,manual");
});

test("transaccionesACSV usa punto decimal y siempre 2 decimales", () => {
  const csv = transaccionesACSV([t({ monto: 1000 }), t({ monto: 0.5 })]);
  const filas = csv.split("\r\n").slice(1);
  assert.ok(filas[0].includes(",1000.00,"));
  assert.ok(filas[1].includes(",0.50,"));
});

test("transaccionesACSV exporta un egreso negativo sin romperse", () => {
  // El ajuste de impuestos con neto a favor. El "-" al principio NO es fórmula,
  // así que la celda no se toca y el número queda legible en cualquier lector.
  const csv = transaccionesACSV([
    t({
      descripcion: "Ajustes impuestos y percepciones tarjeta",
      monto: -17197.39,
      categoria: "Ajustes tarjeta",
      cuenta: null,
    }),
  ]);
  const fila = csv.split("\r\n")[1];
  assert.equal(
    fila,
    "2026-07-23,Ajustes impuestos y percepciones tarjeta,-17197.39,egreso,Ajustes tarjeta,,manual",
  );
});

test("transaccionesACSV deja vacías las columnas nulas", () => {
  const csv = transaccionesACSV([t({ categoria: null, cuenta: null })]);
  const fila = csv.split("\r\n")[1];
  assert.equal(fila, "2026-07-23,Verdulería,1234.50,egreso,,,manual");
});

test("transaccionesACSV no se rompe con comas en la descripción", () => {
  const csv = transaccionesACSV([t({ descripcion: "Pan, queso y vino" })]);
  const fila = csv.split("\r\n")[1];
  assert.equal(
    fila,
    '2026-07-23,"Pan, queso y vino",1234.50,egreso,Comida,Efectivo,manual',
  );
});

test("nombreArchivoExport incluye la fecha", () => {
  assert.equal(nombreArchivoExport("2026-07-23"), "gastos_2026-07-23.csv");
});

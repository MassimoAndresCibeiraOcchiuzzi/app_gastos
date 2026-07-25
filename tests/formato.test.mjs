import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsearMonto,
  formatearARS,
  formatearARSConSigno,
  formatearFechaCorta,
  sumarMeses,
  nombreMes,
  rangoMes,
  esMesValido,
  esFechaISO,
  etiquetaMesCorta,
  formatearCompacto,
  ultimosMeses,
  primerDia,
  formatearFechaNumerica,
  redondearCentavos,
  formatearUSD,
} from "../src/lib/formato.ts";

// Espacio angosto que usa Intl entre el símbolo y el número.
const normalizar = (s) => s.replace(/ | /g, " ");

test("redondearCentavos corta los errores de punto flotante", () => {
  assert.equal(redondearCentavos(0.1 + 0.2), 0.3);
  assert.equal(redondearCentavos(1234.5678), 1234.57);
  assert.equal(redondearCentavos(-17197.394), -17197.39);
});

test("formatearUSD antepone U$S y usa formato es-AR", () => {
  assert.equal(normalizar(formatearUSD(1234.5)), "U$S 1.234,50");
  assert.equal(normalizar(formatearUSD(1000)), "U$S 1.000,00");
});

test("parsearMonto acepta notación simple", () => {
  assert.equal(parsearMonto("1234"), 1234);
  assert.equal(parsearMonto("1234.56"), 1234.56);
  assert.equal(parsearMonto("1234,5"), 1234.5);
});

test("parsearMonto entiende el formato es-AR", () => {
  assert.equal(parsearMonto("1.234,56"), 1234.56);
  assert.equal(parsearMonto("$ 12.500"), 12500);
  assert.equal(parsearMonto("1.250.000"), 1250000);
  // Formato en-US: el último separador manda como decimal.
  assert.equal(parsearMonto("1,234.56"), 1234.56);
});

test("parsearMonto redondea a 2 decimales", () => {
  assert.equal(parsearMonto("10,999"), 11);
  assert.equal(parsearMonto("0,015"), 0.02);
});

test("parsearMonto rechaza lo que no es número", () => {
  for (const basura of ["", "  ", "abc", "12a", "1.2.3,4,5"]) {
    assert.equal(parsearMonto(basura), null, `debería rechazar "${basura}"`);
  }
});

test("formatearARS usa pesos con separador de miles", () => {
  assert.equal(normalizar(formatearARS(1234.5)), "$ 1.234,50");
  assert.equal(normalizar(formatearARS(0)), "$ 0,00");
  assert.equal(normalizar(formatearARS(-9876543.21)), "-$ 9.876.543,21");
});

test("formatearARSConSigno marca ingresos y egresos", () => {
  assert.ok(formatearARSConSigno(100).startsWith("+"));
  assert.ok(formatearARSConSigno(-100).startsWith("−"));
  assert.ok(!/[+−]/.test(formatearARSConSigno(0)));
});

test("formatearFechaCorta no corre el día por zona horaria", () => {
  assert.equal(formatearFechaCorta("2026-07-23"), "23 jul");
  assert.equal(formatearFechaCorta("2026-01-01"), "01 ene");
  assert.equal(formatearFechaCorta("2026-12-31"), "31 dic");
});

test("sumarMeses cruza el año", () => {
  assert.equal(sumarMeses("2026-01", -1), "2025-12");
  assert.equal(sumarMeses("2026-12", 1), "2027-01");
  assert.equal(sumarMeses("2026-07", 0), "2026-07");
  assert.equal(sumarMeses("2026-03", -14), "2025-01");
});

test("rangoMes cubre el mes completo", () => {
  assert.deepEqual(rangoMes("2026-07"), {
    desde: "2026-07-01",
    hasta: "2026-08-01",
  });
  assert.deepEqual(rangoMes("2026-12"), {
    desde: "2026-12-01",
    hasta: "2027-01-01",
  });
  // Febrero bisiesto: el rango es semiabierto, así que el 29 entra igual.
  assert.deepEqual(rangoMes("2024-02"), {
    desde: "2024-02-01",
    hasta: "2024-03-01",
  });
});

test("nombreMes", () => {
  assert.equal(nombreMes("2026-07"), "julio de 2026");
});

test("etiquetaMesCorta aclara el año sólo en enero", () => {
  assert.equal(etiquetaMesCorta("2026-07"), "jul");
  assert.equal(etiquetaMesCorta("2026-01"), "ene 26");
  assert.equal(etiquetaMesCorta("2025-12"), "dic");
});

test("formatearCompacto abrevia para el eje", () => {
  assert.equal(normalizar(formatearCompacto(900)), "$ 900");
  assert.equal(normalizar(formatearCompacto(1500)), "$ 1,5 k");
  assert.equal(normalizar(formatearCompacto(350000)), "$ 350 k");
  assert.equal(normalizar(formatearCompacto(1250000)), "$ 1,3 M");
  assert.equal(normalizar(formatearCompacto(0)), "$ 0");
  assert.equal(normalizar(formatearCompacto(-2000)), "-$ 2 k");
});

test("ultimosMeses termina en el mes pedido y cruza el año", () => {
  assert.deepEqual(ultimosMeses("2026-07", 6), [
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
  ]);
  assert.deepEqual(ultimosMeses("2026-01", 3), ["2025-11", "2025-12", "2026-01"]);
  assert.deepEqual(ultimosMeses("2026-07", 1), ["2026-07"]);
});

test("primerDia arma la fecha de imputación del resumen", () => {
  assert.equal(primerDia("2026-07"), "2026-07-01");
  assert.equal(primerDia("2025-12"), "2025-12-01");
  assert.equal(esFechaISO(primerDia("2026-02")), true);
});

test("formatearFechaNumerica muestra el año", () => {
  assert.equal(formatearFechaNumerica("2026-06-03"), "03/06/2026");
  assert.equal(formatearFechaNumerica("2025-11-30"), "30/11/2025");
});

test("formatearFechaNumerica devuelve tal cual lo que no es una fecha", () => {
  // Es dato de referencia que viene del PDF: no vale romper la pantalla.
  assert.equal(formatearFechaNumerica("s/f"), "s/f");
  assert.equal(formatearFechaNumerica("2026-02-30"), "2026-02-30");
  assert.equal(formatearFechaNumerica(""), "");
});

test("validación de mes y fecha", () => {
  assert.equal(esMesValido("2026-07"), true);
  assert.equal(esMesValido("2026-13"), false);
  assert.equal(esMesValido("2026-7"), false);
  assert.equal(esFechaISO("2026-02-30"), false);
  assert.equal(esFechaISO("2024-02-29"), true);
  assert.equal(esFechaISO("hoy"), false);
});

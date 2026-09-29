import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comprasEnCuotas,
  detectarCuota,
  proyectarCuotas,
} from "../src/lib/cuotas.ts";

test("detectarCuota: variantes reconocidas", () => {
  const casos = [
    ["SMARTPHONE XYZ - Cuota 03/06", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ Cuota 3/6", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ CUOTA 03 / 06", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ cuota 03-06", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ Cuota 3 de 6", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ CUOTA 03 DE 12", 3, 12, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ Cuotas 03/06", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ CUOTA: 03/06", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ Cuota N° 3/6", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ Cuota Nro. 3/6", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ C.03/06", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ C 03/06", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ C03/06", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ CTA 03/06", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ Cta. 03/06", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ CUOT 03/06", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ (Cuota 03/06)", 3, 6, "SMARTPHONE XYZ"],
    ["Cuota 03/06 SMARTPHONE XYZ", 3, 6, "SMARTPHONE XYZ"],
    ["SMARTPHONE XYZ - Cuota 06/06", 6, 6, "SMARTPHONE XYZ"],
  ];
  for (const [desc, actual, total, base] of casos) {
    assert.deepEqual(detectarCuota(desc), { actual, total, base }, desc);
  }
});

test("detectarCuota: lo que no es cuota no matchea (y no rompe)", () => {
  for (const desc of [
    "COTO SUC 45",
    "PAGO 03/06", // fecha, sin palabra de cuota
    "SMARTPHONE 03/06", // un "03/06" suelto es indistinguible de una fecha
    "ETC 3/6", // la C de ETC no es "C 3/6"
    "MC 03/06",
    "Cuota 07/06", // la cuota no puede pasar del total
    "Cuota 0/6",
    "Cuota 1/1", // una cuota sola no es una compra en cuotas
    "Cuota 3/123", // tres dígitos: no
    "CUOTA SOCIAL CLUB", // la palabra sin números
    "",
  ]) {
    assert.equal(detectarCuota(desc), null, desc);
  }
  assert.equal(detectarCuota(undefined), null);
});

test("detectarCuota: si hay dos patrones, toma el último; sin nombre, uno genérico", () => {
  assert.deepEqual(detectarCuota("PLAN C 2/3 - Cuota 05/12"), {
    actual: 5, total: 12, base: "PLAN C 2/3",
  });
  assert.equal(detectarCuota("Cuota 02/03").base, "Compra en cuotas");
});

let n = 0;
const t = (fecha, descripcion, monto, extra = {}) => ({
  id: `t${++n}`, fecha, descripcion, monto, tipo: "egreso", categoria: "Otros",
  cuenta: "Tarjeta", origen: "pdf", usuario_id: "u", created_at: "2026-01-01T00:00:00Z",
  ...extra,
});

test("comprasEnCuotas: agrupa las cuotas de la misma compra aunque cambie la escritura", () => {
  const compras = comprasEnCuotas([
    t("2026-07-01", "SMARTPHONE XYZ - Cuota 01/06", 50000),
    t("2026-08-01", "Smartphone Xyz C.02/06", 50000),
    t("2026-09-01", "SMARTPHONE XYZ CUOTA 3 DE 6", 50000),
  ]);
  assert.equal(compras.length, 1);
  const [c] = compras;
  assert.equal(c.mesPrimera, "2026-07");
  assert.equal(c.mesUltima, "2026-12");
  assert.equal(c.ultimaCargada, 3);
  assert.equal(c.copias, 1);
  assert.equal(c.nombre, "SMARTPHONE XYZ CUOTA 3 DE 6".replace(/ CUOTA.*/, ""));
});

test("comprasEnCuotas: la misma compra hecha en meses distintos son dos compras", () => {
  const compras = comprasEnCuotas([
    t("2026-09-01", "ZAPATILLAS - Cuota 02/03", 20000), // compra de agosto
    t("2026-09-01", "ZAPATILLAS - Cuota 01/03", 20000), // compra de septiembre
  ]);
  assert.deepEqual(compras.map((c) => c.mesPrimera).sort(), ["2026-08", "2026-09"]);
});

test("comprasEnCuotas: distinto monto o distinta cantidad de cuotas, distinta compra", () => {
  const compras = comprasEnCuotas([
    t("2026-09-01", "TIENDA - Cuota 01/03", 20000),
    t("2026-09-01", "TIENDA - Cuota 01/03", 35000),
    t("2026-09-01", "TIENDA - Cuota 01/06", 20000),
  ]);
  assert.equal(compras.length, 3);
});

test("comprasEnCuotas: dos cuotas iguales el mismo mes son dos compras (copias)", () => {
  const [c] = comprasEnCuotas([
    t("2026-08-01", "AURICULARES - Cuota 01/03", 10000),
    t("2026-08-01", "AURICULARES - Cuota 01/03", 10000),
    t("2026-09-01", "AURICULARES - Cuota 02/03", 10000),
    t("2026-09-01", "AURICULARES - Cuota 02/03", 10000),
  ]);
  assert.equal(c.copias, 2);
});

test("comprasEnCuotas: ignora ingresos, montos no positivos y lo que no es cuota", () => {
  const compras = comprasEnCuotas([
    t("2026-09-01", "DEVOLUCION TIENDA - Cuota 01/03", 1000, { tipo: "ingreso" }),
    t("2026-09-01", "AJUSTE - Cuota 01/03", -1000),
    t("2026-09-01", "COTO SUC 45", 1000),
  ]);
  assert.deepEqual(compras, []);
});

test("proyectarCuotas: suma lo comprometido mes a mes hasta la última cuota", () => {
  const compras = comprasEnCuotas([
    t("2026-09-01", "SMARTPHONE - Cuota 03/06", 50000), // oct 4, nov 5, dic 6
    t("2026-09-01", "HELADERA - Cuota 01/03", 100000), // oct 2, nov 3
    t("2026-09-01", "LIBRO - Cuota 02/02", 5000), // termina este mes
  ]);
  const p = proyectarCuotas(compras, "2026-09");
  assert.deepEqual(
    p.meses.map((m) => [m.mes, m.total]),
    [["2026-10", 150000], ["2026-11", 150000], ["2026-12", 50000]],
  );
  assert.deepEqual(
    p.meses[0].cuotas.map((c) => [c.nombre, c.numero, c.total]),
    [["HELADERA", 2, 3], ["SMARTPHONE", 4, 6]],
  );
  assert.equal(p.totalPendiente, 350000);
  assert.deepEqual(
    p.compras.map((c) => [c.nombre, c.proxima, c.restantes, c.pendiente, c.mesUltima]),
    [
      ["HELADERA", 2, 2, 200000, "2026-11"],
      ["SMARTPHONE", 4, 3, 150000, "2026-12"],
    ],
  );
});

test("proyectarCuotas: sigue el calendario aunque falte importar un mes", () => {
  // Última cuota cargada en julio (2/6); estamos en septiembre.
  const compras = comprasEnCuotas([t("2026-07-01", "TV - Cuota 02/06", 30000)]);
  const p = proyectarCuotas(compras, "2026-09");
  assert.equal(p.meses[0].cuotas[0].numero, 5); // octubre = cuota 5
  assert.equal(p.compras[0].restantes, 2); // oct y nov
});

test("proyectarCuotas: las copias multiplican", () => {
  const compras = comprasEnCuotas([
    t("2026-09-01", "AURICULARES - Cuota 01/03", 10000),
    t("2026-09-01", "AURICULARES - Cuota 01/03", 10000),
  ]);
  const p = proyectarCuotas(compras, "2026-09");
  assert.equal(p.meses[0].total, 20000);
  assert.equal(p.totalPendiente, 40000);
});

test("proyectarCuotas: sin compras activas, todo vacío", () => {
  const p = proyectarCuotas(comprasEnCuotas([t("2026-09-01", "X - Cuota 03/03", 1)]), "2026-09");
  assert.deepEqual(p, { meses: [], compras: [], totalPendiente: 0 });
});

test("proyectarCuotas: el horizonte limita el gráfico, no el total", () => {
  const compras = comprasEnCuotas([t("2026-09-01", "AUTO - Cuota 01/24", 1000)]);
  const p = proyectarCuotas(compras, "2026-09", 6);
  assert.equal(p.meses.length, 6);
  assert.equal(p.totalPendiente, 23000);
});

test("proyectarCuotas: sin horizonte, llega hasta la última cuota aunque pase de 12 meses", () => {
  const compras = comprasEnCuotas([
    t("2026-09-01", "AUTO - Cuota 01/24", 1000),
    t("2026-09-01", "TV - Cuota 01/03", 500),
  ]);
  const p = proyectarCuotas(compras, "2026-09");
  assert.equal(p.meses.length, 23); // oct 2026 … ago 2028
  assert.equal(p.meses.at(-1).mes, "2028-08");
  assert.equal(p.meses.at(-1).cuotas[0].numero, 24);
  assert.equal(p.meses[2].total, 1000); // diciembre: la TV ya terminó en noviembre
});

test("proyectarCuotas: un mes del medio sin cuotas queda en 0, sin cortar la serie", () => {
  // Una compra que termina en octubre y otra cuya primera cuota es en diciembre.
  const compras = comprasEnCuotas([
    t("2026-09-01", "A - Cuota 02/03", 100),
    t("2026-12-01", "B - Cuota 01/02", 200),
  ]);
  const p = proyectarCuotas(compras, "2026-09");
  assert.deepEqual(
    p.meses.map((m) => [m.mes, m.total]),
    [["2026-10", 100], ["2026-11", 0], ["2026-12", 200], ["2027-01", 200]],
  );
});

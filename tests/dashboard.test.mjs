import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAVE_OTRAS,
  compararConHistoria,
  detalleCategoria,
  esDevolucionDeCategoria,
  filasCategoriasMes,
  resumenMes,
} from "../src/lib/dashboard.ts";
import { ultimosMeses } from "../src/lib/formato.ts";

let n = 0;
/** Transacción de prueba: egreso manual salvo que se diga otra cosa. */
const t = (fecha, categoria, monto, extra = {}) => ({
  id: `t${++n}`,
  fecha,
  descripcion: extra.descripcion ?? `${categoria ?? "sin"} ${n}`,
  monto,
  tipo: "egreso",
  categoria,
  cuenta: null,
  origen: "manual",
  usuario_id: "u",
  created_at: "2026-01-01T00:00:00Z",
  ...extra,
});

const MES = "2026-07";
const MESES = ultimosMeses(MES, 6); // feb..jul

// --- compararConHistoria ---------------------------------------------------

test("con 3 meses de historia compara contra su promedio", () => {
  const datos = [
    t("2026-04-10", "Comida", 100),
    t("2026-05-10", "Comida", 200),
    t("2026-06-10", "Comida", 300), // promedio 200
    t("2026-07-10", "Comida", 270),
  ];
  assert.deepEqual(compararConHistoria(datos, "Comida", MES), {
    tipo: "promedio",
    porcentaje: 35,
  });
});

test("un mes con historia pero sin la categoría cuenta como $0 en el promedio", () => {
  const datos = [
    t("2026-04-10", "Comida", 300),
    t("2026-05-10", "Salud", 50), // mayo existe, sin Comida
    t("2026-06-10", "Comida", 300), // promedio (300+0+300)/3 = 200
    t("2026-07-10", "Comida", 100),
  ];
  assert.deepEqual(compararConHistoria(datos, "Comida", MES), {
    tipo: "promedio",
    porcentaje: -50,
  });
});

test("con menos de 3 meses de historia compara contra el mes anterior con gasto", () => {
  const datos = [
    t("2026-05-10", "Comida", 400), // abril no tiene historia
    t("2026-06-10", "Salud", 10), // junio sí, pero sin Comida
    t("2026-07-10", "Comida", 500),
  ];
  assert.deepEqual(compararConHistoria(datos, "Comida", MES), {
    tipo: "mes",
    porcentaje: 25,
    mes: "2026-05",
  });
});

test("sin ningún mes previo con la categoría, es nueva", () => {
  const soloEsteMes = [t("2026-07-10", "Viajes", 900)];
  assert.deepEqual(compararConHistoria(soloEsteMes, "Viajes", MES), { tipo: "nuevo" });

  // Con 3 meses de historia pero sin nunca esa categoría: también nueva
  // (promedio 0, no hay porcentaje que calcular).
  const conHistoria = [
    t("2026-04-10", "Comida", 1),
    t("2026-05-10", "Comida", 1),
    t("2026-06-10", "Comida", 1),
    t("2026-07-10", "Viajes", 900),
  ];
  assert.deepEqual(compararConHistoria(conHistoria, "Viajes", MES), { tipo: "nuevo" });
});

test("la comparación sólo mira egresos: una devolución no cambia el promedio", () => {
  const datos = [
    t("2026-04-10", "Comida", 100),
    t("2026-05-10", "Comida", 100),
    t("2026-06-10", "Comida", 100),
    t("2026-06-11", "Comida", 90, { tipo: "ingreso", origen: "pdf" }),
    t("2026-07-10", "Comida", 100),
  ];
  assert.deepEqual(compararConHistoria(datos, "Comida", MES), {
    tipo: "promedio",
    porcentaje: 0,
  });
});

// --- detalle ----------------------------------------------------------------

test("detalle: movimientos del mes de mayor a menor, con total, cantidad y %", () => {
  const datos = [
    t("2026-07-02", "Comida", 1000, { descripcion: "Chico", cuenta: "Efectivo" }),
    t("2026-07-20", "Comida", 5000, { descripcion: "Grande", cuenta: "Tarjeta" }),
    t("2026-07-05", "Comida", 3000, { descripcion: "Mediano" }),
    t("2026-06-05", "Comida", 9999), // otro mes: no entra
    t("2026-07-05", "Salud", 999), // otra categoría: no entra
  ];
  const d = detalleCategoria(datos, "Comida", MES, MESES, 18000);
  assert.deepEqual(
    d.movimientos.map((m) => [m.descripcion, m.monto, m.cuenta]),
    [
      ["Grande", 5000, "Tarjeta"],
      ["Mediano", 3000, null],
      ["Chico", 1000, "Efectivo"],
    ],
  );
  assert.equal(d.monto, 9000);
  assert.equal(d.porcentaje, 50);
});

test("detalle: las devoluciones van aparte y no restan del total", () => {
  const datos = [
    t("2026-07-02", "Otros", 8000, { descripcion: "ZARA" }),
    t("2026-07-09", "Otros", 3000, {
      tipo: "ingreso",
      origen: "pdf",
      descripcion: "DEVOLUCION COMPRA ZARA",
    }),
    // El sueldo cargado a mano en "Otros" NO es una devolución.
    t("2026-07-01", "Otros", 900000, { tipo: "ingreso", descripcion: "Sueldo" }),
    // Una devolución cargada a mano sí, por la descripción.
    t("2026-07-15", "Otros", 500, { tipo: "ingreso", descripcion: "Reintegro promo" }),
  ];
  const d = detalleCategoria(datos, "Otros", MES, MESES, 8000);
  assert.equal(d.monto, 8000);
  assert.deepEqual(d.devoluciones, { cantidad: 2, total: 3500 });
  assert.deepEqual(d.movimientos.map((m) => m.descripcion), ["ZARA"]);
});

test("esDevolucionDeCategoria distingue devoluciones de otros ingresos", () => {
  assert.equal(esDevolucionDeCategoria(t("2026-07-01", "Comida", 1, { tipo: "ingreso", origen: "pdf" })), true);
  assert.equal(esDevolucionDeCategoria(t("2026-07-01", "Otros", 1, { tipo: "ingreso" })), false);
  assert.equal(esDevolucionDeCategoria(t("2026-07-01", "Otros", 1, { tipo: "ingreso", descripcion: "Devolución" })), true);
  assert.equal(esDevolucionDeCategoria(t("2026-07-01", "Comida", 1, { origen: "pdf" })), false); // egreso
});

test("detalle: serie de 6 meses con el mes actual marcado y ceros explícitos", () => {
  const datos = [t("2026-03-10", "Salud", 200), t("2026-07-10", "Salud", 500)];
  const d = detalleCategoria(datos, "Salud", MES, MESES, 500);
  assert.deepEqual(
    d.serie.map((p) => [p.mes, p.monto, p.actual]),
    [
      ["2026-02", 0, false],
      ["2026-03", 200, false],
      ["2026-04", 0, false],
      ["2026-05", 0, false],
      ["2026-06", 0, false],
      ["2026-07", 500, true],
    ],
  );
  assert.equal(d.serie[0].etiqueta, "feb");
});

test("detalle: sin total no inventa un porcentaje", () => {
  assert.equal(detalleCategoria([], "Comida", MES, MESES, 0).porcentaje, null);
});

// --- filas del mes (lista + torta) ---------------------------------------------

test("filas: mismo orden que la torta y el Ajustes tarjeta afuera", () => {
  const datos = [
    t("2026-07-01", "Salud", 100),
    t("2026-07-01", "Comida", 300),
    t("2026-07-01", "Ajustes tarjeta", -500),
    t("2026-07-01", null, 50),
  ];
  const { filas, total } = filasCategoriasMes(datos, MES, MESES, 6);
  assert.deepEqual(filas.map((f) => [f.categoria, f.monto]), [
    ["Comida", 300],
    ["Salud", 100],
    ["Sin categoría", 50],
  ]);
  assert.equal(total, 450);
  // "Sin categoría" junta las transacciones con categoria null.
  assert.equal(filas[2].movimientos.length, 1);
});

test("filas: con más categorías que porciones, 'Otras (N)' contiene las de la cola", () => {
  const categorias = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const datos = categorias.map((c, i) => t("2026-07-01", c, 800 - i * 100));
  const { filas } = filasCategoriasMes(datos, MES, MESES, 6);

  assert.deepEqual(filas.map((f) => f.categoria), ["A", "B", "C", "D", "E", "Otras (3)"]);
  const otras = filas[5];
  assert.equal(otras.tipo, "otras");
  assert.equal(otras.clave, CLAVE_OTRAS);
  assert.equal(otras.monto, 300 + 200 + 100);
  // Adentro: las categorías, cada una con su propio detalle.
  assert.deepEqual(otras.agrupadas.map((c) => [c.categoria, c.monto]), [
    ["F", 300],
    ["G", 200],
    ["H", 100],
  ]);
  assert.equal(otras.agrupadas[0].movimientos.length, 1);
});

test("filas: los porcentajes de las filas suman 100", () => {
  const datos = [
    t("2026-07-01", "Comida", 1),
    t("2026-07-01", "Salud", 1),
    t("2026-07-01", "Transporte", 2),
  ];
  const { filas } = filasCategoriasMes(datos, MES, MESES, 6);
  assert.deepEqual(filas.map((f) => f.porcentaje), [50, 25, 25]);
});

test("filas: un mes sin egresos no tiene filas", () => {
  const { filas, total } = filasCategoriasMes(
    [t("2026-07-01", "Otros", 100, { tipo: "ingreso" })],
    MES,
    MESES,
    6,
  );
  assert.deepEqual(filas, []);
  assert.equal(total, 0);
});

test("filas: el total suma sólo lo que va a la torta (sin el ajuste)", () => {
  const datos = [
    t("2026-07-03", "Comida", 45230),
    t("2026-07-04", "Entretenimiento", 8400),
    t("2026-07-30", "Ajustes tarjeta", -17197.39),
  ];
  assert.equal(filasCategoriasMes(datos, MES, MESES, 6).total, 53630);
});

// --- número principal del mes -------------------------------------------------

test("resumenMes: egresos, ingresos y balance como en Movimientos", () => {
  const datos = [
    t("2026-07-02", "Comida", 300000),
    t("2026-07-03", "Transporte", 100000),
    t("2026-07-01", "Otros", 900000, { tipo: "ingreso", descripcion: "Sueldo" }),
    t("2026-06-10", "Comida", 999), // otro mes
  ];
  const r = resumenMes(datos, MES, false);
  assert.equal(r.egresos, 400000);
  assert.equal(r.ingresos, 900000);
  assert.equal(r.balance, 500000);
  assert.equal(r.ajuste, 0);
});

test("resumenMes: el ajuste de impuestos entra en egresos y se informa aparte", () => {
  const datos = [
    t("2026-07-02", "Comida", 100000),
    t("2026-07-30", "Ajustes tarjeta", -17197.39),
  ];
  const r = resumenMes(datos, MES, false);
  assert.equal(r.egresos, 82802.61); // igual que "Egresos" en Movimientos
  assert.equal(r.ajuste, -17197.39);
});

test("resumenMes: con 3 meses de historia compara contra su promedio", () => {
  const datos = [
    t("2026-04-10", "Comida", 100000),
    t("2026-05-10", "Salud", 200000),
    t("2026-06-10", "Transporte", 300000), // promedio 200.000
    t("2026-07-10", "Comida", 150000),
  ];
  assert.deepEqual(resumenMes(datos, MES, false).comparacion, {
    tipo: "promedio",
    porcentaje: -25,
  });
});

test("resumenMes: con menos historia compara contra el mes anterior con egresos", () => {
  const datos = [
    t("2026-05-10", "Comida", 200000), // abril sin historia
    t("2026-06-01", "Otros", 50000, { tipo: "ingreso" }), // junio sólo ingresos
    t("2026-07-10", "Comida", 300000),
  ];
  assert.deepEqual(resumenMes(datos, MES, false).comparacion, {
    tipo: "mes",
    porcentaje: 50,
    mes: "2026-05",
  });
});

test("resumenMes: sin ningún mes anterior con egresos, no hay comparación", () => {
  assert.equal(resumenMes([t("2026-07-10", "Comida", 1)], MES, false).comparacion, null);
});

test("resumenMes: en el mes en curso nunca hay comparación", () => {
  const datos = [
    t("2026-04-10", "Comida", 100000),
    t("2026-05-10", "Comida", 100000),
    t("2026-06-10", "Comida", 100000),
    t("2026-07-10", "Comida", 20000),
  ];
  assert.equal(resumenMes(datos, MES, true).comparacion, null);
  // El mismo mes, ya cerrado, sí la tendría.
  assert.equal(resumenMes(datos, MES, false).comparacion.tipo, "promedio");
});

test("resumenMes: un mes sin egresos no se compara (sería ▼100%)", () => {
  const datos = [
    t("2026-04-10", "Comida", 1),
    t("2026-05-10", "Comida", 1),
    t("2026-06-10", "Comida", 1),
  ];
  const r = resumenMes(datos, MES, false);
  assert.equal(r.egresos, 0);
  assert.equal(r.comparacion, null);
});

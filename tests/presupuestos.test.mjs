import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avanceDelMes,
  progresoPresupuestos,
  validarPresupuestos,
  MARGEN_RITMO,
} from "../src/lib/presupuestos.ts";
import { diasDelMes } from "../src/lib/formato.ts";
import { CATEGORIAS_CONSUMO } from "../src/lib/categorias.ts";

let n = 0;
const t = (fecha, categoria, monto, tipo = "egreso", extra = {}) => ({
  id: `t${++n}`,
  fecha,
  descripcion: "x",
  monto,
  tipo,
  categoria,
  cuenta: null,
  origen: "manual",
  usuario_id: "u",
  created_at: "2026-01-01T00:00:00Z",
  ...extra,
});

test("diasDelMes, con bisiestos", () => {
  assert.equal(diasDelMes("2026-01"), 31);
  assert.equal(diasDelMes("2026-04"), 30);
  assert.equal(diasDelMes("2026-02"), 28);
  assert.equal(diasDelMes("2028-02"), 29);
  assert.equal(diasDelMes("2026-12"), 31);
});

test("avanceDelMes: el día de hoy cuenta como transcurrido", () => {
  assert.equal(avanceDelMes("2026-09", "2026-09-12"), 40); // 12/30
  assert.equal(avanceDelMes("2026-09", "2026-09-01"), 3);
  assert.equal(avanceDelMes("2026-09", "2026-09-30"), 100);
  assert.equal(avanceDelMes("2026-02", "2026-02-14"), 50);
});

test("avanceDelMes: mes cerrado 100, mes futuro 0 (también cruzando el año)", () => {
  assert.equal(avanceDelMes("2026-08", "2026-09-12"), 100);
  assert.equal(avanceDelMes("2025-12", "2026-01-03"), 100);
  assert.equal(avanceDelMes("2026-10", "2026-09-12"), 0);
});

const transacciones = [
  t("2026-09-02", "Comida", 50000),
  t("2026-09-10", "Comida", 18000),
  t("2026-09-05", "Transporte", 10000),
  t("2026-08-20", "Comida", 999999), // otro mes: no cuenta
  t("2026-09-06", "Comida", 5000, "ingreso", { origen: "pdf" }), // devolución: no resta
  t("2026-09-07", "Salud", 130000),
];

test("progresoPresupuestos: gastado, porcentaje y restante", () => {
  const filas = progresoPresupuestos(
    transacciones,
    "2026-09",
    [{ categoria: "Comida", monto_mensual: 100000 }],
    40,
  );
  assert.equal(filas.length, 1);
  const [f] = filas;
  assert.equal(f.gastado, 68000);
  assert.equal(f.porcentaje, 68);
  assert.equal(f.restante, 32000);
  assert.equal(f.estado, "adelantado"); // 68% gastado con 40% del mes
  assert.match(f.color, /^var\(--viz-/);
});

test("progresoPresupuestos: el margen evita avisar por poco", () => {
  const p = [{ categoria: "Transporte", monto_mensual: 20000 }]; // 50% gastado
  const enElBorde = progresoPresupuestos(transacciones, "2026-09", p, 50 - MARGEN_RITMO);
  assert.equal(enElBorde[0].estado, "en-ritmo"); // 50 no supera 40 + 10
  const pasado = progresoPresupuestos(transacciones, "2026-09", p, 39);
  assert.equal(pasado[0].estado, "adelantado"); // 50 > 39 + 10
});

test("progresoPresupuestos: excedido gana, también con el mes cerrado", () => {
  const p = [{ categoria: "Salud", monto_mensual: 100000 }];
  const [f] = progresoPresupuestos(transacciones, "2026-09", p, 100);
  assert.equal(f.estado, "excedido");
  assert.equal(f.porcentaje, 130);
  assert.equal(f.restante, -30000);
});

test("progresoPresupuestos: mes cerrado o futuro nunca está 'adelantado'", () => {
  const p = [{ categoria: "Comida", monto_mensual: 100000 }]; // 68%
  assert.equal(progresoPresupuestos(transacciones, "2026-09", p, 100)[0].estado, "en-ritmo");
  assert.equal(progresoPresupuestos(transacciones, "2026-09", p, 0)[0].estado, "en-ritmo");
});

test("progresoPresupuestos: una categoría sin gasto aparece en 0%", () => {
  const [f] = progresoPresupuestos(
    transacciones,
    "2026-09",
    [{ categoria: "Alquiler", monto_mensual: 300000 }],
    40,
  );
  assert.equal(f.gastado, 0);
  assert.equal(f.porcentaje, 0);
  assert.equal(f.estado, "en-ritmo");
});

test("progresoPresupuestos: sólo las categorías con presupuesto, de más a menos gastado", () => {
  const filas = progresoPresupuestos(
    transacciones,
    "2026-09",
    [
      { categoria: "Transporte", monto_mensual: 20000 }, // 50%
      { categoria: "Salud", monto_mensual: 100000 }, // 130%
      { categoria: "Comida", monto_mensual: 100000 }, // 68%
    ],
    40,
  );
  assert.deepEqual(
    filas.map((f) => f.categoria),
    ["Salud", "Comida", "Transporte"],
  );
});

test("validarPresupuestos: guarda los que tienen monto y borra los vacíos", () => {
  const r = validarPresupuestos(
    [
      { categoria: "Comida", monto: "150.000" },
      { categoria: "Transporte", monto: "  " },
      { categoria: "Salud", monto: "1234,5" },
    ],
    CATEGORIAS_CONSUMO,
  );
  assert.ok(r.ok);
  assert.deepEqual(r.guardar, [
    { categoria: "Comida", monto_mensual: 150000 },
    { categoria: "Salud", monto_mensual: 1234.5 },
  ]);
  assert.deepEqual(r.borrar, ["Transporte"]);
});

test("validarPresupuestos: errores por categoría, y no guarda nada", () => {
  const r = validarPresupuestos(
    [
      { categoria: "Comida", monto: "abc" },
      { categoria: "Salud", monto: "0" },
      { categoria: "Transporte", monto: "-5" },
      { categoria: "Otros", monto: "100" },
    ],
    CATEGORIAS_CONSUMO,
  );
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errores).sort(), ["Comida", "Salud", "Transporte"]);
});

test("validarPresupuestos: ignora categorías que no existen, repetidas y el ajuste", () => {
  const r = validarPresupuestos(
    [
      { categoria: "Inventada", monto: "100" },
      { categoria: "Ajustes tarjeta", monto: "100" },
      { categoria: "Comida", monto: "100" },
      { categoria: "Comida", monto: "999" },
      null,
    ],
    [...CATEGORIAS_CONSUMO, "Ajustes tarjeta"],
  );
  assert.ok(r.ok);
  assert.deepEqual(r.guardar, [{ categoria: "Comida", monto_mensual: 100 }]);
  assert.deepEqual(r.borrar, []);
});

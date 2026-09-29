import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mesesEntre,
  progresoMeta,
  rangoParaMeta,
  validarMeta,
} from "../src/lib/metas.ts";

let n = 0;
const t = (fecha, tipo, monto) => ({
  id: `t${++n}`,
  fecha,
  descripcion: "x",
  monto,
  tipo,
  categoria: "Otros",
  cuenta: null,
  origen: "manual",
  usuario_id: "u",
  created_at: "2026-01-01T00:00:00Z",
});

/** Un mes con un ingreso y un egreso. */
const mes = (m, ingreso, egreso) => [
  t(`${m}-05`, "ingreso", ingreso),
  t(`${m}-10`, "egreso", egreso),
];

const meta = (extra = {}) => ({
  nombre: "Viaje",
  monto_objetivo: 1_000_000,
  fecha_inicio: "2026-06-15",
  fecha_objetivo: "2027-03-31",
  ...extra,
});

test("mesesEntre", () => {
  assert.equal(mesesEntre("2026-09", "2027-03"), 6);
  assert.equal(mesesEntre("2026-09", "2026-09"), 0);
  assert.equal(mesesEntre("2027-01", "2026-12"), -1);
});

test("acumulado: suma el balance de cada mes desde el inicio, con el actual a medias", () => {
  const tx = [
    ...mes("2026-05", 500_000, 100_000), // antes del inicio: no suma
    ...mes("2026-06", 500_000, 400_000), // +100k (mes de inicio entero)
    ...mes("2026-07", 500_000, 450_000), // +50k
    ...mes("2026-08", 500_000, 550_000), // −50k: un mes en rojo resta
    ...mes("2026-09", 600_000, 200_000), // +400k, mes en curso
  ];
  const p = progresoMeta(meta(), tx, "2026-09-29");
  assert.deepEqual(
    p.balances.map((b) => [b.mes, b.balance]),
    [["2026-06", 100_000], ["2026-07", 50_000], ["2026-08", -50_000], ["2026-09", 400_000]],
  );
  assert.equal(p.acumulado, 500_000);
  assert.equal(p.falta, 500_000);
  assert.equal(p.porcentaje, 50);
});

test("lo sobrante de un mes no se resetea: un mes sin movimientos suma 0 y el acumulado sigue", () => {
  const tx = [...mes("2026-06", 300_000, 100_000), ...mes("2026-08", 100_000, 50_000)];
  const p = progresoMeta(meta(), tx, "2026-09-10");
  assert.equal(p.acumulado, 250_000); // 200k de junio + 0 julio + 50k agosto + 0 septiembre
});

test("meses restantes y necesario por mes: del mes que viene al objetivo, inclusive", () => {
  const tx = mes("2026-09", 400_000, 100_000); // acumulado 300k
  const p = progresoMeta(meta({ fecha_inicio: "2026-09-01" }), tx, "2026-09-29");
  assert.equal(p.mesesRestantes, 6); // oct, nov, dic, ene, feb, mar
  assert.equal(p.necesarioPorMes, Math.round((700_000 / 6) * 100) / 100);
});

test("ritmo: promedio de los últimos meses completos con datos, sin el actual", () => {
  const tx = [
    ...mes("2026-02", 500_000, 400_000), // fuera de la ventana (mar–ago)
    ...mes("2026-04", 500_000, 400_000), // +100k
    ...mes("2026-06", 500_000, 300_000), // +200k (mayo vacío: no promedia como 0)
    ...mes("2026-08", 500_000, 200_000), // +300k
    ...mes("2026-09", 900_000, 0), // mes actual: no entra al ritmo
  ];
  const p = progresoMeta(meta(), tx, "2026-09-29");
  assert.deepEqual(p.ritmo, { promedio: 200_000, meses: 3 });
});

test("proyección: con menos de 3 meses completos no se proyecta", () => {
  const tx = [...mes("2026-08", 500_000, 100_000), ...mes("2026-09", 1, 0)];
  const p = progresoMeta(meta(), tx, "2026-09-29");
  assert.equal(p.ritmo, null);
  assert.deepEqual(p.proyeccion, { tipo: "sin-datos", mesesConDatos: 1 });
});

test("proyección: adelantado, a tiempo y atrasado según el mes estimado", () => {
  // Acumulado desde junio: 3 × 100k = 300k → faltan 700k.
  const base = [
    ...mes("2026-06", 200_000, 100_000),
    ...mes("2026-07", 200_000, 100_000),
    ...mes("2026-08", 200_000, 100_000),
  ];
  // Ritmo 100k/mes → 7 meses → abril 2027.
  const r = progresoMeta(meta(), base, "2026-09-29");
  assert.deepEqual(r.proyeccion, { tipo: "estimada", mes: "2027-04", meses: 7, estado: "atrasado" });

  const aTiempo = progresoMeta(meta({ fecha_objetivo: "2027-04-30" }), base, "2026-09-29");
  assert.equal(aTiempo.proyeccion.estado, "a-tiempo");

  const adelantado = progresoMeta(meta({ fecha_objetivo: "2027-12-31" }), base, "2026-09-29");
  assert.equal(adelantado.proyeccion.estado, "adelantado");
});

test("proyección: con ritmo negativo o cero no se llega", () => {
  const tx = [
    ...mes("2026-06", 100_000, 200_000),
    ...mes("2026-07", 100_000, 200_000),
    ...mes("2026-08", 100_000, 100_000),
  ];
  const p = progresoMeta(meta(), tx, "2026-09-29");
  assert.equal(p.proyeccion.tipo, "sin-ritmo");
  assert.equal(p.acumulado, -200_000);
  assert.equal(p.porcentaje, 0); // la barra no va para atrás
});

test("meta alcanzada", () => {
  const tx = mes("2026-07", 2_000_000, 500_000);
  const p = progresoMeta(meta(), tx, "2026-09-29");
  assert.equal(p.proyeccion.tipo, "alcanzada");
  assert.equal(p.porcentaje, 100);
  assert.equal(p.necesarioPorMes, null);
  assert.equal(p.vencida, false);
});

test("fecha objetivo pasada sin llegar: vencida, sin meses restantes", () => {
  const tx = mes("2026-06", 200_000, 100_000);
  const p = progresoMeta(meta({ fecha_objetivo: "2026-08-31" }), tx, "2026-09-29");
  assert.equal(p.vencida, true);
  assert.equal(p.mesesRestantes, 0);
  assert.equal(p.necesarioPorMes, null);
});

test("meta que empieza en el futuro: acumulado 0", () => {
  const p = progresoMeta(meta({ fecha_inicio: "2026-11-01" }), mes("2026-09", 10, 0), "2026-09-29");
  assert.equal(p.acumulado, 0);
  assert.deepEqual(p.balances, []);
});

test("rangoParaMeta cubre el inicio y los 6 meses del ritmo", () => {
  assert.deepEqual(rangoParaMeta(meta(), "2026-09"), { desde: "2026-03-01", hasta: "2026-10-01" });
  assert.deepEqual(
    rangoParaMeta(meta({ fecha_inicio: "2025-01-20" }), "2026-09"),
    { desde: "2025-01-01", hasta: "2026-10-01" },
  );
});

test("validarMeta", () => {
  const ok = validarMeta({ nombre: " Viaje ", monto: "1.500.000", fecha_inicio: "2026-09-29", fecha_objetivo: "2027-06-30" });
  assert.deepEqual(ok, {
    ok: true,
    valor: { nombre: "Viaje", monto_objetivo: 1_500_000, fecha_inicio: "2026-09-29", fecha_objetivo: "2027-06-30" },
  });

  const mal = validarMeta({ nombre: "", monto: "0", fecha_inicio: "2026-09-29", fecha_objetivo: "2026-09-29" });
  assert.equal(mal.ok, false);
  assert.deepEqual(Object.keys(mal.errores).sort(), ["fecha_objetivo", "monto", "nombre"]);

  const fechas = validarMeta({ nombre: "x", monto: "1", fecha_inicio: "1990-01-01", fecha_objetivo: "2026-02-30" });
  assert.deepEqual(Object.keys(fechas.errores).sort(), ["fecha_inicio", "fecha_objetivo"]);
});

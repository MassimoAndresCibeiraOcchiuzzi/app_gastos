import { test } from "node:test";
import assert from "node:assert/strict";
import { cambiosFijos, esComercioFijo, gastosFijosMes } from "../src/lib/fijos.ts";

test("esComercioFijo: misma normalización que las reglas", () => {
  const patrones = ["NETFLIX", "ALQUILER DEPTO", "COTO SUC"];
  for (const d of ["Netflix.com", "NETFLIX 12", "alquiler depto", "Alquiler  Depto.", "Coto Suc. 45", "MERPAGO*NETFLIX"]) {
    assert.equal(esComercioFijo(d, patrones), true, d);
  }
  for (const d of ["Netfli", "Alquiler", "COTORRA", ""]) {
    assert.equal(esComercioFijo(d, patrones), false, d);
  }
  assert.equal(esComercioFijo("Netflix", []), false);
});

test("cambiosFijos: calcula el patrón y gana lo último por comercio", () => {
  assert.deepEqual(
    cambiosFijos([
      { descripcion: "Netflix", fijo: true },
      { descripcion: "Gimnasio X - Cuota 03/12", fijo: true },
      { descripcion: "Spotify", fijo: false },
      { descripcion: "NETFLIX 99", fijo: false }, // mismo comercio: gana éste
      { descripcion: "123", fijo: true }, // sin comercio reconocible
      { descripcion: 5, fijo: true }, // basura
      { descripcion: "Luz", fijo: "si" }, // basura
      null,
    ]),
    { marcar: ["GIMNASIO X"], olvidar: ["SPOTIFY", "NETFLIX"] },
  );
});

const t = (fecha, descripcion, monto, extra = {}) => ({
  id: descripcion, fecha, descripcion, monto, tipo: "egreso", categoria: "Servicios",
  cuenta: null, origen: "manual", usuario_id: "u", created_at: "", es_fijo: true, ...extra,
});

test("gastosFijosMes: sólo egresos fijos del mes, de mayor a menor, con total", () => {
  const { gastos, total } = gastosFijosMes(
    [
      t("2026-09-05", "Luz", 30000),
      t("2026-09-01", "Alquiler", 400000, { categoria: "Alquiler" }),
      t("2026-09-10", "Coto", 50000, { es_fijo: false }), // no fijo
      t("2026-08-01", "Alquiler", 380000), // otro mes
      t("2026-09-01", "Sueldo", 900000, { tipo: "ingreso" }), // ingreso
      t("2026-09-02", "Viejo", 1000, { es_fijo: undefined }), // sin columna
    ],
    "2026-09",
  );
  assert.deepEqual(gastos.map((g) => [g.descripcion, g.monto]), [["Alquiler", 400000], ["Luz", 30000]]);
  assert.equal(total, 430000);
  assert.match(gastos[0].color, /^var\(--viz-/);
});

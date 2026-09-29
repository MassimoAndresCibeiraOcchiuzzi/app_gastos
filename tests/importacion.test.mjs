import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITE_IMPORTACIONES,
  MAX_BYTES,
  esPdf,
  mensajeLimite,
  revisarContentLength,
} from "../src/lib/importacion.ts";

const bytes = (texto) => new TextEncoder().encode(texto);

test("revisarContentLength: sin header o con basura, falta", () => {
  assert.equal(revisarContentLength(null), "falta");
  assert.equal(revisarContentLength(""), "falta");
  assert.equal(revisarContentLength("abc"), "falta");
  assert.equal(revisarContentLength("-5"), "falta");
  assert.equal(revisarContentLength("1e9"), "falta");
});

test("revisarContentLength: un PDF de 4 MB con el multipart alrededor pasa", () => {
  assert.equal(revisarContentLength("1024"), "ok");
  assert.equal(revisarContentLength(String(MAX_BYTES + 2000)), "ok");
});

test("revisarContentLength: bastante más de 4 MB, excede", () => {
  assert.equal(revisarContentLength(String(MAX_BYTES * 2)), "excede");
  assert.equal(revisarContentLength("999999999999"), "excede");
});

test("esPdf: acepta lo que arranca con %PDF-", () => {
  assert.equal(esPdf(bytes("%PDF-")), true);
  assert.equal(esPdf(bytes("%PDF-1.7\n...")), true);
});

test("esPdf: rechaza otros formatos, cortos o vacíos", () => {
  assert.equal(esPdf(bytes("")), false);
  assert.equal(esPdf(bytes("%PDF")), false);
  assert.equal(esPdf(bytes("%pdf-1.4")), false);
  assert.equal(esPdf(bytes("PK\u0003\u0004")), false); // zip / docx
  assert.equal(esPdf(bytes("\u0089PNG")), false);
  assert.equal(esPdf(bytes(" %PDF-1.4")), false);
});

test("mensajeLimite: dice el límite y cuándo se libera, en hora argentina", () => {
  // 2026-09-30 17:05 UTC = 14:05 en Buenos Aires (UTC-3).
  const m = mensajeLimite("2026-09-30T17:05:00Z");
  assert.ok(m.includes(`${LIMITE_IMPORTACIONES} importaciones`));
  assert.ok(m.includes("14:05 del 30/09"), m);
});

test("mensajeLimite: sin fecha usable no promete una hora", () => {
  for (const valor of [null, "no-es-fecha"]) {
    const m = mensajeLimite(valor);
    assert.ok(m.includes("más tarde"), m);
    assert.ok(!m.includes("a partir de"), m);
  }
});

test("mensajeLimite: la medianoche es 00, no 24", () => {
  // 2026-10-01 03:10 UTC = 00:10 del 01/10 en Buenos Aires.
  const m = mensajeLimite("2026-10-01T03:10:00Z");
  assert.ok(m.includes("00:10 del 01/10"), m);
});

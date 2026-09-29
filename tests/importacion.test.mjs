import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITE_IMPORTACIONES,
  MAX_BYTES,
  esHashValido,
  esPdf,
  hashSha256,
  mensajeDuplicado,
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

test("hashSha256: da el SHA-256 conocido, en hex", async () => {
  // Vectores de prueba estándar (FIPS 180-2).
  assert.equal(
    await hashSha256(bytes("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    await hashSha256(bytes("")),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("hashSha256: un byte distinto, otro hash; los mismos bytes, el mismo", async () => {
  const a = await hashSha256(bytes("%PDF-1.4 resumen junio"));
  assert.equal(a, await hashSha256(bytes("%PDF-1.4 resumen junio")));
  assert.notEqual(a, await hashSha256(bytes("%PDF-1.4 resumen julio")));
});

test("hashSha256: no toca los bytes que recibe", async () => {
  const datos = bytes("%PDF-1.7");
  await hashSha256(datos);
  assert.equal(datos.length, 8);
  assert.equal(esPdf(datos), true);
});

test("esHashValido: sólo 64 caracteres hex en minúscula", async () => {
  assert.equal(esHashValido(await hashSha256(bytes("x"))), true);
  for (const valor of [undefined, null, 42, "", "abc", "A".repeat(64), "g".repeat(64), "a".repeat(65)]) {
    assert.equal(esHashValido(valor), false, String(valor));
  }
});

test("mensajeDuplicado: fecha de la importación anterior, en hora argentina", () => {
  // 2026-09-03 01:30 UTC = 02/09/2026 22:30 en Buenos Aires.
  assert.equal(
    mensajeDuplicado("2026-09-03T01:30:00Z"),
    "Este resumen ya fue importado el 02/09/2026. ¿Querés continuar igual?",
  );
});

test("mensajeDuplicado: sin fecha usable, avisa igual sin inventarla", () => {
  for (const valor of [null, "no-es-fecha"]) {
    assert.equal(
      mensajeDuplicado(valor),
      "Este resumen ya fue importado antes. ¿Querés continuar igual?",
    );
  }
});

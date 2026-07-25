import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extraerTexto } from "../src/lib/pdf.ts";

const dir = mkdtempSync(join(tmpdir(), "gastos-pdf-"));

/** PDF de una página con las líneas que le pases. Sin dependencias. */
function armarPdf(lineas) {
  const escapar = (s) => s.replace(/([\\()])/g, "\\$1");
  const contenido =
    "BT\n/F1 10 Tf\n40 750 Td\n14 TL\n" +
    lineas.map((l) => `(${escapar(l)}) Tj T*\n`).join("") +
    "ET\n";

  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    `<< /Length ${Buffer.byteLength(contenido)} >>\nstream\n${contenido}endstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objetos.forEach((cuerpo, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const ruta = join(dir, `${Math.random().toString(36).slice(2)}.pdf`);
  writeFileSync(ruta, Buffer.from(pdf, "latin1"));
  return new Uint8Array(readFileSync(ruta));
}

const LINEAS = [
  "BANCO EJEMPLO - RESUMEN DE CUENTA TARJETA VISA",
  "Periodo: 01/06/2026 al 30/06/2026",
  "03/06  0012345  SUPERMERCADO DIA CABALLITO   1.234.567,89",
  "05/06  0012346  NETFLIX.COM SUSCRIPCION          9.499,99",
  "07/06  0012347  KIOSCO LA ESQUINA                    8,50",
];

test("extraerTexto saca el texto del PDF", async () => {
  const r = await extraerTexto(armarPdf(LINEAS));
  assert.notEqual(r, null);
  assert.equal(r.paginas, 1);
  for (const l of LINEAS) {
    // El espaciado entre columnas se normaliza, el contenido no.
    for (const pedazo of l.split(/\s{2,}/).filter(Boolean)) {
      assert.ok(r.texto.includes(pedazo), `falta "${pedazo}" en el texto`);
    }
  }
});

test("extraerTexto conserva los importes carácter por carácter", async () => {
  const r = await extraerTexto(armarPdf(LINEAS));
  for (const importe of ["1.234.567,89", "9.499,99", "8,50"]) {
    assert.ok(r.texto.includes(importe), `se perdió el importe ${importe}`);
  }
});

test("extraerTexto NO deja el buffer detached", async () => {
  // pdfjs transfiere el ArrayBuffer al worker. Si no copiamos primero, el
  // fallback a visión se queda sin bytes y la API responde "PDF cannot be
  // empty". Este test es el que agarró ese bug.
  const bytes = armarPdf(LINEAS);
  const antes = bytes.length;
  await extraerTexto(bytes);
  assert.equal(bytes.length, antes, "el buffer quedó vaciado");
});

test("extraerTexto devuelve null si no hay texto aprovechable", async () => {
  // PDF válido pero con una sola letra: es lo que devolvería un escaneo.
  assert.equal(await extraerTexto(armarPdf(["x"])), null);
  assert.equal(await extraerTexto(armarPdf([])), null);
});

test("extraerTexto devuelve null (no explota) con un PDF roto", async () => {
  assert.equal(await extraerTexto(new Uint8Array([1, 2, 3, 4])), null);
  assert.equal(await extraerTexto(new Uint8Array(0)), null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsearRespuesta,
  aCamposGuardables,
  normalizarDescripcion,
  motivoDeExclusion,
  motivoDeImpuesto,
  esDevolucion,
  clasificarItems,
  promptExtraccion,
  DESCRIPCION_AJUSTES,
  EXCLUSIONES,
  IMPUESTOS,
  ESQUEMA_EXTRACCION,
  PROMPT_EXTRACCION,
} from "../src/lib/extraccion.ts";
import { CATEGORIAS_CONSUMO } from "../src/lib/categorias.ts";

const json = (obj) => JSON.stringify(obj);

test("parsearRespuesta acepta la forma esperada", () => {
  const r = parsearRespuesta(
    json({
      items: [
        {
          fecha: "2026-07-03",
          descripcion: "  Verdulería  ",
          monto: 12500.5,
          categoria_sugerida: "Comida",
        },
      ],
    }),
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.items, [
    {
      fecha: "2026-07-03",
      descripcion: "Verdulería",
      monto: 12500.5,
      categoria_sugerida: "Comida",
    },
  ]);
});

test("parsearRespuesta no toca los montos que le llegan", () => {
  // El parser no interpreta: sólo valida la forma. Quién decide qué es gasto
  // es aCamposGuardables.
  const r = parsearRespuesta(
    json({
      items: [
        {
          fecha: "2026-07-10",
          descripcion: "Algo raro",
          monto: -50000,
          categoria_sugerida: "Otros",
        },
      ],
    }),
  );
  assert.equal(r.items[0].monto, -50000);
});

test("parsearRespuesta avisa cuando no es JSON", () => {
  const r = parsearRespuesta("lo siento, no puedo");
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON/);
});

test("parsearRespuesta avisa cuando falta items", () => {
  for (const cuerpo of ["{}", "[]", json({ datos: [] }), json(null)]) {
    const r = parsearRespuesta(cuerpo);
    assert.equal(r.ok, false, `debería rechazar ${cuerpo}`);
  }
});

test("parsearRespuesta descarta filas con campos rotos", () => {
  const r = parsearRespuesta(
    json({
      items: [
        { fecha: "2026-07-03", descripcion: "ok", monto: 100, categoria_sugerida: "Comida" },
        { fecha: 20260703, descripcion: "fecha numérica", monto: 100, categoria_sugerida: "Comida" },
        { fecha: "2026-07-04", descripcion: "monto texto", monto: "100", categoria_sugerida: "Comida" },
        { fecha: "2026-07-05", descripcion: "monto NaN", monto: Number.NaN, categoria_sugerida: "Comida" },
        null,
      ],
    }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].descripcion, "ok");
});

test("parsearRespuesta cae en Otros si la categoría no es texto", () => {
  const r = parsearRespuesta(
    json({
      items: [
        { fecha: "2026-07-03", descripcion: "x", monto: 1, categoria_sugerida: 7 },
      ],
    }),
  );
  assert.equal(r.items[0].categoria_sugerida, "Otros");
});

test("parsearRespuesta tolera una lista vacía", () => {
  const r = parsearRespuesta(json({ items: [] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.items, []);
});

const item = (extra) => ({
  fecha: "2026-06-03",
  descripcion: "SUPERMERCADO DIA",
  monto: 45230,
  categoria_sugerida: "Comida",
  ...extra,
});

test("aCamposGuardables marca todo como egreso", () => {
  assert.equal(aCamposGuardables(item()).tipo, "egreso");
  // Aunque el modelo se mande un negativo: nunca fabricamos un ingreso.
  assert.deepEqual(aCamposGuardables(item({ monto: -120000 })), {
    descripcion: "SUPERMERCADO DIA",
    monto: "120000.00",
    tipo: "egreso",
    categoria: "Comida",
  });
});

test("aCamposGuardables deja el monto positivo y con 2 decimales", () => {
  assert.equal(aCamposGuardables(item({ monto: 9499.99 })).monto, "9499.99");
  assert.equal(aCamposGuardables(item({ monto: 1000 })).monto, "1000.00");
  assert.equal(aCamposGuardables(item({ monto: 0.5 })).monto, "0.50");
});

test("aCamposGuardables cae en Otros si la categoría no es de las nuestras", () => {
  assert.equal(aCamposGuardables(item({ categoria_sugerida: "Viajes" })).categoria, "Otros");
  assert.equal(aCamposGuardables(item({ categoria_sugerida: "" })).categoria, "Otros");
  assert.equal(aCamposGuardables(item({ categoria_sugerida: "Salud" })).categoria, "Salud");
});

test("aCamposGuardables conserva la descripción tal cual, con la cuota", () => {
  const d = "SMARTPHONE XYZ - Cuota 03/06";
  assert.equal(aCamposGuardables(item({ descripcion: d })).descripcion, d);
});

test("normalizarDescripcion saca tildes, mayúsculas y separadores", () => {
  assert.equal(normalizarDescripcion("Dev. Imp. RG"), "DEVIMPRG");
  assert.equal(normalizarDescripcion("DEVOLUCIÓN IMPUESTO"), "DEVOLUCIONIMPUESTO");
  assert.equal(normalizarDescripcion("Su  Pago   en Pesos"), "SUPAGOENPESOS");
  assert.equal(normalizarDescripcion("DB.RG 4815"), "DBRG4815");
  assert.equal(normalizarDescripcion("Ñandú Café"), "NANDUCAFE");
});

test("los saldos y pagos son ruido puro, no impuestos", () => {
  assert.equal(motivoDeExclusion("SU PAGO EN PESOS"), "SU PAGO");
  assert.equal(motivoDeImpuesto("SU PAGO EN PESOS"), null);
});

test("motivoDeExclusion cubre el ruido puro, escriba como escriba el banco", () => {
  const casos = [
    ["SALDO ANTERIOR AL 01/06", "SALDO ANTERIOR"],
    ["Saldo actual en pesos", "SALDO ACTUAL"],
    ["SU PAGO EN USD", "SU PAGO"],
    ["su pago - gracias", "SU PAGO"],
    ["PAGO MINIMO", "PAGO MINIMO"],
    ["PAGO MIN. DEL PERIODO", "PAGO MIN"],
    ["TOTAL CONSUMOS DEL PERIODO", "TOTAL CONSUMOS"],
    ["Total Consumos de JUAN PEREZ", "TOTAL CONSUMOS"],
    ["LIMITES DE COMPRA", "LIMITES DE COMPRA"],
    ["PROXIMO CIERRE 30/07", "PROXIMO CIERRE"],
    ["PROXIMO VTO. 10/08", "PROXIMO VTO"],
    ["CUOTAS A VENCER", "CUOTAS A VENCER"],
    ["DEBITAREMOS DE SU C.A. LA SUMA DE", "DEBITAREMOS"],
  ];
  for (const [descripcion, motivo] of casos) {
    assert.equal(motivoDeExclusion(descripcion), motivo, `falló con "${descripcion}"`);
  }
});

test("motivoDeImpuesto reconoce impuestos, percepciones y devoluciones", () => {
  const casos = [
    ["IIBB PERCEPCION CABA", "IIBB"],
    ["IIBB PERCEP-CABA", "IIBB"],
    ["PERCEPCION RG 4815", "PERCEP"],
    ["IVA RG 4240 CONSUMOS", "IVA RG"],
    ["IVA RG 4240 21%", "IVA RG"],
    ["DB.RG 4815 RENTAS", "DB.RG"],
    ["DB.RG 5617 30%", "DB.RG"],
    ["DEV. IMP. LEY 25413", "DEV.IMP"],
    ["DEV.IMP. RG 5617 30%", "DEV.IMP"],
    ["DEVOLUCION IMPUESTO LEY", "DEVOLUCION IMP"],
    ["REINTEGRO IVA LEY 27253", "REINTEGRO"],
    ["IMP. LEY 25413 DEBITOS", "IMP. LEY"],
  ];
  for (const [descripcion, motivo] of casos) {
    assert.equal(motivoDeImpuesto(descripcion), motivo, `falló con "${descripcion}"`);
    // Y ninguna es ruido puro: eso las excluiría siempre, ignorando el toggle.
    assert.equal(motivoDeExclusion(descripcion), null, `"${descripcion}" no es ruido`);
  }
});

test("esDevolucion distingue créditos de cargos", () => {
  assert.equal(esDevolucion("DEV.IMP. RG 5617 30%"), true);
  assert.equal(esDevolucion("DEVOLUCION IMPUESTO LEY"), true);
  assert.equal(esDevolucion("REINTEGRO IVA"), true);
  assert.equal(esDevolucion("IIBB PERCEP-CABA"), false);
  assert.equal(esDevolucion("IVA RG 4240 21%"), false);
  assert.equal(esDevolucion("DB.RG 5617 30%"), false);
});

test("motivoDeImpuesto/motivoDeExclusion dejan pasar los consumos de verdad", () => {
  const consumos = [
    "SUPERMERCADO DIA CABALLITO",
    "NETFLIX.COM SUSCRIPCION",
    "YPF ESTACION DE SERVICIO 1120",
    "FARMACITY SUCURSAL 42",
    "EDESUR SERVICIO ELECTRICO",
    "SMARTPHONE XYZ - Cuota 03/06",
    // Comercios que se parecen a las palabras de la lista pero no coinciden.
    "MERCADOPAGO*KIOSCO",
    "PAGOFACIL RAPIPAGO",
    "TOTAL FITNESS GIMNASIO",
    "SALDOS Y RETAZOS TEXTIL",
  ];
  for (const d of consumos) {
    assert.equal(motivoDeExclusion(d), null, `no debería ser ruido "${d}"`);
    assert.equal(motivoDeImpuesto(d), null, `no debería ser impuesto "${d}"`);
  }
});

test("limitación conocida: la coincidencia es por subcadena", () => {
  // "PERCEP" está para agarrar PERCEPCION/PERCEPCIONES, pero se lleva puesta
  // cualquier palabra que empiece igual. Cae en impuestos, no en ruido; el
  // panel de la tabla lo deja a la vista.
  assert.equal(motivoDeExclusion("IMPRENTA LA PERCEPTIVA"), null);
  assert.equal(motivoDeImpuesto("IMPRENTA LA PERCEPTIVA"), "PERCEP");
});

test("cada palabra de las listas se detecta a sí misma", () => {
  for (const clave of EXCLUSIONES) {
    assert.ok(motivoDeExclusion(clave), `ruido "${clave}" no se detecta`);
  }
  for (const clave of IMPUESTOS) {
    assert.ok(motivoDeImpuesto(clave), `impuesto "${clave}" no se detecta`);
  }
});

// --- clasificarItems con el toggle destildado (comportamiento por defecto) ---

test("sin incluir impuestos: consumos pasan, todo lo demás se descarta", () => {
  const items = [
    { fecha: "2026-06-03", descripcion: "SUPERMERCADO DIA", monto: 45230, categoria_sugerida: "Comida" },
    { fecha: "2026-06-05", descripcion: "SU PAGO EN PESOS", monto: -120000, categoria_sugerida: "Otros" },
    { fecha: "2026-06-30", descripcion: "IIBB PERCEPCION CABA", monto: 4221.15, categoria_sugerida: "Servicios" },
    { fecha: "2026-06-30", descripcion: "DEV.IMP. RG", monto: -892.33, categoria_sugerida: "Servicios" },
    { fecha: "2026-06-11", descripcion: "YPF 1120", monto: 38500, categoria_sugerida: "Transporte" },
  ];
  const { consumos, ajuste, descartados } = clasificarItems(items, false);

  assert.deepEqual(consumos.map((c) => c.descripcion), ["SUPERMERCADO DIA", "YPF 1120"]);
  assert.equal(ajuste, null);
  assert.deepEqual(descartados.map((d) => d.motivo), ["SU PAGO", "IIBB", "DEV.IMP"]);
});

test("el ruido le gana al impuesto en la misma línea", () => {
  // "TOTAL CONSUMOS" e "IIBB" juntos: es un subtotal, siempre se descarta,
  // aunque el toggle esté tildado.
  const { ajuste, descartados } = clasificarItems(
    [{ fecha: "2026-06-30", descripcion: "TOTAL CONSUMOS E IIBB", monto: 999, categoria_sugerida: "Otros" }],
    true,
  );
  assert.equal(ajuste, null);
  assert.equal(descartados[0].motivo, "TOTAL CONSUMOS");
});

test("clasificarItems no rompe con listas vacías ni con todo limpio", () => {
  const vacio = clasificarItems([], false);
  assert.deepEqual(vacio.consumos, []);
  assert.equal(vacio.ajuste, null);
  assert.deepEqual(vacio.descartados, []);

  const r = clasificarItems(
    [{ fecha: "2026-06-03", descripcion: "KIOSCO DE LA ESQUINA", monto: 1500, categoria_sugerida: "Comida" }],
    true,
  );
  assert.equal(r.consumos.length, 1);
  assert.equal(r.ajuste, null);
  assert.equal(r.descartados.length, 0);
});

// --- clasificarItems con el toggle tildado ---

const imp = (descripcion, monto) => ({
  fecha: "2026-06-30", descripcion, monto, categoria_sugerida: "Servicios",
});

test("con incluir impuestos: netea todo en un solo ajuste", () => {
  // El resumen de junio real. Tres percepciones + una devolución mayor: el
  // neto da NEGATIVO (crédito). Las devoluciones restan del neto.
  const { consumos, ajuste, descartados } = clasificarItems(
    [
      { fecha: "2026-06-03", descripcion: "SUPERMERCADO DIA", monto: 45230, categoria_sugerida: "Comida" },
      imp("IIBB PERCEP-CABA", 541.76),
      imp("IVA RG 4240 21%", 5688.48),
      imp("DB.RG 5617 30%", 8126.4),
      imp("DEV.IMP. RG 5617 30%", -31554.03),
      { fecha: "2026-06-05", descripcion: "SU PAGO EN PESOS", monto: -120000, categoria_sugerida: "Otros" },
    ],
    true,
  );

  assert.equal(consumos.length, 1);
  // El pago sigue siendo ruido aunque el toggle esté tildado.
  assert.deepEqual(descartados.map((d) => d.motivo), ["SU PAGO"]);

  // Un solo ajuste, con las 4 líneas de detalle y el neto negativo.
  assert.equal(ajuste.lineas.length, 4);
  assert.equal(ajuste.neto, -17197.39);
  // Las devoluciones ya vienen en negativo dentro del detalle.
  assert.deepEqual(ajuste.lineas, [
    { descripcion: "IIBB PERCEP-CABA", monto: 541.76 },
    { descripcion: "IVA RG 4240 21%", monto: 5688.48 },
    { descripcion: "DB.RG 5617 30%", monto: 8126.4 },
    { descripcion: "DEV.IMP. RG 5617 30%", monto: -31554.03 },
  ]);
});

test("neto positivo cuando las percepciones ganan", () => {
  const { ajuste } = clasificarItems(
    [imp("IIBB", 5000), imp("IVA RG", 3000), imp("DEV.IMP", -1000)],
    true,
  );
  assert.equal(ajuste.neto, 7000);
});

test("si los impuestos netean a cero, no hay ajuste", () => {
  // Las devoluciones cancelan las percepciones: el total ya cuadra sin ajuste.
  const { ajuste } = clasificarItems(
    [imp("IIBB", 5000), imp("DEV.IMP", -5000)],
    true,
  );
  assert.equal(ajuste, null);
});

test("el neto no arrastra error de punto flotante", () => {
  const { ajuste } = clasificarItems([imp("IIBB", 0.1), imp("IVA RG", 0.2)], true);
  assert.equal(ajuste.neto, 0.3);
});

test("el ajuste importado hace cerrar el checksum en $0", () => {
  // El invariante que motiva el cambio: consumos + neto == SALDO ACTUAL.
  const CONSUMOS = [
    { fecha: "2026-06-03", descripcion: "SUPERMERCADO DIA", monto: 45230.0, categoria_sugerida: "Comida" },
    { fecha: "2026-06-05", descripcion: "NETFLIX", monto: 9499.99, categoria_sugerida: "Suscripciones" },
    { fecha: "2026-06-11", descripcion: "YPF 1120", monto: 38500.5, categoria_sugerida: "Transporte" },
    { fecha: "2026-02-14", descripcion: "SMARTPHONE - Cuota 03/06", monto: 85000.0, categoria_sugerida: "Otros" },
  ];
  const { consumos, ajuste } = clasificarItems(
    [
      ...CONSUMOS,
      imp("IIBB PERCEP-CABA", 541.76),
      imp("IVA RG 4240 21%", 5688.48),
      imp("DB.RG 5617 30%", 8126.4),
      imp("DEV.IMP. RG 5617 30%", -31554.03),
    ],
    true,
  );

  // El ajuste entra como egreso con monto = neto (negativo). Egresos del mes:
  const egresos =
    Math.round(
      (consumos.reduce((a, c) => a + Math.abs(c.monto), 0) + ajuste.neto) * 100,
    ) / 100;

  // SALDO ACTUAL del resumen: consumos + percepciones - devolución.
  const SALDO = 178230.49 + 14356.64 - 31554.03;
  assert.equal(egresos, Math.round(SALDO * 100) / 100);
  assert.equal(egresos, 161033.1);
});

test("la descripción del ajuste es la esperada", () => {
  assert.equal(DESCRIPCION_AJUSTES, "Ajustes impuestos y percepciones tarjeta");
});

test("el prompt nombra las líneas que no hay que extraer", () => {
  // Guarda contra que alguien recorte el prompt y vuelvan a colarse.
  for (const frase of [
    "SALDO ANTERIOR",
    "SALDO ACTUAL",
    "SU PAGO EN PESOS",
    "SU PAGO EN USD",
    "PAGO MINIMO",
    "TOTAL CONSUMOS DE [nombre]",
    "DETALLE DE TRANSACCION",
  ]) {
    assert.ok(
      PROMPT_EXTRACCION.includes(frase),
      `el prompt debería mencionar "${frase}"`,
    );
  }
});

test("prompt sin impuestos: los manda a la lista de no extraer", () => {
  const p = promptExtraccion(false);
  for (const frase of ["IIBB", "IVA RG", "DB.RG", "PERCEPCION", "DEV. IMP."]) {
    assert.ok(p.includes(frase), `falta "${frase}"`);
  }
  assert.match(p, /Sólo las líneas que son una compra o consumo/);
  // No aparece la instrucción de extraer impuestos.
  assert.doesNotMatch(p, /dos clases de línea/);
  assert.doesNotMatch(p, /IMPUESTOS, PERCEPCIONES Y DEVOLUCIONES/);
});

test("prompt con impuestos: pide extraerlos como ítems individuales", () => {
  const p = promptExtraccion(true);
  assert.match(p, /dos clases de línea/);
  assert.match(p, /IMPUESTOS, PERCEPCIONES Y DEVOLUCIONES/);
  assert.match(p, /NO las agrupes ni las sumes/);
  // Le dice que use Servicios y que no se preocupe por el signo.
  assert.match(p, /usá "Servicios"/);
  assert.match(p, /del signo nos ocupamos nosotros/);
});

test("ambos prompts mantienen el total del resumen", () => {
  for (const p of [promptExtraccion(false), promptExtraccion(true)]) {
    assert.match(p, /DEBITAREMOS DE SU C\.A\./);
    assert.match(p, /total_resumen/);
    assert.match(p, /Nunca lo saques de "TOTAL CONSUMOS/);
  }
});

test("el esquema pide el total por moneda, separado", () => {
  const total = ESQUEMA_EXTRACCION.properties.total_resumen;
  assert.deepEqual([...total.required], ["pesos", "dolares"]);
  assert.equal(total.additionalProperties, false);
  assert.ok(ESQUEMA_EXTRACCION.required.includes("total_resumen"));
});

test("parsearRespuesta devuelve el total del resumen", () => {
  const r = parsearRespuesta(
    json({ items: [], total_resumen: { pesos: 301777.65, dolares: 120.5 } }),
  );
  assert.deepEqual(r.totalResumen, { pesos: 301777.65, dolares: 120.5 });
});

test("parsearRespuesta tolera un total ausente o roto", () => {
  for (const cuerpo of [
    json({ items: [] }),
    json({ items: [], total_resumen: null }),
    json({ items: [], total_resumen: { pesos: "301777,65", dolares: undefined } }),
  ]) {
    const r = parsearRespuesta(cuerpo);
    assert.equal(r.ok, true);
    assert.deepEqual(r.totalResumen, { pesos: null, dolares: null });
  }
});

test("ambos prompts piden los consumos en positivo", () => {
  for (const p of [promptExtraccion(false), promptExtraccion(true)]) {
    assert.match(p, /POSITIVO/);
    assert.match(p, /nunca devuelvas un consumo con monto negativo/i);
  }
});

test("el esquema le pide a la API exactamente los campos acordados", () => {
  const item = ESQUEMA_EXTRACCION.properties.items.items;
  assert.deepEqual(
    [...item.required],
    ["fecha", "descripcion", "monto", "categoria_sugerida"],
  );
  // additionalProperties: false es obligatorio para salida estructurada.
  assert.equal(item.additionalProperties, false);
  assert.equal(ESQUEMA_EXTRACCION.additionalProperties, false);
  // La IA sólo puede sugerir categorías de consumo, nunca "Ajustes tarjeta".
  assert.deepEqual(
    [...item.properties.categoria_sugerida.enum],
    [...CATEGORIAS_CONSUMO],
  );
});

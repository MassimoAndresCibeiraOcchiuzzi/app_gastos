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
  DESCRIPCION_AJUSTES,
  EXCLUSIONES,
  IMPUESTOS,
} from "../src/lib/extraccion.ts";
import {
  promptExtraccion,
  esquemaExtraccion,
  PROMPT_EXTRACCION,
} from "../src/lib/extraccion-prompt.ts";
import {
  CATEGORIAS_SUGERIBLES,
  categoriasParaSugerir,
} from "../src/lib/categorias.ts";

const ESQUEMA = esquemaExtraccion(CATEGORIAS_SUGERIBLES);

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
    { fecha: "2026-07-03", descripcion: "Verdulería", monto: 12500.5, categoria: "Comida" },
  ]);
});

const conCategoria = (categoria_sugerida) =>
  json({
    items: [{ fecha: "2026-07-03", descripcion: "X", monto: 100, categoria_sugerida }],
  });

test("parsearRespuesta usa la categoría que sugiere la IA si existe", () => {
  for (const c of ["Comida", "Transporte", "Suscripciones", "Salud", "Otros"]) {
    assert.equal(parsearRespuesta(conCategoria(c)).items[0].categoria, c);
  }
  // Sin importar mayúsculas: queda con el nombre tal como está en la lista.
  assert.equal(parsearRespuesta(conCategoria("  comida ")).items[0].categoria, "Comida");
});

test("parsearRespuesta manda a Otros una categoría que no existe o no vino", () => {
  for (const c of ["Viajes", "Supermercado", "", 42, null, undefined]) {
    assert.equal(parsearRespuesta(conCategoria(c)).items[0].categoria, "Otros", String(c));
  }
});

test("parsearRespuesta nunca acepta Tarjeta ni Ajustes tarjeta como rubro", () => {
  // Tarjeta es la cuenta; Ajustes tarjeta es sólo para el ítem de impuestos.
  for (const c of ["Tarjeta", "tarjeta", "Ajustes tarjeta"]) {
    const validas = [...CATEGORIAS_SUGERIBLES, c]; // aunque alguien la pase
    assert.equal(parsearRespuesta(conCategoria(c), validas).items[0].categoria, "Otros", c);
  }
});

test("parsearRespuesta acepta las categorías propias del usuario", () => {
  const validas = categoriasParaSugerir(["Viajes", "Mascotas"]);
  assert.equal(parsearRespuesta(conCategoria("Viajes"), validas).items[0].categoria, "Viajes");
  assert.equal(parsearRespuesta(conCategoria("mascotas"), validas).items[0].categoria, "Mascotas");
  // Una propia de OTRO usuario (no está en la lista) no pasa.
  assert.equal(parsearRespuesta(conCategoria("Gimnasio"), validas).items[0].categoria, "Otros");
});

test("parsearRespuesta no toca los montos que le llegan", () => {
  // El parser no interpreta: sólo valida la forma. Quién decide qué es gasto
  // es aCamposGuardables.
  const r = parsearRespuesta(
    json({
      items: [{ fecha: "2026-07-10", descripcion: "Algo raro", monto: -50000 }],
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
        { fecha: "2026-07-03", descripcion: "ok", monto: 100 },
        { fecha: 20260703, descripcion: "fecha numérica", monto: 100 },
        { fecha: "2026-07-04", descripcion: "monto texto", monto: "100" },
        { fecha: "2026-07-05", descripcion: "monto NaN", monto: Number.NaN },
        null,
      ],
    }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].descripcion, "ok");
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
  categoria: "Comida",
  ...extra,
});

test("aCamposGuardables marca los consumos como egreso", () => {
  assert.equal(aCamposGuardables(item()).tipo, "egreso");
  // Aunque el modelo se mande un negativo: nunca fabricamos un ingreso.
  assert.deepEqual(aCamposGuardables(item({ monto: -120000 })), {
    descripcion: "SUPERMERCADO DIA",
    monto: "120000.00",
    tipo: "egreso",
    categoria: "Comida",
  });
});

test("aCamposGuardables carga devoluciones y reintegros como ingreso", () => {
  // Son créditos: como egreso sumarían en vez de restar.
  for (const descripcion of [
    "DEVOLUCION COMPRA ZARA",
    "REINTEGRO PROMO SUPERMERCADO",
    "Devolución Mercado Libre",
  ]) {
    const campos = aCamposGuardables(item({ descripcion, monto: 5000 }));
    assert.equal(campos.tipo, "ingreso", descripcion);
    assert.equal(campos.monto, "5000.00");
  }
  // Una palabra que sólo empieza igual no cuenta.
  assert.equal(aCamposGuardables(item({ descripcion: "REINTEGROSA SRL" })).tipo, "egreso");
});

test("aCamposGuardables deja el monto positivo y con 2 decimales", () => {
  assert.equal(aCamposGuardables(item({ monto: 9499.99 })).monto, "9499.99");
  assert.equal(aCamposGuardables(item({ monto: 1000 })).monto, "1000.00");
  assert.equal(aCamposGuardables(item({ monto: 0.5 })).monto, "0.50");
});

test("aCamposGuardables usa la categoría por rubro, no Tarjeta fija", () => {
  assert.equal(aCamposGuardables(item()).categoria, "Comida");
  assert.equal(
    aCamposGuardables(item({ descripcion: "FARMACITY", categoria: "Salud" })).categoria,
    "Salud",
  );
  // Si por algún motivo llega vacía, Otros (nunca Tarjeta).
  assert.equal(aCamposGuardables(item({ categoria: "  " })).categoria, "Otros");
});

test("aCamposGuardables: una devolución es ingreso, con el rubro del comercio", () => {
  const campos = aCamposGuardables(
    item({ descripcion: "DEVOLUCION COMPRA ZARA", categoria: "Otros" }),
  );
  assert.equal(campos.tipo, "ingreso");
  assert.equal(campos.categoria, "Otros");
  const reintegro = aCamposGuardables(
    item({ descripcion: "REINTEGRO PROMO SUPERMERCADO", categoria: "Comida" }),
  );
  assert.deepEqual([reintegro.tipo, reintegro.categoria], ["ingreso", "Comida"]);
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
    ["PERCEPCION RG 4815", "PERCEPCION"],
    ["PERCEP. IIBB BS AS", "IIBB"],
    ["PERCEP. RG 5617", "PERCEP"],
    ["IVA RG 4240 CONSUMOS", "IVA RG"],
    ["IVA RG 4240 21%", "IVA RG"],
    ["DB.RG 4815 RENTAS", "DB.RG"],
    ["DB.RG 5617 30%", "DB.RG"],
    ["DEV. IMP. LEY 25413", "DEV.IMP"],
    ["DEV.IMP. RG 5617 30%", "DEV.IMP"],
    ["DEVOLUCION IMPUESTO LEY", "DEVOLUCION IMPUESTO"],
    ["DEVOLUCION IMP. LEY 25413", "DEVOLUCION IMP"],
    ["DEVIMP RG 5617", "DEV.IMP"],
    ["REINTEGRO IVA LEY 27253", "REINTEGRO IVA"],
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

test("la coincidencia es por palabra completa, no por pedazo de palabra", () => {
  // Antes se comparaba por subcadena y todos estos se descartaban.
  const consumos = [
    "DEVOLUCION COMPRA ZARA",
    "REINTEGRO PROMO SUPERMERCADO",
    "MERCADOPAGO*PERCEPTRON",
    "IMPRENTA LA PERCEPTIVA",
    "FARMACIA SALDO ACTUALIZADO",
    "RESTO SU PAGODA",
  ];
  for (const d of consumos) {
    assert.equal(motivoDeExclusion(d), null, `no debería ser ruido "${d}"`);
    assert.equal(motivoDeImpuesto(d), null, `no debería ser impuesto "${d}"`);
  }
});

test("la puntuación del banco no importa: se comparan las palabras pegadas", () => {
  for (const d of ["DEV. IMP. RG", "DEV.IMP RG", "DEVIMP RG", "Dev Imp RG"]) {
    assert.equal(motivoDeImpuesto(d), "DEV.IMP", d);
  }
  for (const d of ["SUPAGO EN PESOS", "Su Pago", "SU-PAGO"]) {
    assert.equal(motivoDeExclusion(d), "SU PAGO", d);
  }
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
  // Traen fecha y monto: la revisión los muestra como filas destildadas.
  assert.deepEqual(
    { fecha: descartados[1].fecha, monto: descartados[1].monto },
    { fecha: "2026-06-30", monto: 4221.15 },
  );
});

test("una devolución de comercio es un consumo, no un impuesto", () => {
  const items = [
    { fecha: "2026-06-03", descripcion: "DEVOLUCION COMPRA ZARA", monto: 15000 },
    { fecha: "2026-06-04", descripcion: "REINTEGRO IVA LEY 27253", monto: 300 },
  ];
  for (const incluir of [false, true]) {
    const { consumos } = clasificarItems(items, incluir);
    assert.deepEqual(consumos.map((c) => c.descripcion), ["DEVOLUCION COMPRA ZARA"]);
  }
  // Con impuestos, el reintegro de IVA resta del ajuste.
  assert.equal(clasificarItems(items, true).ajuste.neto, -300);
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
  // No se preocupa por el signo: de eso se ocupa el servidor.
  assert.match(p, /del signo nos ocupamos nosotros/);
});

test("ambos prompts piden la categoría por rubro, con la lista", () => {
  for (const p of [promptExtraccion(false), promptExtraccion(true)]) {
    assert.match(p, /categoria_sugerida/);
    for (const c of CATEGORIAS_SUGERIBLES) {
      assert.ok(p.includes(`"${c}"`), `el prompt debería ofrecer "${c}"`);
    }
    // Ni Tarjeta ni Ajustes tarjeta son opciones de rubro.
    assert.ok(!p.includes(`"Tarjeta"`), "Tarjeta no es un rubro");
    assert.ok(!p.includes(`"Ajustes tarjeta"`), "Ajustes tarjeta no es un rubro");
    assert.match(p, /No inventes categorías/);
  }
});

test("el prompt ofrece las categorías propias y pide preferirlas", () => {
  const p = promptExtraccion(false, categoriasParaSugerir(["Viajes"]));
  assert.ok(p.includes(`"Viajes"`));
  assert.match(p, /categorías propias/);
  // Sin propias, no aparece esa aclaración.
  assert.doesNotMatch(promptExtraccion(false), /categorías propias/);
});

test("ambos prompts mantienen el total del resumen", () => {
  for (const p of [promptExtraccion(false), promptExtraccion(true)]) {
    assert.match(p, /DEBITAREMOS DE SU C\.A\./);
    assert.match(p, /total_resumen/);
    assert.match(p, /Nunca lo saques de "TOTAL CONSUMOS/);
  }
});

test("el esquema pide el total por moneda, separado", () => {
  const total = ESQUEMA.properties.total_resumen;
  assert.deepEqual([...total.required], ["pesos", "dolares"]);
  assert.equal(total.additionalProperties, false);
  assert.ok(ESQUEMA.required.includes("total_resumen"));
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
  const item = ESQUEMA.properties.items.items;
  // fecha, descripción, monto y el rubro sugerido.
  assert.deepEqual([...item.required], ["fecha", "descripcion", "monto", "categoria_sugerida"]);
  // additionalProperties: false es obligatorio para salida estructurada.
  assert.equal(item.additionalProperties, false);
  assert.equal(ESQUEMA.additionalProperties, false);
});

test("el esquema restringe la categoría a las del usuario con enum", () => {
  const lista = categoriasParaSugerir(["Viajes"]);
  const cat = esquemaExtraccion(lista).properties.items.items.properties.categoria_sugerida;
  assert.equal(cat.type, "string");
  assert.deepEqual(cat.enum, lista);
  assert.ok(cat.enum.includes("Otros"), "Otros tiene que estar siempre: es el fallback");
  assert.ok(!cat.enum.includes("Tarjeta"));
  assert.ok(!cat.enum.includes("Ajustes tarjeta"));
});

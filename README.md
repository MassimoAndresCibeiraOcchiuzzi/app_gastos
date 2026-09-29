# app_gastos

PWA de control de gastos personales — **Next.js 16 (App Router) + TypeScript + Tailwind 4 + Supabase**.

Registrás ingresos y egresos (a mano o importando el PDF de un resumen de
tarjeta/banco), los ves por mes con su resumen y un dashboard de gráficos, y
podés exportar todo a CSV. Cada usuario entra con un magic link por email y sólo
ve sus propios datos (Row Level Security en Supabase). Es instalable como app en
el celular.

**Cómo está organizado este README:** primero el estado por fases y las notas de
diseño de las partes que no son obvias (importación de PDF, checksum, impuestos);
después el [modelo de datos](#modelo-de-datos), la [puesta en
marcha](#puesta-en-marcha), la [estructura de carpetas](#estructura-relevante) y
una guía de [cómo agregar una funcionalidad nueva](#cómo-agregar-una-funcionalidad-nueva).

## Estado

**Fase 1**

- [x] Proyecto Next.js con App Router, TypeScript y Tailwind
- [x] Conexión a Supabase (`@supabase/supabase-js` + `@supabase/ssr`)
- [x] Login por email con magic link
- [x] Tabla `transacciones` con RLS (SQL en `supabase/schema.sql`)
- [x] PWA instalable (manifest + íconos + service worker)

**Fase 2**

- [x] Formulario de carga manual (`origen='manual'`)
- [x] Lista del mes, por fecha descendente, con eliminar
- [x] Resumen del mes: ingresos, egresos y balance en pesos
- [x] Navegación entre meses

**Fase 3**

- [x] Pantalla `/dashboard`, separada de la lista
- [x] Torta de egresos por categoría (monto y porcentaje)
- [x] Barras agrupadas de ingresos vs egresos, últimos 6 meses
- [x] ~~Top 3 categorías del mes~~ → reemplazado por la lista interactiva (abajo)
- [x] Responsive: una columna en el teléfono, dos en la compu

**Dashboard, paso A**

- [x] Lista de categorías interactiva: cada fila (o su porción de la torta)
  despliega el detalle de la categoría en el mes
- [x] Comparación de cada categoría contra el promedio de los 3 meses
  anteriores (▲/▼ %, o "nuevo")
- [x] Detalle: total, cantidad, % del mes, mini barras de 6 meses,
  transacciones de mayor a menor y devoluciones aparte
- [x] "Otras (N)" despliega las categorías que agrupa
- [x] La categoría abierta va en la URL (`?cat=`): "atrás" cierra el detalle

**Dashboard, paso B**

- [x] Número principal: "Gastaste $X en [mes]", con la comparación contra el
  promedio de los 3 meses anteriores y el balance del mes
- [x] En el mes en curso: "(mes en curso)" y sin comparación

**Dashboard, paso C**

- [x] Tocar un mes en el gráfico de 6 meses cambia el mes del Dashboard (misma
  URL `?mes=` que el selector); en la tabla "Ver los números", los meses son
  links que hacen lo mismo

**Dashboard, paso D**

- [x] Barra apilada con el reparto de los egresos del mes por medio de pago
  (Cuenta), con leyenda: etiqueta, % y monto de cada segmento
- [x] Cuentas normalizadas (mayúsculas, acentos y espacios de más): "tarjeta",
  "Tarjeta " y "TARJETA" son la misma
- [x] Sin cuenta al final, rayada; más de 4 cuentas → "Otras (N)"
- [x] Aviso cuando "Sin cuenta" supera el 30%

**Fase 4**

- [x] Botón "Exportar" en Movimientos, con elección del período: el mes que
      estás viendo (por defecto), un mes específico o todo el historial
- [x] Nombre según el período: `gastos_septiembre_2026.csv` para un mes,
      `gastos_2026-07-23.csv` (fecha de exportación) para todo el historial
- [x] Descarga común en la compu, hoja de compartir en el celular

**Fase 5**

- [x] Pantalla `/importar` con subida de PDF
- [x] API route que manda el PDF a Claude y pide un JSON con los movimientos
- [x] Tabla editable de revisión: incluir/excluir, monto, fecha, tipo, categoría
- [x] "Confirmar e importar" inserta con `origen='pdf'`
- [x] Errores con mensaje claro en vez de pantalla rota

**Fase 6 — Categorías propias**

- [x] Tabla `categorias` con RLS (SQL en `supabase/categorias.sql`)
- [x] Selector que combina las del sistema con las propias del usuario
- [x] "+ Agregar categoría nueva" que la crea sin salir de la pantalla (en el
      alta manual y en la tabla de revisión del import)
- [x] Modal "Categorías" para ver y borrar las propias
- [x] No deja borrar una categoría que tiene transacciones (avisa cuántas)
- [x] Dashboard y torta reflejan las nuevas sin tocar código

**Fase 7 — Editar y reglas por comercio**

- [x] Lápiz en cada fila de Movimientos: abre el mismo formulario del alta,
      precargado (monto, fecha, descripción, tipo, categoría y cuenta)
- [x] La edición pasa por la misma validación que el alta y los mismos CHECK
      de la base; usa la política de UPDATE de `transacciones`
- [x] Tabla `reglas_categoria` con RLS (SQL en `supabase/reglas_categoria.sql`)
- [x] Al corregir una categoría (editando o en la revisión del import):
      "Aplicar siempre a este comercio", tildado de entrada
- [x] Al importar, la regla del comercio pisa la sugerencia de la IA y la fila
      dice "categoría por tu regla"
- [x] Las reglas se ven y se borran en el modal "Categorías"

**Fase 8 — Presupuestos**

- [x] Tabla `presupuestos` con RLS (SQL en `supabase/presupuestos.sql`)
- [x] Tarjeta "Presupuestos" en el Dashboard: gastado de cada tope (monto y %)
      contra cuánto pasó del mes, con una marca de "hoy" en cada barra
- [x] Aviso ámbar si una categoría va más rápido que el mes (o se pasó)
- [x] "Editar" en la misma tarjeta: un campo por categoría, vacío = sin tope
- [x] Las categorías sin presupuesto no cambian en la torta ni en la lista

**Fase 9 — Meta de ahorro**

- [x] Tabla `metas_ahorro` con RLS, una meta por usuario (SQL en
      `supabase/metas_ahorro.sql`)
- [x] Tarjeta "Meta de ahorro" en el Dashboard: crear, editar y borrar
- [x] Ahorro acumulado: suma del balance de cada mes desde el inicio, con el
      mes en curso a medias
- [x] Cuánto falta, cuánto por mes de acá en adelante, ritmo reciente y fecha
      estimada (adelantado / a tiempo / atrasado)

**Fase 10 — Cuotas comprometidas**

- [x] Detección de la cuota en la descripción ("Cuota 03/06" y variantes)
- [x] Agrupado de las cuotas de una misma compra a lo largo de los meses
- [x] Tarjeta en el Dashboard: lo comprometido para el mes que viene, un mini
      gráfico hasta la última cuota y el detalle de las compras
- [x] Navegación entre los meses futuros con cuotas (flechas ‹ › o tocando una
      barra), con el detalle de las compras de cada mes

### Sobre las cuotas

`detectarCuota` (`src/lib/cuotas.ts`) reconoce, sin importar mayúsculas: la
palabra **Cuota, Cuotas, Cuot, Cta, Ctas o C**, un separador opcional
(`.` `:` `-` `#`), opcionalmente **N°/Nº/Nro**, y dos números de 1 o 2 dígitos
separados por **`/`, `-` o `de`**, con o sin espacios. Ejemplos: `Cuota 03/06`,
`CUOTA 3 DE 6`, `C.03/06`, `C03/06`, `Cta. 03/06`, `Cuota N° 3/6`,
`(Cuota 03/06)`. Un `03/06` suelto, sin palabra, **no** se reconoce: no se
distingue de una fecha. La cuota tiene que ir de 1 al total, y el total de 2 a
60. Lo que no matchea queda fuera del cálculo, sin error.

Dos cuotas son de la misma compra si coinciden el comercio (normalizado como
las reglas por comercio), la cantidad de cuotas, el monto (al peso) y el mes
de la primera cuota, que sale de la fecha: la cuota 3 registrada en septiembre
es de una compra con la cuota 1 en julio. Dos cuotas con el mismo número en el
mismo mes son dos compras iguales (se muestran "×2").

La proyección arranca el mes que viene y sigue el calendario de cada compra,
aunque falte importar algún mes, hasta la última cuota de todas. Se buscan
compras en los últimos 12 meses.

En la tarjeta, las flechas ‹ › y las barras recorren los meses con alguna
cuota (uno del medio en $0 se saltea). El mes elegido es estado local, no va
a la URL: no cambia qué mes muestra el resto del Dashboard. Las barras se
muestran de a 12; si hay más meses, pasan a la tanda siguiente al avanzar.

### Sobre la meta de ahorro

El **acumulado** es la suma de ingresos − egresos de cada mes, desde el mes de
`fecha_inicio` (entero: lo importado de un resumen cae el día 1) hasta el
actual, con lo que lleve cargado. Un mes con plata de sobra suma y uno en rojo
resta; nada se resetea. Se calcula siempre al día de hoy, sin importar qué mes
esté elegido en el selector.

- **Por mes, de acá en adelante:** lo que falta dividido por los meses que van
  del que viene al de la fecha objetivo, inclusive. El mes actual no cuenta:
  su balance ya está (a medias) en el acumulado.
- **Ritmo reciente:** promedio del balance de los meses completos, de los
  últimos 6, que tienen al menos un movimiento. Un mes vacío seguramente no se
  cargó, y promediarlo como $0 bajaría el ritmo sin razón. Con menos de 3 no
  se proyecta.
- **Fecha estimada:** el mes en que, a ese ritmo, lo que falta se completa.
  Antes del mes objetivo = adelantado; el mismo mes = a tiempo; después =
  atrasado.

Todo depende de que estén cargados **todos** los ingresos y egresos reales: si
falta el sueldo de un mes, ese mes resta como si se hubiera gastado.

### Sobre los presupuestos

Un presupuesto es un tope **mensual fijo** por categoría: el mismo todos los
meses. Cambiarlo cambia también cómo se ven los meses pasados. Lo gastado es
lo mismo que muestra la torta para esa categoría: egresos del mes, sin restar
devoluciones (que van aparte en el detalle).

El ritmo es lineal: el día 12 de un mes de 30 "pasó el 40%". Una categoría va
**más rápido que el mes** si lo gastado supera ese porcentaje por más de 10
puntos (`MARGEN_RITMO`); sin margen, el día 1 cualquier compra dispararía el
aviso. En un mes cerrado no hay ritmo: sólo se avisa si se pasó del tope.

El modelo lineal se equivoca con gastos que caen de golpe: el alquiler se paga
entero a principio de mes, y lo importado de un resumen se registra el día 1.
Esas categorías van a aparecer "adelantadas" en la primera parte del mes
aunque estén bien.

Se editan en el Dashboard y no en el modal de Categorías: ese modal está en
Movimientos y sólo lista las propias, y los presupuestos también van en las
del sistema. Así se definen donde se miran.

### Sobre las reglas por comercio

El patrón de una regla es el nombre del comercio normalizado con la misma
lógica que el filtro de importación (`palabras` en `src/lib/extraccion.ts`):
mayúsculas, sin tildes, cortado en cualquier separador. Además se sacan los
números sueltos y la indicación de cuota, así "Coto Suc. 45" y "COTO SUC 123"
dan el mismo patrón, `COTO SUC`. Una regla aplica si sus palabras aparecen
completas y seguidas en la descripción: `COTO` coincide con "MERPAGO*COTO 9"
pero no con "COTORRA". Si coinciden varias, gana la más larga.

**No ahorra tokens.** La IA tiene que leer el resumen igual para saber qué
comercios hay, y la categoría es una palabra por ítem de la respuesta. Lo que
da la regla es que una corrección no se repita en cada resumen. Se aplica en el
servidor, con la respuesta de la IA en la mano (`aplicarReglas`). Una regla que
apunta a una categoría que ya no existe se ignora; borrar una categoría propia
borra sus reglas.

Corregir otra vez el mismo comercio pisa la regla (upsert por usuario y
patrón): para cambiar una regla alcanza con corregir de nuevo.

### Sobre las categorías

Las **del sistema** (Comida, Transporte, Suscripciones, Alquiler, Servicios,
Entretenimiento, Salud, Otros y **Tarjeta**) viven en código
(`src/lib/categorias.ts`, `CATEGORIAS_CONSUMO`): son iguales para todos,
versionadas, sin sembrar nada por usuario. La tabla `categorias` guarda **sólo
las personalizadas**, con RLS para que cada uno vea las suyas.

**Tarjeta** es un medio de pago, no un rubro: al importar un resumen, la IA
sugiere el rubro de cada consumo (o lo pone una regla tuya) y "Tarjeta" va en
la cuenta. Se puede seguir eligiendo a mano.

Las transacciones guardan la categoría como **texto**, no como id: por eso una
categoría se puede borrar sólo si no la usa ninguna transacción, y por eso la
torta agrupa por el nombre y toma cualquier categoría nueva sin cambios de
código. El color sale de `COLOR_CATEGORIA` si la categoría tiene uno fijo, o de
un hash estable de su nombre sobre los 8 tonos validados si no (las
personalizadas y "Tarjeta"); mismo nombre → mismo color. La torta muestra el
nombre al lado de cada porción, así el color nunca es el único canal.

### Sobre la importación

La `ANTHROPIC_API_KEY` vive sólo en el servidor: la llamada se hace desde
`src/app/api/importar/route.ts`, nunca desde el navegador.

### Cómo se lee el PDF

Primero se extrae el **texto plano** con `unpdf` (`src/lib/pdf.ts`) y se le
manda ese texto a Claude. Los importes salen de los caracteres del PDF, no de
leer una imagen, y se gastan bastante menos tokens.

Si el PDF **no tiene texto extraíble** — un resumen escaneado, o uno que pdfjs
no puede abrir — se cae al método anterior: el PDF como bloque `document`, que
Claude procesa como texto más imágenes de las páginas. La respuesta trae
`metodo: "texto" | "vision"` y la pantalla avisa cuando usó visión, porque ahí
sí conviene revisar los importes con atención.

> **Por qué `unpdf` y no `pdf-parse`:** `pdf-parse` arrastra un build de pdfjs
> que referencia `DOMMatrix` (una API de navegador) al cargar el módulo. En las
> funciones serverless de Vercel eso rompe con `DOMMatrix is not defined`.
> `unpdf` trae un pdfjs empaquetado para serverless que se autopolyfilea esas
> APIs, así que extrae el mismo texto sin depender del entorno. La ruta declara
> `export const runtime = "nodejs"` para no caer nunca en el runtime Edge.

> `extraerTexto` copia el buffer (`.slice()`) antes de pasárselo a pdfjs: pdfjs
> transfiere el `ArrayBuffer` y lo deja *detached*. Sin esa copia el fallback a
> visión se quedaría sin bytes.

Usa **salida estructurada** (`output_config.format` con un JSON Schema), así que
la API garantiza que la respuesta es JSON válido. El esquema y el prompt están en
`src/lib/extraccion-prompt.ts`, marcado `server-only` para que no viajen al
navegador.

El modelo devuelve cuatro campos por consumo: `fecha`, `descripcion`, `monto` y
`categoria_sugerida`, el **rubro** del comercio (Comida, Transporte,
Suscripciones…). La lista de opciones son las categorías del sistema más las
propias del usuario, y el esquema la restringe con un `enum`, así que el modelo
no puede inventar una. `parsearRespuesta` la vuelve a validar igual: una que no
exista queda en `"Otros"`. "Tarjeta" y "Ajustes tarjeta" nunca se ofrecen como
rubro: la primera es el medio de pago (va en la **cuenta**, que en la
importación arranca en `"Tarjeta"`) y la segunda es sólo para el ítem que netea
impuestos. La categoría de cada fila se puede cambiar en la tabla de revisión.

### Qué se extrae y qué no

Los **consumos** se importan siempre: una transacción por línea, con su comercio
como descripción, la categoría por rubro que sugirió la IA, cuenta `"Tarjeta"` y
tipo egreso. Si el modelo devolviera
un consumo con monto negativo, `aCamposGuardables` lo toma en valor absoluto.
La excepción son las **devoluciones y reintegros de comercios** ("DEVOLUCION
COMPRA ZARA", "REINTEGRO PROMO SUPERMERCADO"): son créditos, así que entran
como **ingreso**, con el rubro del comercio (como egreso sumarían en vez de restar; y como egreso negativo
no pueden, porque en la base sólo el ajuste de impuestos puede ser negativo).

Los **impuestos y percepciones** (IIBB, PERCEP/PERCEPCION, IVA RG, DB.RG,
IMP. LEY, y sus devoluciones: DEV.IMP, DEVOLUCION IMPUESTO, REINTEGRO IVA…)
dependen de un **toggle** que el
usuario tilda antes de subir el PDF, `default destildado`:

- **Destildado** (comportamiento base): no se importan. Quedan como diferencia
  en el checksum; el usuario decide si carga una transacción a mano.
- **Tildado**: la app netea todas esas líneas (impuestos suman, devoluciones
  restan) en **un único ítem de ajuste**:
  - Descripción `Ajustes impuestos y percepciones tarjeta`.
  - Categoría `Ajustes tarjeta` — una categoría aparte, no se mezcla con los
    gastos reales.
  - Tipo **siempre egreso** (bloqueado en la tabla).
  - Monto = el neto, que **puede ser negativo** cuando las devoluciones superan
    a las percepciones (junio: 14.356,64 − 31.554,03 = −17.197,39). Un egreso
    negativo resta de los egresos del mes sin tocar los ingresos.
  - Es una sola fila, editable en monto/fecha e incluible/excluible. No se
    descompone en las líneas individuales; el desplegable muestra el detalle.

Con el ajuste incluido, los egresos del mes coinciden **exactos** con el
SALDO ACTUAL / DEBITAREMOS del resumen, y los ingresos no se ven afectados.

El flag viaja en el `FormData` del POST a `/api/importar`, elige la variante del
prompt (`promptExtraccion(incluirImpuestos)`) y el reparto en el servidor
(`clasificarItems(items, incluirImpuestos)`, que devuelve `ajuste: {neto, lineas}`).

**Monto negativo:** lo decide el servidor, nunca el cliente. `validarTransaccion`
sólo lo acepta si la fila es un egreso de la categoría `Ajustes tarjeta`
(`admiteMontoNegativo`); cualquier otra combinación, incluida el alta manual,
exige montos positivos. La base aplica la misma regla con un `check`.

**Gráficos:** `egresosPorCategoria` excluye la categoría `Ajustes tarjeta` (y
cualquier egreso ≤ 0) para que la torta no muestre una porción negativa rara; su
total es la suma de las porciones que sí se dibujan, no el egreso total del mes.
El resumen mensual y las barras sí usan el egreso total (con el ajuste restado),
que es el número real debitado.

La aritmética del resumen (saldos, pagos, totales) queda afuera siempre, por
**dos vías independientes**:

1. **El prompt** se lo pide al modelo.
2. **La clasificación en el servidor** (`clasificarItems` en `src/lib/extraccion.ts`)
   lo verifica sobre la respuesta ya recibida, antes de mandarla al navegador.
   El prompt es una sugerencia; la clasificación es la garantía.

Compara por **palabra completa**, en MAYÚSCULAS y sin tildes, contra
`EXCLUSIONES` (ruido puro) e `IMPUESTOS`. Las palabras consecutivas se comparan
pegadas, así `DEV. IMP.`, `DEV.IMP` y `DEVIMP` caen en la misma bolsa (cada
banco puntúa distinto), pero nunca coincide un pedazo de palabra: `PERCEP` no
agarra "PERCEPTRON" ni `SALDO ACTUAL` agarra "SALDO ACTUALIZADO". Por eso cada
variante va escrita en la lista (`PERCEP`, `PERCEPCION`, `PERCEPCIONES`), y
`DEVOLUCION` / `REINTEGRO` sólo cuentan como impuesto junto al nombre del
impuesto (`DEVOLUCION IMPUESTO`, `REINTEGRO IVA`).

### Checksum (informativo)

La respuesta trae `totalResumen: { pesos, dolares }`, que el modelo saca de la
línea `DEBITAREMOS DE SU C.A. ... LA SUMA DE` o, si no está, de `SALDO ACTUAL`.
El prompt le prohíbe explícitamente usar `TOTAL CONSUMOS DE [nombre]`: es un
subtotal parcial de una tarjeta adicional, antes de impuestos.

La pantalla de revisión compara ese número contra la suma de las filas marcadas
(egresos menos ingresos) y avisa en ámbar si no coinciden, con la diferencia
exacta. Los montos se leen con `parsearMonto`, la misma función que usa el
servidor al guardar, así un "1.234,56" corregido a mano suma lo mismo en los dos
lados. Con el toggle de impuestos **tildado** y todas las filas marcadas, la
diferencia da $0. Con el toggle destildado la diferencia son los impuestos que
quedaron afuera, y el aviso sugiere tildarlo o cargar una transacción a mano.

Las dos monedas van por separado: los consumos en dólares **no** se importan ni
se convierten, y el total en dólares se muestra sólo como referencia.

Lo descartado no se tira en silencio: la route lo devuelve en `descartados`
(con fecha y monto) y la pantalla lo muestra al final como **filas destildadas y
editables**, con el motivo de cada exclusión. Si el filtro se equivocó, se tilda
y entra como cualquier otra. "Marcar todas" no las incluye, para no importar
saldos y pagos de a montón. Para agregar o sacar palabras, editá `EXCLUSIONES` /
`IMPUESTOS`.

**Resúmenes repetidos:** la route calcula el SHA-256 del PDF y lo busca en
`resumenes_importados` antes de gastar nada. Si ya está, responde 409 y la
pantalla pregunta "Este resumen ya fue importado el [fecha]. ¿Querés continuar
igual?"; sólo sigue si confirmás. El hash se registra al **confirmar** la
importación, no al analizar. Detecta el archivo exacto: el mismo resumen
descargado de nuevo del home banking puede tener otros bytes y no se detecta.
Si la tabla no existe o la búsqueda falla, se importa sin el aviso.

### Qué fecha se guarda

**La del mes en que pagás el resumen, no la de la compra.** Una cuota 3 de 6 se
compró hace meses pero la plata sale este mes, así que imputarla a la fecha de
compra desordenaría todos los meses.

Antes de subir el PDF elegís el **mes del resumen** (por defecto, el actual).
Todas las filas se cargan con el día 1 de ese mes. La fecha de compra original
que extrae la IA se muestra debajo de cada fila como referencia y la indicación
de cuota queda dentro de la descripción (`SMARTPHONE XYZ - Cuota 03/06`).

La fecha sigue siendo editable por fila. Si la cambiás a mano, esa fila queda
marcada y cambiar el mes del resumen ya no la pisa; hay un enlace para
devolverla al mes si te arrepentís.

Modelo `claude-opus-4-8` con esfuerzo `high` — leer mal un monto ensucia todos
los totales, así que preferimos la precisión a la latencia. Ambos son constantes
al principio de la route.

Límites: 4 MB por PDF (Vercel corta los bodies en 4,5 MB), 500 filas por
importación y **10 importaciones por usuario cada 24 horas**. El tamaño se
rechaza con el header `Content-Length`, antes de leer el cuerpo, y que sea un PDF
se comprueba por sus primeros bytes (`%PDF-`), no por el tipo que declara el
navegador. El límite diario lo lleva la tabla `importaciones`
([`supabase/importaciones.sql`](supabase/importaciones.sql)): la función
`registrar_importacion` chequea y registra el intento en un solo paso, justo
antes de llamar a Claude. Un archivo rechazado por tamaño o formato no descuenta
del cupo; uno que pasa esos controles sí, aunque después falle. Si la tabla no existe
o el chequeo falla, la importación se rechaza (sin límite no se gasta). Las
constantes están en `src/lib/importacion.ts`.

### Sobre el CSV

`/api/exportar` sin parámetros devuelve todo el historial; con `?mes=YYYY-MM`,
sólo ese mes (un mes inválido da 400, nunca "todo" en su lugar). El período
sólo cambia qué filas entran: las columnas y el formato son siempre los mismos.

Columnas: `fecha, descripcion, monto, tipo, categoria, cuenta, origen`. Los
montos van con punto decimal y siempre 2 decimales (`1234.50`), sin separador de
miles, que es lo que lee cualquier programa. El archivo sale con BOM para que
Excel muestre bien los acentos.

Separador: **coma**, que es el estándar. Si vas a abrirlo con doble clic en Excel
en español y te queda todo en una sola columna, cambiá `SEPARADOR` en
`src/lib/csv.ts` a `";"`. Google Sheets y pandas se llevan bien con la coma.

Las celdas que arrancan con `=`, `+`, `@` o un tabulador salen con una comilla
simple adelante, para que Excel no las tome como fórmula.

### Sobre los gráficos

Librería: **recharts** — declarativa, se lleva bien con React 19, tiene
`ResponsiveContainer` (que es la mitad del trabajo de hacerlo responsive) y no
arrastra D3 entero. Cuesta ~390 KB del bundle, pero sólo lo carga `/dashboard`.

**Número principal.** "Gastaste $X" usa todos los egresos del mes, incluido el
ajuste de impuestos de la tarjeta: es el mismo número que "Egresos" en
Movimientos, y el balance también coincide. La torta no incluye el ajuste, así
que cuando lo hay los dos totales difieren; una línea chica lo aclara y el
centro de la torta dice "En categorías". La comparación usa la misma regla que
las categorías (promedio de 3 meses, o el mes anterior con egresos, o nada) y
no se muestra en el mes en curso ni en un mes sin egresos.

**Tocar un mes en las barras.** La columna tocada se calcula con la posición
del toque (y las medidas del gráfico, en constantes compartidas), no con el
`onClick` de recharts: ése informa la columna "activa", que recharts actualiza
al mover el mouse, y con el dedo llegaba siempre la primera. Los dos gráficos
van con `accessibilityLayer={false}`: con la capa de accesibilidad de recharts
el SVG queda enfocable adentro de un contenedor `aria-hidden`. Su versión
accesible es la lista de categorías y la tabla de números.

**Detalle de una categoría.** Todo sale de las transacciones que la página ya
trae (6 meses): `filasCategoriasMes` arma en el servidor cada fila con su
comparación, su serie de 6 meses y sus transacciones, y el cliente sólo abre y
cierra. La comparación va contra el promedio de los 3 meses anteriores si los 3
tienen historia (un mes sin gasto en la categoría cuenta como $0); si no, contra
el mes anterior más cercano con gasto; si no hay ninguno, "nuevo". Las
devoluciones de la categoría (ingresos que vinieron de un resumen, o que dicen
devolución/reintegro) se muestran aparte y no restan: el sueldo cargado en
"Otros" no cuenta como devolución. La categoría abierta se guarda en `?cat=` con
`window.history.pushState`/`replaceState`, que Next sincroniza con
`useSearchParams` sin volver a pedir la página al servidor.

Los colores están en `globals.css` bajo `.viz` y se mapean a cada categoría en
`src/lib/categorias.ts` (`COLOR_CATEGORIA` + el hash de `colorDeCategoria`). Son
8 tonos en un orden validado para daltonismo: el color sigue a la categoría, no
a su puesto en el ranking. Las que no tienen tono fijo (personalizadas y
"Tarjeta") reciben uno de los 8 por hash del nombre.

## Modelo de datos

Dos tablas en Supabase, las dos con **Row Level Security**: cada política filtra
por `usuario_id = auth.uid()`, así que un usuario nunca ve ni toca filas de otro,
aun si la app tuviera un bug. El SQL completo (tablas, índices y políticas) está
en [`supabase/schema.sql`](supabase/schema.sql) y
[`supabase/categorias.sql`](supabase/categorias.sql), y es idempotente.

### `transacciones`

El corazón de la app: un ingreso o egreso por fila.

| Columna | Tipo | Para qué |
| --- | --- | --- |
| `id` | `uuid` | Clave primaria (autogenerada). |
| `fecha` | `date` | Entre 2000 y 2100 (`check`). Fecha imputada. En un alta manual es la que elegís; en un import es el **día 1 del mes en que pagás el resumen** (ver [Qué fecha se guarda](#qué-fecha-se-guarda)). |
| `descripcion` | `text` | Texto libre: el comercio o el concepto. Hasta 200 caracteres (`check`). |
| `monto` | `numeric(14,2)` | Importe, nunca 0. Positivo, salvo el ítem de ajuste de impuestos (egreso de "Ajustes tarjeta"), el único que puede ser negativo (`check`). |
| `tipo` | `text` | `'ingreso'` o `'egreso'` (con `check`). |
| `categoria` | `text` (nullable) | Nombre de la categoría **como texto**, no un id. Puede ser una del sistema, una personalizada, o `null`. Hasta 40 caracteres (`check`). |
| `cuenta` | `text` (nullable) | De qué cuenta/tarjeta salió (texto libre con sugerencias). Hasta 60 caracteres (`check`). |
| `origen` | `text` | `'manual'` o `'pdf'` (con `check`), para saber cómo entró. |
| `usuario_id` | `uuid` | Dueño de la fila. FK a `auth.users`, `on delete cascade`. Default `auth.uid()`. |
| `created_at` | `timestamptz` | Cuándo se creó; desempata el orden dentro de un mismo día. |

Índice `(usuario_id, fecha desc)` para el listado típico (mis transacciones, más
recientes primero).

Los `check` repiten en la base las reglas de `src/lib/validacion.ts`: el navegador
tiene la anon key y la sesión, así que podría escribir directo en la tabla y
saltearse la validación de la app. Si cambiás un límite, cambialo en los dos
lados.

### `categorias`

Sólo las categorías **personalizadas** de cada usuario. Las 8 del sistema no
están acá: viven en el código (`CATEGORIAS_CONSUMO` en `src/lib/categorias.ts`),
son iguales para todos y están versionadas, así que no hace falta sembrarlas por
usuario.

| Columna | Tipo | Para qué |
| --- | --- | --- |
| `id` | `uuid` | Clave primaria (autogenerada). |
| `nombre` | `text` | Nombre de la categoría, 1–40 caracteres (con `check`). |
| `usuario_id` | `uuid` | Dueño. FK a `auth.users`, `on delete cascade`. Default `auth.uid()`. |
| `created_at` | `timestamptz` | Cuándo se creó. |

Índice único `(usuario_id, lower(trim(nombre)))`: no podés tener dos categorías
que difieran sólo en mayúsculas o espacios de los bordes.

> **Por qué la categoría se guarda como texto y no como FK a `categorias`:** así
> el sistema y lo personalizado conviven sin dos columnas, la torta agrupa por el
> nombre y toma cualquier categoría nueva sin cambios de código, y borrar una
> categoría no puede dejar transacciones colgadas. El precio es que una categoría
> personalizada sólo se puede borrar si no la usa ninguna transacción — lo
> verifica `eliminarCategoria` contando filas antes de borrar.

## Puesta en marcha

### 1. Variables de entorno

Ya existe `.env.local` (no se commitea). Si lo perdés, copiá `.env.example` y
completá las tres variables: las dos de Supabase (Dashboard → Project Settings →
API) y `ANTHROPIC_API_KEY` (console.anthropic.com → API Keys), que sólo se usa
del lado del servidor para leer los PDF.

### 2. Crear las tablas en Supabase

Abrir Supabase Dashboard → **SQL Editor** → New query, pegar el contenido de
[`supabase/schema.sql`](supabase/schema.sql) y ejecutar. Después, otra query con
[`supabase/categorias.sql`](supabase/categorias.sql) para la tabla de categorías
personalizadas (si no la corrés, la app funciona igual pero sólo con las 8 del
sistema). Y una tercera con
[`supabase/importaciones.sql`](supabase/importaciones.sql), el límite diario de
importaciones: **sin ella la importación de PDF queda deshabilitada**.

Por último, los CHECK constraints de `transacciones`
([`supabase/checks_transacciones.sql`](supabase/checks_transacciones.sql)). Si ya
tenés datos cargados, corré antes
[`supabase/diagnostico_checks.sql`](supabase/diagnostico_checks.sql): sólo lee, y
lista las filas que violarían alguna regla. Si hay alguna, corregila primero; si
no, la migración falla entera y no aplica nada.

Y [`supabase/resumenes_importados.sql`](supabase/resumenes_importados.sql), para
avisar cuando subís un resumen que ya importaste (sin ella se importa igual,
pero sin el aviso).

Y [`supabase/presupuestos.sql`](supabase/presupuestos.sql), para los
presupuestos. Sin ella el Dashboard funciona igual y la tarjeta avisa que falta.

Y [`supabase/metas_ahorro.sql`](supabase/metas_ahorro.sql), para la meta de
ahorro. Sin ella el Dashboard funciona igual y la tarjeta avisa que falta.

Y [`supabase/reglas_categoria.sql`](supabase/reglas_categoria.sql), para las
reglas por comercio. Sin ella todo funciona igual, pero "Aplicar siempre a
este comercio" avisa que no pudo guardar la regla.

### 3. Configurar las URLs de Auth

Supabase Dashboard → **Authentication → URL Configuration**:

- Site URL: `http://localhost:3000`
- Redirect URLs: agregar `http://localhost:3000/**`

### 4. Correr

```bash
npm run dev
```

Abrir http://localhost:3000 → redirige a `/login`.

## Estructura relevante

| Ruta | Qué hace |
| --- | --- |
| `src/lib/supabase/client.ts` | Cliente de Supabase para el navegador |
| `src/lib/supabase/server.ts` | Cliente para Server Components / Route Handlers |
| `src/lib/supabase/middleware.ts` | Refresco de sesión + protección de rutas |
| `src/proxy.ts` | Engancha lo anterior a cada request (ex `middleware.ts`) |
| `src/app/login/` | Pantalla de login (magic link) |
| `src/app/auth/callback/route.ts` | Canje del `?code=` del magic link (PKCE) |
| `src/app/auth/confirm/route.ts` | Alternativa con `token_hash` (ver abajo) |
| `src/app/page.tsx` | Movimientos: resumen + alta + lista del mes |
| `src/app/dashboard/page.tsx` | Dashboard: presupuestos, meta de ahorro, cuotas, torta con lista de categorías, medios de pago y barras de 6 meses |
| `src/components/categorias-mes.tsx` | Lista interactiva de categorías y su detalle desplegable |
| `src/components/numero-principal.tsx` | "Gastaste $X en [mes]", comparación y balance |
| `src/components/indicador-comparacion.tsx` | El ▲/▼ % contra el promedio, compartido |
| `src/lib/dashboard.ts` | Filas, comparación contra el promedio, detalle de cada categoría, número principal y reparto por cuenta |
| `src/app/actions/transacciones.ts` | Server actions de alta, edición, borrado e importación |
| `src/lib/cuotas.ts` | Parser de cuotas, agrupado por compra y proyección (puro, testeado) |
| `src/components/cuotas-comprometidas.tsx` | Tarjeta de cuotas comprometidas del Dashboard |
| `src/app/actions/metas.ts` | Server actions de guardar y borrar la meta de ahorro |
| `src/lib/metas.ts` | Acumulado, ritmo, proyección y validación de la meta (puro, testeado) |
| `src/components/meta-ahorro.tsx` | Tarjeta de la meta en el Dashboard y su formulario |
| `src/app/actions/presupuestos.ts` | Server action que guarda el formulario de presupuestos |
| `src/lib/presupuestos.ts` | Avance del mes, progreso y validación de presupuestos (puro, testeado) |
| `src/components/presupuestos-mes.tsx` | Tarjeta de presupuestos del Dashboard y su editor |
| `src/app/actions/reglas.ts` | Server action de borrar una regla por comercio |
| `src/lib/reglas.ts` | Patrón de comercio, búsqueda y aplicación de reglas (puro, testeado) |
| `src/lib/reglas-servidor.ts` | Guardado de reglas (upsert), sólo servidor |
| `src/components/proveedor-movimientos.tsx` | Comparte categorías, cuentas y reglas en Movimientos |
| `src/components/boton-editar.tsx` | Lápiz de cada fila: modal con el formulario precargado |
| `src/app/actions/categorias.ts` | Server actions de crear y borrar categorías |
| `src/components/selector-categoria.tsx` | Selector de categoría con alta inline |
| `src/components/use-categorias.ts` | Estado compartido de categorías propias |
| `src/components/gestor-categorias.tsx` | Modal para ver y borrar las propias y las reglas por comercio |
| `src/app/api/exportar/route.ts` | Genera y sirve el CSV (un mes o todo el historial) |
| `src/lib/csv.ts` | Armado y escapado del CSV |
| `src/app/importar/page.tsx` | Pantalla de importación de resúmenes |
| `src/app/api/importar/route.ts` | Manda el PDF a Claude y devuelve los movimientos |
| `src/lib/extraccion-prompt.ts` | Prompt y esquema de salida (sólo servidor) |
| `src/lib/extraccion.ts` | Clasificación y validación de la respuesta |
| `src/lib/importacion.ts` | Límites de la importación (tamaño, firma PDF, cupo diario) y hash del PDF |
| `src/lib/validacion.ts` | Qué es una transacción válida (alta manual e importación) |
| `src/components/` | Selector de mes, resumen, formulario, lista, navegación |
| `src/components/graficos/` | Torta y barras (recharts) |
| `src/components/graficos/reparto-cuentas.tsx` | Barra apilada de egresos por medio de pago (sin recharts) |
| `src/lib/consultas.ts` | Lectura de transacciones, paginada con orden total (desempate por `id`) |
| `src/lib/agregados.ts` | Totales por tipo, por categoría y por mes |
| `src/lib/categorias.ts` | Categorías del sistema, su color y el largo máximo |
| `src/lib/formato.ts` | Pesos, fechas y navegación de meses |
| `tests/` | Tests de esa lógica (`npm test`) |
| `src/app/error.tsx` | Pantalla de error de cualquier sección (con "Reintentar") |
| `src/app/global-error.tsx` | Pantalla de error si falla el layout raíz (trae sus propios estilos y fuentes) |
| `src/app/not-found.tsx` | Página inexistente (404) |
| `src/app/fuentes.ts` | Las dos fuentes de la app, compartidas por el layout y `global-error` |
| `src/app/manifest.ts` | Manifest de la PWA |
| `public/sw.js` | Service worker (fallback offline) |
| `supabase/schema.sql` | Tabla `transacciones` + políticas RLS |
| `supabase/categorias.sql` | Tabla `categorias` (personalizadas) + políticas RLS |
| `supabase/importaciones.sql` | Tabla `importaciones` + RLS + función del límite diario |
| `supabase/checks_transacciones.sql` | CHECK constraints de `transacciones` |
| `supabase/resumenes_importados.sql` | Hashes de los PDF importados, para avisar repetidos |
| `supabase/diagnostico_checks.sql` | Qué filas existentes violarían esos CHECKs (sólo lectura) |
| `supabase/metas_ahorro.sql` | Meta de ahorro (una por usuario) + políticas RLS |
| `supabase/presupuestos.sql` | Presupuestos mensuales por categoría + políticas RLS |
| `supabase/reglas_categoria.sql` | Reglas de categoría por comercio + políticas RLS |

## Cómo agregar una funcionalidad nueva

Tres recorridos habituales, con el orden en que conviene tocar las cosas. La
regla general: **la lógica pura vive en `src/lib/` y tiene tests; los componentes
sólo la usan.** Si algo se puede testear sin un navegador ni Supabase, va en
`lib`.

### Agregar un campo a `transacciones`

Ejemplo: una nota opcional por transacción.

1. **Base:** agregá la columna en [`supabase/schema.sql`](supabase/schema.sql)
   (`alter table ... add column if not exists`) y corré el SQL en Supabase.
2. **Tipo:** sumá el campo a `Transaccion` en `src/lib/types.ts`.
3. **Validación:** contemplalo en `EntradaTransaccion` y `validarTransaccion`
   (`src/lib/validacion.ts`) — es la única fuente de verdad de qué es válido, la
   comparten el alta manual y el import.
4. **Alta manual:** agregá el input en `src/components/formulario-transaccion.tsx`
   (acordate del `name` para que lo tome el `FormData`).
5. **Persistencia:** revisá que la server action lo pase al insert
   (`src/app/actions/transacciones.ts`) y, si querés que salga en el export,
   agregalo a `COLUMNAS` en `src/lib/csv.ts`.
6. **Tests:** actualizá `tests/validacion.test.mjs`.

### Agregar una categoría del sistema

Las del sistema son las que ve todo el mundo. Todo está en
`src/lib/categorias.ts`:

1. Agregá el nombre a `CATEGORIAS_CONSUMO`.
2. Color: los primeros 8 tienen un tono fijo en `COLOR_CATEGORIA` (`--viz-1..8`
   en `globals.css`, un orden validado para daltonismo). Del noveno en adelante
   **no** agregues una entrada: dejala sin color y `colorDeCategoria` le asigna
   uno de los 8 por hash del nombre (como a las personalizadas). No inventes un
   noveno tono.
3. Listo: el selector y la torta la toman solas, porque parten de esa lista.

> No confundir con las categorías **personalizadas**: esas las crea cada usuario
> desde el selector y van a la tabla `categorias`, sin tocar código.

### Agregar un gráfico al dashboard

1. **Agregado:** si necesitás una forma nueva de los datos, agregá la función en
   `src/lib/agregados.ts` (recibe `Transaccion[]`, devuelve algo listo para
   graficar) y testeala en `tests/agregados.test.mjs`. Reutilizá
   `redondearCentavos` de `src/lib/formato.ts` para cerrar los totales.
2. **Componente:** creá el gráfico en `src/components/graficos/` con **recharts**
   y `ResponsiveContainer`. Para los colores usá `colorDeCategoria` (no
   hardcodees), así una categoría personalizada también recibe su tono.
3. **Página:** el dashboard (`src/app/dashboard/page.tsx`) es un Server Component:
   trae las transacciones, llama a tu función de agregado y le pasa el resultado
   ya calculado al componente cliente del gráfico.

## Nota sobre el magic link

Con el template de email por defecto de Supabase el link usa el flujo **PKCE**: hay que
abrirlo **en el mismo navegador** desde el que se pidió. Si querés que funcione también
al abrirlo en otro dispositivo, cambiá el template en
Authentication → Email Templates → Magic Link por:

```
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Entrar</a>
```

La ruta `/auth/confirm` ya está implementada para ese caso.

# app_gastos

Este repositorio es para la aplicacion que voy a crear para controlar mis gastos.

PWA de control de gastos personales — **Next.js 16 (App Router) + TypeScript + Tailwind 4 + Supabase**.

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
- [x] Top 3 categorías del mes
- [x] Responsive: una columna en el teléfono, dos en la compu

**Fase 4**

- [x] Botón "Exportar historial" en Movimientos
- [x] CSV con todo el historial del usuario (no sólo el mes visible)
- [x] Nombre con la fecha: `gastos_2026-07-23.csv`
- [x] Descarga común en la compu, hoja de compartir en el celular

**Fase 5**

- [x] Pantalla `/importar` con subida de PDF
- [x] API route que manda el PDF a Claude y pide un JSON con los movimientos
- [x] Tabla editable de revisión: incluir/excluir, monto, fecha, tipo, categoría
- [x] "Confirmar e importar" inserta con `origen='pdf'`
- [x] Errores con mensaje claro en vez de pantalla rota

### Sobre la importación

La `ANTHROPIC_API_KEY` vive sólo en el servidor: la llamada se hace desde
`src/app/api/importar/route.ts`, nunca desde el navegador.

### Cómo se lee el PDF

Primero se extrae el **texto plano** con `pdf-parse` (`src/lib/pdf.ts`) y se le
manda ese texto a Claude. Los importes salen de los caracteres del PDF, no de
leer una imagen, y se gastan bastante menos tokens.

Si el PDF **no tiene texto extraíble** — un resumen escaneado, o uno que
`pdf-parse` no puede abrir — se cae al método anterior: el PDF como bloque
`document`, que Claude procesa como texto más imágenes de las páginas. La
respuesta trae `metodo: "texto" | "vision"` y la pantalla avisa cuando usó
visión, porque ahí sí conviene revisar los importes con atención.

> `extraerTexto` copia el buffer antes de pasárselo a `pdf-parse`: pdfjs
> transfiere el `ArrayBuffer` al worker y lo deja *detached*. Sin esa copia el
> fallback a visión se quedaría sin bytes.

`next.config.ts` marca `pdf-parse` como `serverExternalPackages` para que Next
no lo bundlee (arrastra pdfjs, que se resuelve en tiempo de ejecución).

Usa **salida estructurada** (`output_config.format` con un JSON Schema), así que
la API garantiza que la respuesta es JSON válido y que la categoría sale de
`CATEGORIAS`. El esquema y el prompt están en `src/lib/extraccion.ts`.

El modelo devuelve los cuatro campos acordados (`fecha`, `descripcion`, `monto`,
`categoria_sugerida`).

### Qué se extrae y qué no

Los **consumos** se importan siempre: una transacción por línea, con su
comercio y categoría, tipo egreso. Si el modelo devolviera un consumo con monto
negativo, `aCamposGuardables` lo toma en valor absoluto (nunca fabrica un
ingreso a partir de un consumo).

Los **impuestos y percepciones** (IIBB, PERCEP, IVA RG, DB.RG, IMP. LEY, y sus
devoluciones DEV.IMP / DEVOLUCION / REINTEGRO) dependen de un **toggle** que el
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

**Monto negativo:** `validarTransaccion` sólo lo acepta con el flag
`permitirMontoNegativo`, que el frontend marca únicamente para la fila de
ajuste. El alta manual sigue exigiendo montos positivos.

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

Compara la descripción en MAYÚSCULAS, sin tildes y **sin separadores**, contra
`EXCLUSIONES` (ruido puro) e `IMPUESTOS`. Sacar los separadores es lo que hace
que `DEV. IMP.`, `DEV.IMP` y `DEVIMP` caigan en la misma bolsa — cada banco
puntúa distinto.

### Checksum (informativo)

La respuesta trae `totalResumen: { pesos, dolares }`, que el modelo saca de la
línea `DEBITAREMOS DE SU C.A. ... LA SUMA DE` o, si no está, de `SALDO ACTUAL`.
El prompt le prohíbe explícitamente usar `TOTAL CONSUMOS DE [nombre]`: es un
subtotal parcial de una tarjeta adicional, antes de impuestos.

La pantalla de revisión compara ese número contra la suma de las filas marcadas
(egresos menos ingresos) y avisa en ámbar si no coinciden, con la diferencia
exacta. Con el toggle de impuestos **tildado** y todas las filas marcadas, la
diferencia da $0. Con el toggle destildado la diferencia son los impuestos que
quedaron afuera, y el aviso sugiere tildarlo o cargar una transacción a mano.

Las dos monedas van por separado: los consumos en dólares **no** se importan ni
se convierten, y el total en dólares se muestra sólo como referencia.

Lo descartado no se tira en silencio: la route lo devuelve en `descartados` y la
pantalla lo muestra en un desplegable con el motivo de cada exclusión. La
coincidencia es por subcadena, así que un comercio que empiece igual que una
palabra de la lista (`PERCEP` vs. "LA PERCEPTIVA") también cae; por eso se
muestra. Para agregar o sacar palabras, editá `EXCLUSIONES` / `IMPUESTOS`.

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

Límites: 4 MB por PDF (Vercel corta los bodies en 4,5 MB) y 500 filas por
importación.

### Sobre el CSV

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

Los colores están en `globals.css` bajo `.viz` y se mapean a cada categoría en
`src/lib/categorias.ts` (`COLOR_CATEGORIA`). Son 8 tonos en un orden validado
para daltonismo: el color sigue a la categoría, no a su puesto en el ranking.
Si agregás una categoría, dale el slot que sigue en vez de inventar un color.

## Puesta en marcha

### 1. Variables de entorno

Ya existe `.env.local` (no se commitea). Si lo perdés, copiá `.env.example` y
completá las tres variables: las dos de Supabase (Dashboard → Project Settings →
API) y `ANTHROPIC_API_KEY` (console.anthropic.com → API Keys), que sólo se usa
del lado del servidor para leer los PDF.

### 2. Crear la tabla en Supabase

Abrir Supabase Dashboard → **SQL Editor** → New query, pegar el contenido de
[`supabase/schema.sql`](supabase/schema.sql) y ejecutar.

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
| `src/app/dashboard/page.tsx` | Dashboard: torta, top 3 y barras de 6 meses |
| `src/app/actions/transacciones.ts` | Server actions de alta y borrado |
| `src/app/api/exportar/route.ts` | Genera y sirve el CSV del historial |
| `src/lib/csv.ts` | Armado y escapado del CSV |
| `src/app/importar/page.tsx` | Pantalla de importación de resúmenes |
| `src/app/api/importar/route.ts` | Manda el PDF a Claude y devuelve los movimientos |
| `src/lib/extraccion.ts` | Prompt, esquema de salida y validación de la respuesta |
| `src/lib/validacion.ts` | Qué es una transacción válida (alta manual e importación) |
| `src/components/` | Selector de mes, resumen, formulario, lista, navegación |
| `src/components/graficos/` | Torta y barras (recharts) |
| `src/lib/consultas.ts` | Lectura de transacciones, paginada |
| `src/lib/agregados.ts` | Totales por tipo, por categoría y por mes |
| `src/lib/categorias.ts` | Categorías y su color (editá acá para agregar/sacar) |
| `src/lib/formato.ts` | Pesos, fechas y navegación de meses |
| `tests/` | Tests de esa lógica (`npm test`) |
| `src/app/manifest.ts` | Manifest de la PWA |
| `public/sw.js` | Service worker (fallback offline) |
| `supabase/schema.sql` | Tabla `transacciones` + políticas RLS |

## Nota sobre el magic link

Con el template de email por defecto de Supabase el link usa el flujo **PKCE**: hay que
abrirlo **en el mismo navegador** desde el que se pidió. Si querés que funcione también
al abrirlo en otro dispositivo, cambiá el template en
Authentication → Email Templates → Magic Link por:

```
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Entrar</a>
```

La ruta `/auth/confirm` ya está implementada para ese caso.

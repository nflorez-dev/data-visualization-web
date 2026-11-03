# Cómo agregar tus propios archivos y gráficos

Todo el contenido del "vault" (los archivos que aparecen en la tabla, sus
textos y sus gráficos) vive en **`data/files.json`**. Para agregar,
editar o borrar contenido **no hace falta tocar `script.js`**: solo edita
ese JSON.

Cada vez que guardes cambios, recarga la página en el navegador (con un
servidor local corriendo, ver más abajo) para verlos.

## Estructura general

`data/files.json` es un **array** de objetos. Cada objeto es un archivo
que aparecerá como una fila en la tabla:

```json
{
  "id": "F010",
  "filename": "MI_ARCHIVO.TXT",
  "size": 4096,
  "date": "09-15-98",
  "classification": "SECRET",
  "requiresFloppy": false,
  "chart": null,
  "paragraphs": [
    "Primer párrafo del documento.",
    "Segundo párrafo del documento."
  ]
}
```

Para agregar un archivo nuevo, copia uno de los bloques existentes dentro
del array (recuerda la coma `,` entre objetos), pégalo y modifica sus
valores.

### Campos

| Campo            | Tipo                    | Obligatorio | Descripción |
|-------------------|--------------------------|:---:|---|
| `id`              | string                   | ✅ | Identificador único (p. ej. `"F010"`). Si se repite, esa entrada se ignora. |
| `filename`        | string                   | ✅ | Nombre que se ve en la columna FILENAME. |
| `size`            | number (bytes)           | ✅ | Se muestra formateado en la columna SIZE. |
| `date`            | string                   | ✅ | Se muestra tal cual la escribas (p. ej. `"09-15-98"`). |
| `classification`  | string                   | ✅ | `"TOP SECRET"`, `"SECRET"` o `"CONFIDENTIAL"` tienen color propio; cualquier otro valor usa el color por defecto. |
| `requiresFloppy`  | boolean                  | opcional (default `false`) | Si es `true`, el archivo queda "bloqueado" hasta que el usuario hace clic en "insertar disquete". |
| `chart`           | objeto o `null`          | opcional (default `null`) | Si tiene un gráfico, ver sección siguiente. Si es `null`, se muestran `paragraphs`. |
| `paragraphs`      | array de strings         | opcional (default `[]`) | Texto del documento. Se ignora si `chart` no es `null`. |

Puedes omitir `requiresFloppy`, `chart` y `paragraphs` si no los necesitas
— el sistema les pone un valor por defecto automáticamente.

## Gráficos

Hay tres tipos disponibles ahora mismo: `"bar"` (barras agrupadas),
`"line"` (líneas) y `"pie"` (torta). Se definen en el campo `chart`.

### Colores

En `color` puedes usar uno de estos nombres de la paleta del tema:

`"green"`, `"greenDim"`, `"red"`, `"amber"`, `"paleMint"`, `"brown"`, `"text"`

...o directamente un color hexadecimal, p. ej. `"#7ef7ff"`.

### Gráfico de barras (`"bar"`)

```json
{
  "chart": {
    "kind": "bar",
    "title": "VENTAS TRIMESTRALES",
    "subtitle": "USD miles / Q1-Q4 1998",
    "labels": ["Q1", "Q2", "Q3", "Q4"],
    "yMax": 500,
    "yStep": 100,
    "series": [
      { "name": "PRODUCTO A", "color": "green", "values": [120, 150, 170, 200] },
      { "name": "PRODUCTO B", "color": "amber", "values": [90, 110, 130, 160] }
    ]
  }
}
```

- `labels`: una etiqueta por grupo de barras (eje X).
- `series`: una o más series; cada `values` debe tener **la misma
  cantidad de números que `labels`**.
- `yMax` / `yStep`: definen el techo del eje Y y cada cuánto se dibuja
  una línea de grilla.

### Gráfico de líneas (`"line"`)

Misma forma que `"bar"` (mismos campos `labels`, `series`, `yMax`,
`yStep`), solo cambia `"kind": "line"`. Ideal para series de tiempo.

### Gráfico de torta (`"pie"`)

```json
{
  "chart": {
    "kind": "pie",
    "title": "DISTRIBUCION POR REGION",
    "subtitle": "Porcentaje del total",
    "slices": [
      { "label": "NORTE", "value": 40, "color": "green" },
      { "label": "SUR", "value": 35, "color": "amber" },
      { "label": "CENTRO", "value": 25, "color": "red" }
    ]
  }
}
```

Los `value` no necesitan sumar 100: se calculan como proporción del
total automáticamente.

## Agregar un tipo de gráfico nuevo (a futuro)

El sistema está armado para que sumar un tipo de gráfico (por ejemplo
`"area"` o `"radar"`) sea simple y no rompa lo existente:

1. Abre `script.js` y busca el comentario **"Registro de tipos de
   gráfico soportados"**.
2. Escribe una función `drawTuGrafico(ctx, width, height, chart)` que
   dibuje sobre el `canvas` (puedes copiar `drawGroupedBarChart` o
   `drawMultiLineChart` como punto de partida).
3. Regístrala en el objeto `CHART_RENDERERS` con la clave que vayas a
   usar en el JSON, por ejemplo:
   ```js
   const CHART_RENDERERS = {
     bar: drawGroupedBarChart,
     line: drawMultiLineChart,
     pie: drawPieChart,
     area: drawAreaChart, // nuevo
   };
   ```
4. En `data/files.json`, usa `"kind": "area"` y los campos que tu
   función necesite.

Si usas un `"kind"` que no está registrado, esa entrada simplemente se
muestra con un aviso "TIPO DE GRAFICO NO SOPORTADO" en vez de romper el
resto de la página.

## Errores comunes

Si el JSON tiene un error de sintaxis (una coma de más, comillas sin
cerrar, etc.), la tabla de archivos mostrará un mensaje de error en
lugar de la lista — revisa la consola del navegador (F12) para más
detalle, o valida el archivo en https://jsonlint.com/.

Si abriste `index.html` con doble clic (`file://...`), el navegador
puede bloquear la carga del JSON por seguridad. Corre un servidor local
desde la carpeta del proyecto:

```bash
python3 -m http.server 8000
# o
npx serve .
```

y abre `http://localhost:8000`.

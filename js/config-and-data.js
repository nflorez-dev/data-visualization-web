"use strict";
/* ============================================================
   SECURE VAULT — lógica
   Terminal de archivos clasificados, pantalla completa, 1998.
   ============================================================ */

// ---------- Credenciales válidas (demo) ----------

const VALID_CREDENTIALS = {
    NELSON: '187097',
    ADMIN: 'PROMETEUS',
};


// ---------- Paletas ----------

// ---------- Paletas (Estilo BIOS 1996) ----------

// ---------- Paletas (Estilo BIOS Fondo Negro) ----------

const COLORS = {
    green: '#55ff55',
    greenDim: '#8a8a8a',
    red: '#ff5555',
    amber: '#ffaa00',
    paleMint: '#55ffff',
    brown: '#ff55ff',
    text: '#ffffff',
    ink: '#ffffff',
    paper: '#000000',
};

// Paleta que se asigna automáticamente, en orden, a cualquier serie o
// porción de gráfico que NO traiga "color" en el JSON. Así para crear un
// gráfico nuevo alcanza con dar nombres + valores: los colores y el
// contraste quedan resueltos solos.
const AUTO_PALETTE = ['green', 'amber', 'red', 'paleMint', 'brown', 'greenDim'];

// ---------- Datos de archivos ----------
// Los datos ya NO se definen aquí. Se cargan desde data/files.json
// (ver loadFilesData() más abajo). Para agregar/editar archivos y
// gráficos, edita ese JSON — no hace falta tocar este script.
// Guía completa: data/README.md

let FILES = [];
let dataLoadError = null;

// ---------- Carga de datos (data/files.json) ----------

const DATA_URL = 'data/files.json';
const REGION_MAP_URL = 'data/regions-map.json';
const REQUIRED_FIELDS = ['id', 'filename', 'size', 'date', 'classification'];

// Convierte un color del JSON a un valor CSS válido.
// Acepta nombres de la paleta ("green", "amber", ...), un hex directo
// ("#ff00ff"), o directamente nada: si no se especifica, se asigna
// automáticamente un color de AUTO_PALETTE según su posición (index).
function resolveColor(value, index) {
    if (typeof value === 'string') {
        if (value.startsWith('#')) return value;
        if (COLORS[value]) return COLORS[value];
    }
    const auto = AUTO_PALETTE[index % AUTO_PALETTE.length];
    return COLORS[auto];
}

// Redondea un número al siguiente "número lindo" (1/2/5 × 10^n) para que
// los ejes se vean prolijos aunque nadie haya definido yMax/yStep a mano.
function niceCeil(value) {
    if (value <= 0) return 10;
    const exp = Math.floor(Math.log10(value));
    const base = value / Math.pow(10, exp);
    let niceBase;
    if (base <= 1) niceBase = 1;
    else if (base <= 2) niceBase = 2;
    else if (base <= 5) niceBase = 5;
    else niceBase = 10;
    return niceBase * Math.pow(10, exp);
}

// Si el gráfico no trae yMax/yStep, se calculan solos a partir de los
// valores reales — así, para agregar un gráfico nuevo al JSON, alcanza
// con dar "labels" + "series" (o "slices" para torta): nada de calcular
// escalas a mano.
function autoScaleChart(chart) {
    if (!chart || chart.kind === 'pie') return chart;
    if (chart.yMax && chart.yStep) return chart;
    const allValues = (chart.series || []).flatMap((s) => s.values || []);
    const maxVal = Math.max(1, ...allValues);
    const yMax = chart.yMax || niceCeil(maxVal * 1.15);
    const yStep = chart.yStep || yMax / 4;
    chart.yMax = yMax;
    chart.yStep = yStep;
    return chart;
}

function resolveChartColors(chart) {
    if (!chart) return chart;
    if (Array.isArray(chart.series)) {
        chart.series.forEach((s, i) => { s.color = resolveColor(s.color, i); });
    }
    if (Array.isArray(chart.slices)) {
        chart.slices.forEach((s, i) => { s.color = resolveColor(s.color, i); });
    }
    autoScaleChart(chart);
    return chart;
}

// Valida mínimamente cada entrada para no romper toda la app por un solo
// archivo mal formado. Las entradas inválidas se descartan y se avisa en consola.
function validateAndNormalizeFiles(raw) {
    if (!Array.isArray(raw)) {
        throw new Error('data/files.json debe ser un array de archivos (usa [ ] en la raíz).');
    }
    const seenIds = new Set();
    const valid = [];
    raw.forEach((entry, i) => {
        const missing = REQUIRED_FIELDS.filter((f) => entry[f] === undefined || entry[f] === null || entry[f] === '');
        if (missing.length > 0) {
            console.warn(`[data/files.json] Entrada #${i} omitida: faltan los campos ${missing.join(', ')}.`, entry);
            return;
        }
        if (seenIds.has(entry.id)) {
            console.warn(`[data/files.json] Entrada #${i} omitida: el id "${entry.id}" está repetido.`);
            return;
        }
        if (entry.chart && !CHART_RENDERERS[entry.chart.kind]) {
            console.warn(`[data/files.json] "${entry.id}": tipo de gráfico "${entry.chart && entry.chart.kind}" desconocido. Se mostrará como texto sin gráfico.`);
            entry.chart = null;
        }
        seenIds.add(entry.id);
        valid.push({
            requiresFloppy: false,
            chart: null,
            paragraphs: [],
            ...entry,
            chart: resolveChartColors(entry.chart),
        });
    });
    return valid;
}

async function loadFilesData() {
    try {
        const res = await fetch(DATA_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status} al pedir ${DATA_URL}`);
        const raw = await res.json();
        FILES = validateAndNormalizeFiles(raw);
    } catch (err) {
        console.error('No se pudo cargar data/files.json:', err);
        dataLoadError = err;
        FILES = [];
    }
}

// Geometría real de las 47 prefecturas (simplificada, proyectada) usada
// por el gráfico "map". Se carga aparte de files.json porque es un
// dataset geográfico, no un archivo del índice. Ver REGION_MAP_URL.
let REGION_GEO = null;
let regionGeoLoadError = null;

async function loadRegionGeoData() {
    try {
        const res = await fetch(REGION_MAP_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status} al pedir ${REGION_MAP_URL}`);
        REGION_GEO = await res.json();
    } catch (err) {
        console.error('No se pudo cargar data/regions-map.json:', err);
        regionGeoLoadError = err;
        REGION_GEO = null;
    }
}


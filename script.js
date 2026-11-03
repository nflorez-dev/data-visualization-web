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

// Usuarios que ingresan sin contraseña (el campo <PASS> se ignora para ellos).
const NO_PASSWORD_USERS = ['PROFESOR'];

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

// ---------- Estado ----------

const insertedFloppies = new Set();
let currentUser = '';
let selectedIndex = 0;
let sessionStartTime = null;
let activeDocId = null;
let resizeHandler = null;
let pendingChartQuery = '';

// ---------- Utilidades DOM ----------

function $(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error('No se encontró el elemento #' + id);
    return el;
}

function showView(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('view-active'));
    $(id).classList.add('view-active');
}

function pad2(n) { return String(n).padStart(2, '0'); }

function formatSize(bytes) {
    return bytes.toLocaleString('en-US');
}

function classCode(classification) {
    if (classification === 'TOP SECRET') return 'cls-top';
    if (classification === 'SECRET') return 'cls-secret';
    return 'cls-conf';
}

// ---------- Búsqueda / filtros: utilidades ----------

// Minúsculas y sin acentos, para que "poblacion" encuentre "POBLACIÓN".
function norm(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Point-in-polygon por ray casting, para el hit-testing del mapa.
function pointInPolygon(mx, my, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        const intersects = (yi > my) !== (yj > my) && mx < ((xj - xi) * (my - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}

// "poblacion  MES 3" -> ['poblacion', 'mes', '3']
function tokensOf(query) {
    return norm(query).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
}

// Devuelve HTML con las coincidencias resaltadas (y todo el texto escapado).
function highlight(text, tokens) {
    const str = String(text);
    if (!tokens.length) return escapeHTML(str);
    const re = new RegExp('(' + tokens.map(escapeRegExp).join('|') + ')', 'gi');
    return str.split(re)
        .map((part, i) => (i % 2 === 1 ? `<mark class="hit">${escapeHTML(part)}</mark>` : escapeHTML(part)))
        .join('');
}

// ---------- Secuencia de arranque ----------

const BOOT_LINES = [
    'VAULT-OS KERNEL v3.11 ................ LOADED',
    'ENLACE CIFRADO CON ARCHIVO CENTRAL ... ESTABLECIDO',
    'VERIFICANDO INTEGRIDAD DE INDICE ..... OK',
    '',
    'SECURE VAULT — CLASSIFIED FILE SYSTEM',
    'ACCESO RESTRINGIDO AL PERSONAL AUTORIZADO',
    '',
    'Iniciando protocolo de acceso_',
];

function runBootSequence(onDone) {
    const log = $('boot-log');
    let lineIndex = 0;
    let charIndex = 0;
    log.textContent = '';

    function typeNextChar() {
        if (lineIndex >= BOOT_LINES.length) {
            window.setTimeout(onDone, 400);
            return;
        }
        const line = BOOT_LINES[lineIndex];
        if (charIndex <= line.length) {
            const soFar = BOOT_LINES.slice(0, lineIndex).join('\n');
            log.textContent = (soFar ? soFar + '\n' : '') + line.slice(0, charIndex);
            charIndex++;
            window.setTimeout(typeNextChar, line.length === 0 ? 70 : 10);
        } else {
            lineIndex++;
            charIndex = 0;
            window.setTimeout(typeNextChar, 70);
        }
    }
    typeNextChar();
}

// ---------- Login ----------

function setupLogin() {
    const form = $('login-form');
    const errorEl = $('login-error');

    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const user = $('user-input').value.trim().toUpperCase();
        const pass = $('pass-input').value;

        const isNoPasswordUser = NO_PASSWORD_USERS.includes(user);
        const isValid = isNoPasswordUser || (VALID_CREDENTIALS[user] && VALID_CREDENTIALS[user] === pass);

        if (isValid) {
            currentUser = user;
            errorEl.textContent = '';
            enterIndex();
        } else {
            errorEl.textContent = 'ACCESO DENEGADO — CREDENCIALES NO VALIDAS. INTENTO REGISTRADO.';
        }
    });
}

function enterIndex() {
    $('session-user').textContent = currentUser;
    sessionStartTime = Date.now();
    showView('view-index');
    renderFileTable();
    tickClock();
    tickSession();
    window.setInterval(tickClock, 1000);
    window.setInterval(tickSession, 1000);
    document.addEventListener('keydown', handleGlobalKeydown);
    if (window.Tutorial) window.Tutorial.maybeAutoStart(); // primer ingreso: tutorial guiado
}

function renderDataError(err) {
    const body = $('file-table-body');
    body.innerHTML = `
    <tr><td colspan="5" class="data-error">
      ⚠ ERROR AL LEER data/files.json — ${(err && err.message) || 'error desconocido'}<br/>
      Revisa que el archivo tenga JSON válido (sin comas finales, comillas correctas).
      Si abriste index.html con doble clic, usa un servidor local
      (por ejemplo <code>python3 -m http.server</code>) en vez de file://.
    </td></tr>`;
}

function tickClock() {
    const now = new Date();
    $('clock').textContent = `1996-11-30 ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
}

function tickSession() {
    if (!sessionStartTime) return;
    const secs = Math.floor((Date.now() - sessionStartTime) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    $('session-timer').textContent = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

// ---------- Filtros del índice ----------

const TYPE_ORDER = ['all', 'chart', 'bar', 'line', 'pie', 'text'];
const CLASS_ORDER = ['all', 'TOP SECRET', 'SECRET', 'CONFIDENTIAL'];
const indexFilter = { query: '', type: 'all', cls: 'all' };

// Un archivo con disquete pendiente NO revela su contenido interno en la
// búsqueda (series, categorías, título): solo nombre, id, fecha y clasificación.
function isLocked(file) {
    return file.requiresFloppy && !insertedFloppies.has(file.id);
}

// Nombres "buscables" dentro de un gráfico: series/porciones y etiquetas del eje.
function chartEntries(chart) {
    if (!chart) return [];
    if (chart.kind === 'pie') {
        return (chart.slices || []).map((s) => ({ role: 'PORCION', name: s.label || s.name || '' }));
    }
    const xRole = chart.kind === 'line' ? 'PUNTO' : 'CATEGORIA';
    return [
        ...(chart.series || []).map((s) => ({ role: 'SERIE', name: s.name || '' })),
        ...(chart.labels || []).map((l) => ({ role: xRole, name: String(l) })),
    ];
}

function fileHaystack(file) {
    const parts = [file.id, file.filename, file.classification, file.date];
    if (file.chart) {
        parts.push('grafico', file.chart.kind);
        if (!isLocked(file)) {
            parts.push(file.chart.title || '', file.chart.subtitle || '');
            chartEntries(file.chart).forEach((e) => parts.push(e.name));
        }
    }
    return norm(parts.join(' | '));
}

function matchesType(file) {
    switch (indexFilter.type) {
        case 'all': return true;
        case 'chart': return !!file.chart;
        case 'text': return !file.chart;
        default: return !!file.chart && file.chart.kind === indexFilter.type;
    }
}

function getVisibleFiles() {
    const tokens = tokensOf(indexFilter.query);
    return FILES.filter((f) => {
        if (!matchesType(f)) return false;
        if (indexFilter.cls !== 'all' && f.classification !== indexFilter.cls) return false;
        if (tokens.length) {
            const hay = fileHaystack(f);
            if (!tokens.every((t) => hay.includes(t))) return false;
        }
        return true;
    });
}

function filtersActive() {
    return indexFilter.query.trim() !== '' || indexFilter.type !== 'all' || indexFilter.cls !== 'all';
}

// Qué términos de la búsqueda del índice "caen dentro" del gráfico.
// Se usan para mostrar la pista bajo el nombre y para prefiltrar el gráfico al abrirlo.
function deriveChartTerms(chart, query) {
    if (!chart) return [];
    const tokens = tokensOf(query);
    if (!tokens.length) return [];
    const entries = chartEntries(chart).map((e) => norm(e.name));
    const full = tokens.join(' ');
    if (entries.some((n) => n.includes(full))) return [full];
    return tokens.filter((t) => entries.some((n) => n.includes(t)));
}

function chartMatchNote(file, query, tokens) {
    if (!file.chart || isLocked(file) || !tokens.length) return '';
    const terms = deriveChartTerms(file.chart, query);
    if (!terms.length) return '';
    const hits = chartEntries(file.chart).filter((e) => {
        const n = norm(e.name);
        return terms.some((t) => n.includes(t));
    });
    if (!hits.length) return '';
    const shown = hits.slice(0, 3).map((e) => `${e.role}: ${highlight(e.name, tokens)}`).join(' · ');
    const extra = hits.length > 3 ? ` · +${hits.length - 3}` : '';
    return `<span class="match-note">↳ ${shown}${extra}</span>`;
}

function updateFilterUI(count) {
    document.querySelectorAll('#type-chips .chip').forEach((b) => {
        const on = b.dataset.type === indexFilter.type;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('#class-chips .chip').forEach((b) => {
        const on = b.dataset.class === indexFilter.cls;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
    });
    $('filter-count').textContent = `MOSTRANDO ${count}/${FILES.length}`;
    $('filter-reset').hidden = !filtersActive();
}

function cycleFilter(key, order) {
    const i = order.indexOf(indexFilter[key]);
    indexFilter[key] = order[(i + 1) % order.length];
    selectedIndex = 0;
    renderFileTable();
}

function clearIndexFilters() {
    indexFilter.query = '';
    indexFilter.type = 'all';
    indexFilter.cls = 'all';
    $('index-search').value = '';
    selectedIndex = 0;
    renderFileTable();
}

function setupIndexFilters() {
    const search = $('index-search');

    search.addEventListener('input', () => {
        indexFilter.query = search.value;
        selectedIndex = 0;
        renderFileTable();
    });

    search.addEventListener('keydown', (ev) => {
        const list = getVisibleFiles();
        if (ev.key === 'Escape') {
            ev.preventDefault();
            if (search.value) {
                search.value = '';
                indexFilter.query = '';
                selectedIndex = 0;
                renderFileTable();
            } else {
                search.blur();
            }
        } else if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            selectedIndex = Math.max(0, Math.min(selectedIndex + 1, list.length - 1));
            renderFileTable();
        } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderFileTable();
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            if (list[selectedIndex]) openFile(list[selectedIndex].id);
        }
    });

    $('type-chips').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-type]');
        if (!b) return;
        indexFilter.type = b.dataset.type;
        selectedIndex = 0;
        renderFileTable();
    });
    $('class-chips').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-class]');
        if (!b) return;
        indexFilter.cls = b.dataset.class;
        selectedIndex = 0;
        renderFileTable();
    });
    $('filter-reset').addEventListener('click', clearIndexFilters);
}

// ---------- Tabla de índice ----------

function renderFileTable() {
    if (dataLoadError) {
        renderDataError(dataLoadError);
        return;
    }
    const body = $('file-table-body');
    body.innerHTML = '';
    const list = getVisibleFiles();
    selectedIndex = list.length ? Math.min(Math.max(selectedIndex, 0), list.length - 1) : 0;
    updateFilterUI(list.length);

    if (FILES.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="data-error">SIN ARCHIVOS — data/files.json está vacío ([]).</td></tr>';
        return;
    }
    if (list.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="empty-note">SIN COINCIDENCIAS — AJUSTA LA BUSQUEDA O PRESIONA [X] PARA LIMPIAR LOS FILTROS.</td></tr>';
        return;
    }

    const tokens = tokensOf(indexFilter.query);
    list.forEach((file, i) => {
        const tr = document.createElement('tr');
        tr.className = 'file-row' + (i === selectedIndex ? ' selected' : '');
        tr.dataset.index = String(i);

        const chartTag = file.chart ? `<span class="tag-chart">[${file.chart.kind.toUpperCase()}]</span>` : '';
        const floppyIcon = file.requiresFloppy ? '<span class="tag-icon">⊞</span>' : '';
        const note = chartMatchNote(file, indexFilter.query, tokens);

        tr.innerHTML = `
      <td class="col-id">${highlight(file.id, tokens)}</td>
      <td class="col-name">${floppyIcon}${chartTag}<span class="fname-text">${highlight(file.filename, tokens)}</span>${note}</td>
      <td class="col-size">${formatSize(file.size)}</td>
      <td class="col-date">${file.date}</td>
      <td class="col-class"><span class="${classCode(file.classification)}">${file.classification}</span></td>
    `;
        tr.addEventListener('click', () => {
            selectedIndex = i;
            renderFileTable();
            openFile(file.id);
        });
        body.appendChild(tr);
    });

    const selectedRow = body.querySelector('.file-row.selected');
    if (selectedRow) selectedRow.scrollIntoView({ block: 'nearest' });
}

function handleGlobalKeydown(ev) {
    // Mientras se escribe en un campo, las teclas son del campo (salvo F10).
    const typing = ev.target && ev.target.tagName === 'INPUT';
    if (typing && ev.key !== 'F10') return;

    const inDoc = $('view-doc').classList.contains('view-active');

    if (inDoc) {
        if (ev.key === 'Escape') {
            closeDocument();
        } else if (ev.key === '/' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
            const s = document.getElementById('chart-search');
            if (s) {
                ev.preventDefault();
                s.focus();
                s.select();
            }
        }
        return;
    }

    const inIndex = $('view-index').classList.contains('view-active');
    if (!inIndex) return;

    const list = getVisibleFiles();
    const mod = ev.ctrlKey || ev.metaKey || ev.altKey;

    if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        selectedIndex = Math.max(0, Math.min(selectedIndex + 1, list.length - 1));
        renderFileTable();
    } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        renderFileTable();
    } else if (ev.key === 'Enter') {
        ev.preventDefault();
        if (list[selectedIndex]) openFile(list[selectedIndex].id);
    } else if (ev.key === 'F10') {
        ev.preventDefault();
        logOut();
    } else if (mod) {
        return;
    } else if (ev.key === '/') {
        ev.preventDefault();
        $('index-search').focus();
    } else if (ev.key === 't' || ev.key === 'T') {
        cycleFilter('type', TYPE_ORDER);
    } else if (ev.key === 'c' || ev.key === 'C') {
        cycleFilter('cls', CLASS_ORDER);
    } else if (ev.key === 'x' || ev.key === 'X' || ev.key === 'Escape') {
        if (filtersActive()) clearIndexFilters();
    }
}

function logOut() {
    if (window.Tutorial) window.Tutorial.end();
    document.removeEventListener('keydown', handleGlobalKeydown);
    sessionStartTime = null;
    currentUser = '';
    $('user-input').value = '';
    $('pass-input').value = '';$('login-error').textContent = '';
    showView('view-login');
    $('user-input').focus();
}

// ---------- Documento / gráfico ----------

function docHint(file) {
    if (file.requiresFloppy && !insertedFloppies.has(file.id)) return 'UNIDAD A: EN ESPERA';
    return file.chart ? '[/] FILTRAR GRAFICO' : '';
}

function openFile(id) {
    const file = FILES.find((f) => f.id === id);
    if (!file) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    activeDocId = id;

    // Si llegaste buscando algo que está DENTRO del gráfico (una serie, una
    // categoría...), el gráfico se abre ya filtrado por eso.
    pendingChartQuery = file.chart && !isLocked(file)
        ? deriveChartTerms(file.chart, indexFilter.query).join(', ')
        : '';

    $('doc-title').textContent = `${file.id} · ${file.filename}`;
    const badge = $('doc-badge');
    badge.textContent = file.classification;
    badge.className = 'doc-badge ' + classCode(file.classification);
    $('doc-sub').textContent = file.chart ? file.chart.subtitle : `TAMAÑO: ${formatSize(file.size)} bytes · FECHA: ${file.date}`;
    $('doc-hint').textContent = docHint(file);

    renderDocContent(file);
    showView('view-doc');
}

function closeDocument() {
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }
    activeDocId = null;
    pendingChartQuery = '';
    showView('view-index');
}

function renderDocContent(file) {
    const container = $('doc-content');
    container.innerHTML = '';
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }

    const needsFloppy = file.requiresFloppy && !insertedFloppies.has(file.id);

    if (needsFloppy) {
        container.innerHTML = floppyPromptHTML(file.id);
        $(`floppy-btn-${file.id}`).addEventListener('click', () => insertFloppy(file.id));
        return;
    }

    if (file.chart) {
        renderChartBlock(container, file.chart, pendingChartQuery);
        return;
    }

    const textWrap = document.createElement('div');
    textWrap.className = 'doc-text';
    textWrap.innerHTML = file.paragraphs.map((p) => `<p>${p}</p>`).join('');
    container.appendChild(textWrap);
}

function floppyPromptHTML(fileId) {
    return `
    <div class="floppy-prompt">
      <p>◇ ARCHIVO INCOMPLETO — PARTE DEL CONTENIDO RESIDE EN SOPORTE EXTRAIBLE.</p>
      <p>INSERTE EL DISQUETE ROTULADO "${fileId}" EN LA UNIDAD A: PARA CONTINUAR.</p>
      <button type="button" class="floppy-btn" id="floppy-btn-${fileId}">▣ INSERTAR DISQUETE</button>
      <div class="floppy-progress" id="floppy-progress-${fileId}"></div>
    </div>
  `;
}

function insertFloppy(fileId) {
    const btn = $(`floppy-btn-${fileId}`);
    const progress = $(`floppy-progress-${fileId}`);
    btn.disabled = true;
    btn.textContent = '▣ LEYENDO...';

    const steps = ['[■□□□□□□□□□] 10%', '[■■■□□□□□□□] 30%', '[■■■■■□□□□□] 50%',
        '[■■■■■■■□□□] 70%', '[■■■■■■■■■□] 90%', '[■■■■■■■■■■] 100%'];
    let i = 0;
    const interval = window.setInterval(() => {
        progress.textContent = steps[i];
        i++;
        if (i >= steps.length) {
            window.clearInterval(interval);
            window.setTimeout(() => {
                insertedFloppies.add(fileId);
                const file = FILES.find((f) => f.id === fileId);
                pendingChartQuery = file.chart ? deriveChartTerms(file.chart, indexFilter.query).join(', ') : '';
                $('doc-hint').textContent = docHint(file);
                renderDocContent(file);
                renderFileTable();
            }, 300);
        }
    }, 250);
}

// ---------- Gráficos ----------

const CHART_RENDERERS = {
    bar: drawGroupedBarChart,
    line: drawMultiLineChart,
    pie: drawPieChart,
    map: drawJapanMap,
};

function drawEmptyMessage(ctx, w, h) {
    ctx.fillStyle = COLORS.greenDim;
    ctx.font = '13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SIN COINCIDENCIAS — AJUSTA EL FILTRO', w / 2, h / 2);
    ctx.textAlign = 'left';
}

function renderChartBlock(container, chart, initialQuery = '') {
    const isPie = chart.kind === 'pie';
    const items = isPie ? chart.slices : chart.series;   // lo que se filtra por leyenda
    const xLabels = isPie ? [] : chart.labels;           // categorías / puntos del eje X
    const itemWord = isPie ? 'PORCIONES' : 'SERIES';
    const xWord = chart.kind === 'line' ? 'PUNTOS' : 'CATEGORIAS';
    const nameOf = (it) => it.name || it.label || '';

    // Estado del filtro: qué series/porciones y qué etiquetas están visibles.
    const sel = {
        items: new Set(items.map((_, i) => i)),
        labels: new Set(xLabels.map((_, i) => i)),
        fit: true, // reescalar el eje Y a lo visible
    };

    function selectAll() {
        sel.items = new Set(items.map((_, i) => i));
        sel.labels = new Set(xLabels.map((_, i) => i));
    }

    // ---- estructura DOM ----
    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap';

    const panel = document.createElement('div');
    panel.className = 'chart-filters';

    const row1 = document.createElement('div');
    row1.className = 'filter-row';
    row1.innerHTML = `
      <label class="filter-label" for="chart-search">FILTRAR</label>
      <input id="chart-search" class="filter-input" type="text" spellcheck="false" autocomplete="off"
             placeholder="${isPie ? 'porción' : 'serie o etiqueta'} · varias separadas por coma  ( / )" />
      <span class="filter-count"></span>
      ${(chart.kind === 'bar' || chart.kind === 'line') ? '<button type="button" class="chip chart-fit"></button>' : ''}
      <button type="button" class="chip chip-reset chart-reset">LIMPIAR</button>`;
    panel.appendChild(row1);

    const input = row1.querySelector('input');
    const countEl = row1.querySelector('.filter-count');
    const fitBtn = row1.querySelector('.chart-fit');
    const resetBtn = row1.querySelector('.chart-reset');

    const labelChips = [];
    if (!isPie) {
        const row2 = document.createElement('div');
        row2.className = 'filter-row';
        const lbl = document.createElement('span');
        lbl.className = 'filter-label';
        lbl.textContent = xWord;
        const group = document.createElement('div');
        group.className = 'chip-group';
        xLabels.forEach((l, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'chip';
            b.textContent = String(l);
            b.addEventListener('click', () => {
                if (sel.labels.has(i)) sel.labels.delete(i); else sel.labels.add(i);
                refresh();
            });
            labelChips.push(b);
            group.appendChild(b);
        });
        row2.append(lbl, group);
        panel.appendChild(row2);
    }
    wrap.appendChild(panel);

    let captionEl = null;
    if (isPie) {
        captionEl = document.createElement('div');
        captionEl.className = 'chart-caption';
        wrap.appendChild(captionEl);
    }

    // El canvas y el tooltip viven juntos en un "stage" para que las
    // coordenadas del tooltip sigan siendo correctas con el panel de filtros.
    const stage = document.createElement('div');
    stage.className = 'chart-stage';
    const canvas = document.createElement('canvas');
    canvas.className = 'chart-canvas-el';
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    stage.append(canvas, tooltip);
    wrap.appendChild(stage);

    // Leyenda = filtro de series/porciones (clic para ocultar/mostrar).
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    const legendEls = items.map((item, i) => {
        const el = document.createElement('span');
        el.className = 'chart-legend-item';
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.title = 'Clic para mostrar / ocultar';
        const shape = chart.kind === 'bar' ? 'legend-sq' : 'legend-dot';
        el.innerHTML = `<span class="${shape}" style="background:${item.color}"></span>${escapeHTML(nameOf(item))}`;
        const toggle = () => {
            if (sel.items.has(i)) sel.items.delete(i); else sel.items.add(i);
            refresh();
        };
        el.addEventListener('click', toggle);
        el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
        });
        legend.appendChild(el);
        return el;
    });
    wrap.appendChild(legend);
    container.appendChild(wrap);

    // ---- lógica de filtro ----

    // "infectados, mes 3": términos separados por coma (OR). Cada término se
    // busca en series/porciones y en etiquetas del eje. Si coincide con series
    // se muestran solo esas; si coincide con etiquetas, solo esas; si coincide
    // con ambas, se cruzan. Sin coincidencias => vacío.
    function applyQuery() {
        const terms = input.value.split(',').map((t) => norm(t).trim()).filter(Boolean);
        if (!terms.length) { selectAll(); return; }
        const hit = (text) => { const n = norm(text); return terms.some((t) => n.includes(t)); };
        const itemHits = items.map((it, i) => (hit(nameOf(it)) ? i : -1)).filter((i) => i >= 0);
        if (isPie) { sel.items = new Set(itemHits); return; }
        const labelHits = xLabels.map((l, i) => (hit(String(l)) ? i : -1)).filter((i) => i >= 0);
        const allItems = items.map((_, i) => i);
        const allLabels = xLabels.map((_, i) => i);
        sel.items = new Set(itemHits.length ? itemHits : (labelHits.length ? allItems : []));
        sel.labels = new Set(labelHits.length ? labelHits : (itemHits.length ? allLabels : []));
    }

    function isFiltered() {
        return input.value.trim() !== ''
            || sel.items.size !== items.length
            || sel.labels.size !== xLabels.length
            || (!isPie && !sel.fit);
    }

    // Vista filtrada del gráfico que se le pasa al renderer (bar/line).
    function buildView() {
        if (isPie || chart.kind === 'map') return chart;
        const sIdx = [...sel.items].sort((a, b) => a - b);
        const lIdx = [...sel.labels].sort((a, b) => a - b);
        const view = {
            ...chart,
            labels: lIdx.map((i) => chart.labels[i]),
            series: sIdx.map((i) => ({
                ...chart.series[i],
                values: lIdx.map((li) => chart.series[i].values[li] ?? 0),
            })),
        };
        const trimmed = sIdx.length < items.length || lIdx.length < xLabels.length;
        if (sel.fit && trimmed) {
            const maxVal = Math.max(1, ...view.series.flatMap((s) => s.values));
            view.yMax = niceCeil(maxVal * 1.15);
            view.yStep = view.yMax / 4;
        }
        return view;
    }

    function syncControls() {
        legendEls.forEach((el, i) => {
            const on = sel.items.has(i);
            el.classList.toggle('off', !on);
            el.setAttribute('aria-pressed', String(on));
        });
        labelChips.forEach((b, i) => {
            const on = sel.labels.has(i);
            b.classList.toggle('off', !on);
            b.setAttribute('aria-pressed', String(on));
        });
        countEl.textContent = isPie
            ? `${itemWord} ${sel.items.size}/${items.length}`
            : `${itemWord} ${sel.items.size}/${items.length} · ${xWord} ${sel.labels.size}/${xLabels.length}`;
        if (fitBtn) fitBtn.textContent = `ESCALA: ${sel.fit ? 'AJUSTADA' : 'ORIGINAL'}`;
        resetBtn.hidden = !isFiltered();

        if (captionEl) {
            const total = Number(chart.slices.reduce((a, s) => a + s.value, 0).toFixed(2));
            if (sel.items.size === items.length) {
                captionEl.textContent = `TOTAL: ${total}`;
            } else {
                const part = Number([...sel.items].reduce((a, i) => a + chart.slices[i].value, 0).toFixed(2));
                captionEl.textContent = `TOTAL: ${total} · SELECCION: ${part} (${sel.items.size}/${items.length})`;
            }
        }
    }

    function refresh() {
        syncControls();
        tooltip.classList.remove('visible');
        draw(null);
    }

    // ---- dibujo ----
    let hitRegions = [];

    function draw(hoverIndex) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);

        const renderer = CHART_RENDERERS[chart.kind];
        if (!renderer) {
            ctx.fillStyle = COLORS.red;
            ctx.font = '12px "JetBrains Mono", monospace';
            ctx.fillText(`TIPO DE GRAFICO NO SOPORTADO: "${chart.kind}"`, 12, 24);
            hitRegions = [];
            return;
        }

        const view = buildView();
        const isMap = chart.kind === 'map';
        if (!isPie && !isMap && (view.series.length === 0 || view.labels.length === 0)) {
            drawEmptyMessage(ctx, rect.width, rect.height);
            hitRegions = [];
            return;
        }

        hitRegions = renderer(ctx, rect.width, rect.height, view, hoverIndex, { active: sel.items, activeLabels: sel.labels }) || [];
        if ((isPie || isMap) && sel.items.size === 0) drawEmptyMessage(ctx, rect.width, rect.height);
    }

    // ---- eventos ----
    input.addEventListener('input', () => { applyQuery(); refresh(); });
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            ev.preventDefault();
            if (input.value) { input.value = ''; applyQuery(); refresh(); } else { input.blur(); }
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            input.blur();
        }
    });
    resetBtn.addEventListener('click', () => {
        input.value = '';
        selectAll();
        sel.fit = true;
        refresh();
    });
    if (fitBtn) {
        fitBtn.addEventListener('click', () => { sel.fit = !sel.fit; refresh(); });
    }

    canvas.addEventListener('mousemove', (ev) => {
        const rect = canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        const hit = hitRegions.find((r) => {
            if (r.type === 'rect') return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
            if (r.type === 'circle') return Math.hypot(mx - r.x, my - r.y) <= r.r;
            if (r.type === 'poly') return pointInPolygon(mx, my, r.points);
            return false;
        });
        if (hit) {
            tooltip.textContent = hit.label;
            tooltip.style.left = `${hit.tx !== undefined ? hit.tx : mx}px`;
            tooltip.style.top = `${(hit.ty !== undefined ? hit.ty : my) - 8}px`;
            tooltip.classList.add('visible');
            canvas.style.cursor = 'pointer';
        } else {
            tooltip.classList.remove('visible');
            canvas.style.cursor = 'crosshair';
        }

        if (chart.kind === 'line' || chart.kind === 'map') {
            window.requestAnimationFrame(() => draw(hit ? hit.idx : null));
        }
    });
    canvas.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
        if (chart.kind === 'line' || chart.kind === 'map') window.requestAnimationFrame(() => draw(null));
    });

    // Estado inicial (con prefiltro si venías de una búsqueda en el índice).
    if (initialQuery) {
        input.value = initialQuery;
        applyQuery();
    }
    syncControls();
    window.requestAnimationFrame(() => draw(null));
    resizeHandler = () => window.requestAnimationFrame(() => draw(null));
    window.addEventListener('resize', resizeHandler);
}

function drawAxes(ctx, pad, w, h, yMax, yStep) {
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.greenDim;
    ctx.strokeStyle = 'rgba(143,143,137,0.35)';
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;

    ctx.textAlign = 'right';

    const steps = yMax / yStep;
    for (let i = 0; i <= steps; i++) {
        const y = pad.top + h - (h / steps) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + w, y);
        ctx.stroke();

        ctx.fillText(String(Math.round(yStep * i)), pad.left - 6, y + 4);
    }
    ctx.setLineDash([]);
    ctx.textAlign = 'left';

    ctx.strokeStyle = COLORS.greenDim;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + h);
    ctx.lineTo(pad.left + w, pad.top + h);
    ctx.stroke();
}

// ---------- Mapa (gráfico de ubicación) ----------

const MAP_REGION_KEYS = ['HOKKAIDO', 'TOHOKU', 'KANTO', 'CHUBU', 'KANSAI', 'KYUSHU', 'OKINAWA'];

// Busca a qué región corresponde una etiqueta del JSON, del tipo
// "TOHOKU (SENDAI)" o "KANSAI", comparando de forma laxa (sin acentos,
// sin mayúsculas) contra los códigos de región del dataset geográfico.
function regionKeyFor(label) {
    const n = norm(label);
    return MAP_REGION_KEYS.find((k) => n.includes(k.toLowerCase()));
}

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    };
}

function mixRgb(c1, c2, t) {
    return {
        r: Math.round(c1.r + (c2.r - c1.r) * t),
        g: Math.round(c1.g + (c2.g - c1.g) * t),
        b: Math.round(c1.b + (c2.b - c1.b) * t),
    };
}

function rgbToCss({ r, g, b }, alpha = 1) {
    return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

// Escala divergente CRITICO(rojo) -> INTERMEDIO(ambar) -> SEGURO(verde),
// igual a la semántica de color que ya usa la app para clasificaciones.
const MAP_SCALE_STOPS = [
    { t: 0, c: hexToRgb(COLORS.red) },
    { t: 0.5, c: hexToRgb(COLORS.amber) },
    { t: 1, c: hexToRgb(COLORS.green) },
];

function valueToColor(t) {
    const clamped = Math.max(0, Math.min(1, t));
    for (let i = 0; i < MAP_SCALE_STOPS.length - 1; i++) {
        const a = MAP_SCALE_STOPS[i];
        const b = MAP_SCALE_STOPS[i + 1];
        if (clamped >= a.t && clamped <= b.t) {
            const localT = (clamped - a.t) / (b.t - a.t || 1);
            return mixRgb(a.c, b.c, localT);
        }
    }
    return MAP_SCALE_STOPS[MAP_SCALE_STOPS.length - 1].c;
}

// Los puntos de data/regions-map.json ya vienen proyectados (lon/lat ->
// plano), así que sólo hace falta calcular la caja delimitadora una vez
// para poder encajar el archipiélago completo en el canvas disponible.
let mapBoundsCache = null;
function computeMapBounds(geo) {
    if (mapBoundsCache) return mapBoundsCache;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    geo.prefectures.forEach((pref) => {
        pref.rings.forEach((ring) => {
            ring.forEach(([x, y]) => {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            });
        });
    });
    mapBoundsCache = { minX, minY, maxX, maxY };
    return mapBoundsCache;
}

function drawMapUnavailable(ctx, w, h) {
    ctx.fillStyle = COLORS.red;
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CAPA CARTOGRAFICA NO DISPONIBLE — data/regions-map.json', w / 2, h / 2);
    ctx.textAlign = 'left';
}

function drawJapanMap(ctx, cw, ch, chart, hoverIndex, opts) {
    if (!REGION_GEO) {
        drawMapUnavailable(ctx, cw, ch);
        return [];
    }
    const activeLabels = opts && opts.activeLabels;
    const isLabelOn = (i) => !activeLabels || activeLabels.has(i);
    const scaleMax = chart.yMax || 100;
    const legendH = 30;
    const pad = { top: 6, right: 20, bottom: legendH + 14, left: 20 };
    const availW = cw - pad.left - pad.right;
    const availH = ch - pad.top - pad.bottom;

    const bounds = computeMapBounds(REGION_GEO);
    const mapW = bounds.maxX - bounds.minX;
    const mapH = bounds.maxY - bounds.minY;
    const scale = Math.max(0.001, Math.min(availW / mapW, availH / mapH));
    const offX = pad.left + (availW - mapW * scale) / 2 - bounds.minX * scale;
    const offY = pad.top + (availH - mapH * scale) / 2 - bounds.minY * scale;
    const tx = (x, y) => [x * scale + offX, y * scale + offY];

    // Por región: índice en chart.labels, valor y si está visible (filtro).
    const regionInfo = {};
    chart.labels.forEach((label, i) => {
        const key = regionKeyFor(label);
        if (!key) return;
        regionInfo[key] = {
            i,
            val: (chart.series[0] && chart.series[0].values[i]) || 0,
            on: isLabelOn(i),
        };
    });

    const hitRegions = [];
    const hoverPaths = []; // rings a resaltar en una segunda pasada (sin costo de shadow para el resto)

    REGION_GEO.prefectures.forEach((pref) => {
        const info = regionInfo[pref.region];
        if (!info) return;
        const rgb = valueToColor(info.val / scaleMax);
        const isHoverRegion = hoverIndex === info.i;

        pref.rings.forEach((ring) => {
            const pts = ring.map(([x, y]) => tx(x, y));

            ctx.beginPath();
            pts.forEach(([x, y], pi) => (pi === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
            ctx.closePath();

            ctx.globalAlpha = info.on ? 1 : 0.14;
            ctx.fillStyle = rgbToCss(rgb);
            ctx.fill();
            ctx.strokeStyle = 'rgba(3,5,3,0.55)';
            ctx.lineWidth = 0.75;
            ctx.stroke();
            ctx.globalAlpha = 1;

            if (isHoverRegion && info.on) hoverPaths.push(pts);

            const minX = Math.min(...pts.map((p) => p[0]));
            const maxX = Math.max(...pts.map((p) => p[0]));
            const minY = Math.min(...pts.map((p) => p[1]));
            hitRegions.push({
                type: 'poly',
                points: pts,
                tx: (minX + maxX) / 2,
                ty: minY,
                idx: info.i,
                label: `${chart.labels[info.i]}\n${info.val}/${scaleMax} · ${info.val >= scaleMax * 0.66 ? 'SEGURO' : info.val >= scaleMax * 0.33 ? 'RIESGO MODERADO' : 'CRITICO'}`,
            });
        });
    });

    // Resalte del hover: se redibuja SOLO la región activa, con glow, para
    // no pagar el costo de sombreado en las 47 prefecturas en cada frame.
    if (hoverPaths.length) {
        ctx.save();
        ctx.shadowColor = COLORS.ink;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 1.6;
        hoverPaths.forEach((pts) => {
            ctx.beginPath();
            pts.forEach(([x, y], pi) => (pi === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
            ctx.closePath();
            ctx.stroke();
        });
        ctx.restore();
    }

    // Rótulo de valor por región, anclado sobre la prefectura más grande
    // de cada una (precalculado en data/regions-map.json).
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    MAP_REGION_KEYS.forEach((key) => {
        const info = regionInfo[key];
        const anchor = REGION_GEO.regionLabels[key];
        if (!info || !anchor || !info.on) return;
        const [lx, ly] = tx(anchor[0], anchor[1]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(3,5,3,0.7)';
        ctx.strokeText(String(info.val), lx, ly);
        ctx.fillStyle = COLORS.paper;
        ctx.fillText(String(info.val), lx, ly);
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Barra de escala CRITICO -> SEGURO.
    const barX = pad.left;
    const barY = ch - legendH + 6;
    const barW = Math.min(220, cw - pad.left - pad.right);
    const steps = 40;
    for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const rgb = valueToColor(t0);
        ctx.fillStyle = rgbToCss(rgb);
        ctx.fillRect(barX + (barW / steps) * s, barY, barW / steps + 0.5, 8);
    }
    ctx.strokeStyle = 'rgba(244,244,240,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, 8);

    ctx.fillStyle = COLORS.greenDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`0 CRITICO`, barX, barY + 20);
    ctx.textAlign = 'right';
    ctx.fillText(`${scaleMax} SEGURO`, barX + barW, barY + 20);
    ctx.textAlign = 'left';

    return hitRegions;
}

function drawGroupedBarChart(ctx, cw, ch, chart) {
    const pad = { top: 16, right: 20, bottom: 30, left: 44 };
    const w = cw - pad.left - pad.right;
    const h = ch - pad.top - pad.bottom;
    const unitStr = chart.unit ? ` ${chart.unit}` : '';

    drawAxes(ctx, pad, w, h, chart.yMax, chart.yStep);

    const n = chart.labels.length;
    const groupSlot = w / n;
    const seriesCount = chart.series.length;
    const barGap = 4;
    const barW = (groupSlot * 0.68) / seriesCount;
    const hitRegions = [];
    const showValueLabels = barW >= 22;

    chart.labels.forEach((label, gi) => {
        const groupX = pad.left + groupSlot * gi + groupSlot * 0.16;
        chart.series.forEach((s, si) => {
            const val = s.values[gi];
            const barH = (val / chart.yMax) * h;
            const x = groupX + si * (barW + barGap);
            const y = pad.top + h - barH;

            ctx.fillStyle = s.color;
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 6;
            ctx.fillRect(x, y, barW, barH);
            ctx.shadowBlur = 0;

            if (showValueLabels) {
                ctx.fillStyle = COLORS.ink;
                ctx.font = '10px "JetBrains Mono", monospace';
                ctx.textAlign = 'center';
                ctx.fillText(String(val), x + barW / 2, y - 5);
            }

            hitRegions.push({
                type: 'rect', x, y, w: barW, h: barH,
                tx: x + barW / 2, ty: y,
                label: `${s.name} · ${label}\n${val}${unitStr}`,
            });
        });

        ctx.fillStyle = COLORS.text;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, groupX + (groupSlot * 0.68) / 2, pad.top + h + 18);
    });
    ctx.textAlign = 'left';
    return hitRegions;
}

function drawMultiLineChart(ctx, cw, ch, chart, hoverIndex) {
    const pad = { top: 16, right: 20, bottom: 30, left: 44 };
    const w = cw - pad.left - pad.right;
    const h = ch - pad.top - pad.bottom;
    const n = chart.labels.length;
    const xAt = (i) => (n > 1 ? pad.left + (w / (n - 1)) * i : pad.left + w / 2);
    const unitStr = chart.unit ? ` ${chart.unit}` : '';

    drawAxes(ctx, pad, w, h, chart.yMax, chart.yStep);

    const allPoints = chart.series.map((s) => s.values.map((val, i) => ({
        x: xAt(i),
        y: pad.top + h - (val / chart.yMax) * h,
        val,
    })));

    chart.series.forEach((s, si) => {
        const points = allPoints[si];

        ctx.beginPath();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 7;
        points.forEach((p, i) => {
            if (i === 0) { ctx.moveTo(p.x, p.y); return; }
            const prev = points[i - 1];
            const cx = (prev.x + p.x) / 2;
            ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;

        points.forEach((p) => {
            ctx.beginPath();
            ctx.fillStyle = s.color;
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 6;
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    });

    chart.series.forEach((s) => {
        const lastVal = s.values[s.values.length - 1];
        const x = pad.left + w;
        const y = pad.top + h - (lastVal / chart.yMax) * h;
        ctx.fillStyle = s.color;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(String(lastVal), x - 2, y - 7);
    });

    ctx.fillStyle = COLORS.greenDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    chart.labels.forEach((label, i) => {
        if (n > 12 && i % 2 !== 0) return;
        const x = xAt(i);
        ctx.fillText(label, x, pad.top + h + 16);
    });
    ctx.textAlign = 'left';

    if (hoverIndex !== null && hoverIndex !== undefined) {
        const hx = xAt(hoverIndex);
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(244,244,240,0.4)';
        ctx.lineWidth = 1;
        ctx.moveTo(hx, pad.top);
        ctx.lineTo(hx, pad.top + h);
        ctx.stroke();
        ctx.setLineDash([]);

        chart.series.forEach((s, si) => {
            const p = allPoints[si][hoverIndex];
            ctx.beginPath();
            ctx.strokeStyle = s.color;
            ctx.fillStyle = COLORS.paper;
            ctx.lineWidth = 2;
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 10;
            ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;
        });
    }

    const bandW = n > 1 ? w / (n - 1) : w;
    return chart.labels.map((label, i) => ({
        type: 'rect',
        x: xAt(i) - bandW / 2,
        y: pad.top,
        w: bandW,
        h,
        tx: xAt(i),
        ty: pad.top,
        idx: i,
        label: `${label}\n` + chart.series.map((s) => `${s.name}: ${s.values[i]}${unitStr}`).join('\n'),
    }));
}

function drawPieChart(ctx, cw, ch, chart, hoverIndex, opts) {
    const active = opts && opts.active;
    const isOn = (i) => !active || active.has(i);
    const cx = cw / 2;
    const cy = ch / 2;
    const outerR = Math.max(10, Math.min(cw, ch) / 2 - 24);
    const innerR = outerR * 0.55;
    const total = chart.slices.reduce((a, s) => a + s.value, 0);

    ctx.save();
    ctx.shadowColor = COLORS.green;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(51,255,119,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    const hitRegions = [];
    let startAngle = -Math.PI / 2;
    chart.slices.forEach((slice, si) => {
        const on = isOn(si);
        const angle = (slice.value / total) * Math.PI * 2;
        const endAngle = startAngle + angle;
        const midAngle = startAngle + angle / 2;

        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, endAngle);
        ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
        ctx.closePath();
        ctx.globalAlpha = on ? 1 : 0.14;
        ctx.fillStyle = slice.color;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.strokeStyle = COLORS.paper;
        ctx.lineWidth = 2;
        ctx.stroke();

        if (!on) {
            startAngle = endAngle;
            return;
        }

        const labelR = (outerR + innerR) / 2;
        const lx = cx + Math.cos(midAngle) * labelR;
        const ly = cy + Math.sin(midAngle) * labelR;
        ctx.fillStyle = COLORS.paper;
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${slice.value}%`, lx, ly);

        hitRegions.push({
            type: 'circle', x: lx, y: ly, r: Math.max(16, angle * labelR * 0.4),
            tx: lx, ty: ly,
            label: `${slice.label}\n${slice.value} de ${total} (${Math.round((slice.value / total) * 100)}%)`,
        });

        startAngle = endAngle;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(244,244,240,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return hitRegions;
}

// ---------- Arranque de la aplicación ----------

window.addEventListener('DOMContentLoaded', () => {
    const dataPromise = Promise.all([loadFilesData(), loadRegionGeoData()]);
    setupLogin();
    setupIndexFilters();
    runBootSequence(async () => {
        await dataPromise;
        showView('view-login');
        $('user-input').focus();
    });
});
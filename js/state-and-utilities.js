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


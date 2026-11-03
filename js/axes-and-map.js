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


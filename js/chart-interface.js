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


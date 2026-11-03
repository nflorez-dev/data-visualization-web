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
    $('pass-input').value = ''; $('login-error').textContent = '';
    showView('view-login');
    $('user-input').focus();
}


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


"use strict";
/* ============================================================
   SECURE VAULT — tutorial integrado
   Recorrido guiado sobre la propia interfaz: oscurece la pantalla,
   resalta un elemento real y explica qué hace y con qué tecla.

   · Se lanza solo la primera vez que alguien inicia sesión.
   · [F1] o [?] (o el botón "[F1] TUTORIAL" del pie) lo repiten,
     y es contextual: en el índice explica el índice, dentro de un
     archivo explica ese archivo (gráfico, texto o disquete).
   · Al terminar el recorrido del índice ofrece abrir un gráfico
     de ejemplo y continuar con los controles del gráfico.

   Para agregar o cambiar pasos edita indexSteps() / docSteps().
   Cada paso: { target, title, body, tip, place, actions }.
     target  selector CSS o función que devuelve un elemento.
             Sin target = paso centrado. Si el elemento no existe
             o está oculto, el paso se omite solo (así el mismo
             recorrido sirve para gráficos de barra, línea, torta...).
   ============================================================ */

const Tutorial = (() => {
    const SEEN_KEY = 'vault.tutorial.seen.v1';
    let S = null; // recorrido activo (null = ninguno)

    // ---------- utilidades ----------

    const q = (sel) => document.querySelector(sel);
    const isShown = (el) => !!el && el.getClientRects().length > 0;
    const kbd = (txt) => `<span class="tut-key">${txt}</span>`;
    const files = () => (typeof FILES !== 'undefined' ? FILES : []);
    const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(s) : String(s));

    function seenGet() {
        try { return window.localStorage.getItem(SEEN_KEY); } catch (e) { return null; }
    }
    function seenSet() {
        try { window.localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* modo privado: se ignora */ }
    }

    // ---------- datos para ejemplos (salen del JSON real) ----------

    // Un término que de verdad exista en algún gráfico desbloqueado.
    function exampleTerm() {
        const f = files().find((x) => x.chart && !isLocked(x));
        const first = f ? chartEntries(f.chart)[0] : null;
        return first && first.name ? String(first.name).toLowerCase() : 'informe';
    }

    // Dos términos del gráfico abierto, para el ejemplo de "separa con coma".
    function docExample() {
        const f = files().find((x) => x.id === activeDocId);
        if (!f || !f.chart) return '';
        const e = chartEntries(f.chart);
        if (f.chart.kind === 'pie') return e.slice(0, 2).map((x) => x.name).join(', ');
        const s = e.find((x) => x.role === 'SERIE');
        const l = e.find((x) => x.role !== 'SERIE');
        return [s, l].filter(Boolean).map((x) => x.name).join(', ');
    }

    // Gráfico que se abre como demo: preferimos barra/línea porque
    // muestran todos los controles (etiquetas del eje y escala).
    function demoFile() {
        const usable = files().filter((f) => f.chart && !isLocked(f));
        return usable.find((f) => f.chart.kind === 'bar' || f.chart.kind === 'line') || usable[0] || null;
    }

    // ---------- pasos ----------

    function indexSteps() {
        const kinds = [...new Set(files().filter((f) => f.chart).map((f) => f.chart.kind.toUpperCase()))];
        const tagList = (kinds.length ? kinds : ['BAR', 'LINE', 'PIE']).map((t) => `[${t}]`).join(' ');
        const example = esc(exampleTerm());
        const canDemo = !!demoFile();
        const who = esc(typeof currentUser !== 'undefined' ? currentUser : '');

        return [
            {
                title: `BIENVENIDO, ${who}`,
                body: `<p>Este recorrido dura <b>menos de un minuto</b> y te enseña a moverte por la terminal.</p>
                       <p>Avanza con ${kbd('→')} o ${kbd('ENTER')}, vuelve con ${kbd('←')} y sal cuando quieras con ${kbd('ESC')}.</p>`,
                tip: `Para repetirlo: ${kbd('F1')} o ${kbd('?')}`,
            },
            {
                target: '#view-index .bar-sub',
                title: 'SESION',
                body: `<p>Tu usuario, tu nivel de acceso y el tiempo que llevas conectado. El reloj de la esquina es el del sistema.</p>
                       <p>Cierra la sesión cuando quieras con ${kbd('F10')}.</p>`,
            },
            {
                target: '#file-table-body .file-row.selected',
                title: 'INDICE DE ARCHIVOS',
                body: `<p>Cada fila es un archivo. La fila resaltada es la <b>selección</b>: muévela con ${kbd('↑')} ${kbd('↓')} o haz clic.</p>
                       <p>${kbd('ENTER')} (o clic) abre el archivo.</p>
                       <p>La clasificación va por colores: <span class="cls-top">TOP SECRET</span>, <span class="cls-secret">SECRET</span> y <span class="cls-conf">CONFIDENTIAL</span>.</p>`,
            },
            {
                target: () => { const t = q('#file-table-body .tag-chart'); return t ? t.closest('tr') : null; },
                title: 'GRAFICOS INTERACTIVOS',
                body: `<p>Las etiquetas ${tagList} marcan archivos que contienen un <b>gráfico interactivo</b>. Sin etiqueta, es un documento de texto.</p>`,
            },
            {
                target: () => { const t = q('#file-table-body .tag-icon'); return t ? t.closest('tr') : null; },
                title: 'DISQUETE REQUERIDO',
                body: `<p>El icono <span class="tag-icon">⊞</span> indica un archivo <b>incompleto</b>: parte de su contenido está en un disquete.</p>
                       <p>Al abrirlo, pulsa <b>INSERTAR DISQUETE</b> y espera la lectura.</p>`,
                tip: 'Hasta insertarlo, la búsqueda no puede ver lo que hay dentro.',
            },
            {
                target: '#filter-bar .filter-row:first-child',
                title: 'BUSCAR',
                body: `<p>Pulsa ${kbd('/')} y escribe. Busca en nombre, ID, fecha, clasificación y <b>dentro de los gráficos</b> (series, categorías, títulos).</p>
                       <p>Ignora acentos y mayúsculas. Con varias palabras, deben aparecer <b>todas</b>. Prueba con <em>${example}</em>.</p>`,
                tip: `Escribiendo: ${kbd('↑')} ${kbd('↓')} navegan, ${kbd('ENTER')} abre, ${kbd('ESC')} borra.`,
                place: 'below',
            },
            {
                target: '#type-chips',
                title: 'FILTRO POR TIPO',
                body: `<p>Limita la lista a gráficos, a un tipo concreto o a documentos de texto.</p>
                       <p>Pulsa ${kbd('T')} para ir rotando entre opciones, o haz clic en el botón.</p>`,
            },
            {
                target: '#class-chips',
                title: 'FILTRO POR CLASIFICACION',
                body: `<p>Igual, pero por nivel de clasificación. Rótalo con ${kbd('C')}.</p>
                       <p>Los filtros se combinan con la búsqueda. Para quitarlos todos de golpe: ${kbd('X')} o ${kbd('ESC')}.</p>`,
                tip: 'El contador MOSTRANDO n/N te dice cuántos archivos quedan.',
            },
            {
                target: '#view-index .bar-footer',
                title: 'ATAJOS SIEMPRE A LA VISTA',
                body: `<p>El pie de pantalla resume todas las teclas disponibles. Cambia según dónde estés.</p>`,
                place: 'above',
            },
            {
                title: 'LISTO',
                body: canDemo
                    ? `<p>Ya conoces el índice. Falta lo mejor: los <b>gráficos interactivos</b>.</p>
                       <p>¿Abro uno de ejemplo para mostrarte sus controles?</p>`
                    : `<p>Ya conoces el índice. Abre cualquier archivo con ${kbd('ENTER')} para explorarlo.</p>`,
                actions: canDemo
                    ? [
                        { label: 'ABRIR GRAFICO →', primary: true, run: openChartDemo },
                        { label: 'TERMINAR', run: () => end() },
                    ]
                    : null,
            },
        ];
    }

    function docSteps() {
        const file = files().find((f) => f.id === activeDocId);
        const chart = file && file.chart ? file.chart : null;
        const isPie = !!chart && chart.kind === 'pie';
        const ex = esc(docExample());
        const item = isPie ? 'porción' : 'serie';

        return [
            {
                target: '#view-doc .doc-header',
                title: 'ARCHIVO ABIERTO',
                body: `<p>Arriba: el <b>ID</b> y nombre del archivo, y a la derecha su <b>clasificación</b>. La línea de abajo resume el contenido.</p>`,
                place: 'below',
            },
            {
                target: '#doc-content .floppy-prompt',
                title: 'DISQUETE REQUERIDO',
                body: `<p>Este archivo está incompleto: parte de su contenido vive en un disquete.</p>
                       <p>Pulsa <b>INSERTAR DISQUETE</b> y espera a que termine la lectura. Después el archivo queda desbloqueado.</p>`,
                place: 'below',
            },
            {
                target: '#doc-content .doc-text',
                title: 'DOCUMENTO DE TEXTO',
                body: `<p>Este archivo es de solo lectura: todo su contenido está en pantalla.</p>`,
                place: 'below',
            },
            {
                target: '#doc-content .chart-filters .filter-row:first-child',
                title: 'FILTRAR EL GRAFICO',
                body: `<p>Pulsa ${kbd('/')} y escribe una <b>${item}</b>${isPie ? '' : ' o una etiqueta del eje'}. El gráfico se recorta al instante.</p>
                       <p>Puedes poner varios términos separados por <b>coma</b>${ex ? `: prueba con <em>${ex}</em>` : ''}.</p>`,
                tip: `Sin acentos ni mayúsculas. ${kbd('ESC')} borra el texto; ${kbd('ENTER')} devuelve el foco.`,
                place: 'below',
            },
            {
                target: '#doc-content .chart-filters .filter-row:nth-child(2)',
                title: chart && chart.kind === 'line' ? 'PUNTOS DEL EJE' : 'CATEGORIAS DEL EJE',
                body: `<p>Cada botón es un valor del eje horizontal. Clic para <b>ocultarlo</b> (queda tachado) o volver a mostrarlo.</p>`,
                place: 'below',
            },
            {
                target: '#doc-content .chart-fit',
                title: 'ESCALA',
                body: `<p><b>AJUSTADA</b> re-escala el eje vertical a lo que dejaste visible, para ver el detalle.</p>
                       <p><b>ORIGINAL</b> mantiene la escala completa, útil para comparar contra el total.</p>`,
                place: 'below',
            },
            {
                target: '#doc-content .chart-legend',
                title: 'LA LEYENDA TAMBIEN FILTRA',
                body: `<p>Haz clic en un elemento de la leyenda para <b>ocultar o mostrar</b> esa ${item}. Con el teclado: ${kbd('TAB')} para llegar y ${kbd('ENTER')} para alternar.</p>`,
                place: 'above',
            },
            {
                target: '#doc-content .chart-stage',
                title: 'VALORES EXACTOS',
                body: `<p>Pasa el cursor sobre el gráfico para ver el <b>valor exacto</b> en un cuadro flotante.</p>
                       ${chart && chart.kind === 'line' ? '<p>En las líneas aparece además una guía vertical que compara todas las series en ese punto.</p>' : ''}`,
            },
            {
                target: '#view-doc .bar-footer',
                title: 'VOLVER',
                body: `<p>${kbd('ESC')} regresa al índice de archivos.</p>
                       ${chart ? `<p>Truco: si buscas en el índice algo que está <em>dentro</em> de un gráfico, este se abre ya filtrado. Pulsa <b>LIMPIAR</b> para verlo entero.</p>` : ''}`,
                place: 'above',
            },
        ];
    }

    // ---------- motor ----------

    function resolveTarget(step) {
        if (!step.target) return { ok: true, el: null };
        const el = typeof step.target === 'function' ? step.target() : q(step.target);
        return isShown(el) ? { ok: true, el } : { ok: false, el: null };
    }

    function start(rawSteps) {
        end(true);
        const view = q('.view.view-active');
        if (!view) return false;

        // Solo entran los pasos cuyo elemento existe ahora mismo.
        const steps = rawSteps.filter((s) => resolveTarget(s).ok);
        if (!steps.length) return false;

        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        seenSet();

        const overlay = document.createElement('div');
        overlay.className = 'tut-overlay';
        overlay.innerHTML =
            '<div class="tut-spot tut-spot-none"></div>' +
            '<div class="tut-panel" role="dialog" aria-modal="true" aria-label="Tutorial" tabindex="-1"></div>';
        view.appendChild(overlay);

        S = {
            steps, i: 0, view, overlay, acts: [], target: null,
            spot: overlay.querySelector('.tut-spot'),
            panel: overlay.querySelector('.tut-panel'),
        };
        S.panel.addEventListener('click', onPanelClick);
        window.addEventListener('resize', onResize);
        go(0);
        return true;
    }

    // silent = true: cierra sin efectos (cambio de recorrido, cierre de sesión).
    // Si el recorrido abrió un archivo de ejemplo, al terminar vuelve al índice.
    function end(silent) {
        if (!S) return;
        const closeDoc = S.closeDocOnEnd;
        window.removeEventListener('resize', onResize);
        S.overlay.remove();
        S = null;
        if (!silent && closeDoc && typeof activeDocId !== 'undefined' && activeDocId) closeDocument();
    }

    function go(i) {
        S.i = i;
        const step = S.steps[i];
        const { el } = resolveTarget(step);
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        S.target = el;
        render(step);
        place(step);
        S.panel.focus({ preventScroll: true });
    }

    function next() { if (S.i < S.steps.length - 1) go(S.i + 1); else end(); }
    function prev() { if (S.i > 0) go(S.i - 1); }

    // Lo que hacen ENTER / → : ejecutar la acción principal del paso.
    function advance() {
        const main = S.acts.find((a) => a.primary && !a.disabled);
        if (main) main.run();
    }

    function render(step) {
        const last = S.i === S.steps.length - 1;
        const pips = S.steps.map((_, n) => (n <= S.i ? '■' : '□')).join('');

        const acts = [{ label: '← ATRAS', run: prev, disabled: S.i === 0 }];
        (step.actions || [{ label: last ? 'FINALIZAR' : 'SIGUIENTE →', primary: true, run: last ? () => end() : next }])
            .forEach((a) => acts.push(a));
        if (!last) acts.push({ label: 'SALTAR [ESC]', run: () => end(), skip: true });
        S.acts = acts;

        S.panel.innerHTML = `
          <div class="tut-top"><span>TUTORIAL · PASO ${S.i + 1}/${S.steps.length}</span><span class="tut-pips" aria-hidden="true">${pips}</span></div>
          <h2 class="tut-title">${step.title}</h2>
          <div class="tut-body">${step.body}</div>
          ${step.tip ? `<div class="tut-tip">${step.tip}</div>` : ''}
          <div class="tut-actions">${acts.map((a, n) =>
            `<button type="button" class="tut-btn${a.primary ? ' primary' : ''}${a.skip ? ' tut-skip' : ''}" data-act="${n}"${a.disabled ? ' disabled' : ''}>${a.label}</button>`
          ).join('')}</div>`;
    }

    // Coloca el foco sobre el objetivo y el panel en el mejor hueco libre.
    function place(step) {
        const { view, spot, panel, target } = S;
        const vr = view.getBoundingClientRect();
        const W = vr.width, H = vr.height, G = 12, P = 4;
        const pw = panel.offsetWidth, ph = panel.offsetHeight;
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
        let left, top;

        if (!target) {
            // Paso centrado: el "foco" mide 0 y todo queda atenuado.
            spot.classList.add('tut-spot-none');
            Object.assign(spot.style, { left: `${W / 2}px`, top: `${H / 2}px`, width: '0px', height: '0px' });
            left = (W - pw) / 2;
            top = (H - ph) / 2;
        } else {
            const tr = target.getBoundingClientRect();
            const tx = tr.left - vr.left - P;
            const ty = tr.top - vr.top - P;
            const tw = tr.width + P * 2;
            const th = tr.height + P * 2;
            spot.classList.remove('tut-spot-none');
            Object.assign(spot.style, { left: `${tx}px`, top: `${ty}px`, width: `${tw}px`, height: `${th}px` });

            const below = H - (ty + th) - G;
            const above = ty - G;
            const right = W - (tx + tw) - G;
            const preferAbove = step && step.place === 'above';
            left = clamp(tx + tw / 2 - pw / 2, G, W - pw - G);

            if (!preferAbove && below >= ph) top = ty + th + G;
            else if (above >= ph) top = ty - ph - G;
            else if (below >= ph) top = ty + th + G;
            else if (right >= pw) { left = tx + tw + G; top = clamp(ty, G, H - ph - G); }
            else { left = W - pw - G; top = H - ph - G; } // objetivo enorme: el panel va en su esquina
        }
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(top)}px`;
    }

    function onResize() { if (S) place(S.steps[S.i]); }

    function onPanelClick(ev) {
        const b = ev.target.closest('[data-act]');
        if (!b || b.disabled || !S) return;
        const act = S.acts[Number(b.dataset.act)];
        if (act) act.run();
    }

    // ---------- encadenado: del índice a un gráfico de ejemplo ----------

    function openChartDemo() {
        const f = demoFile();
        end(true);
        if (!f) return;
        clearIndexFilters();          // que la búsqueda no recorte el gráfico de ejemplo
        openFile(f.id);
        if (start(docSteps())) S.closeDocOnEnd = true;
    }

    // ---------- teclado ----------

    function onKeydown(ev) {
        // Con el tutorial abierto, las teclas son del tutorial (fase de captura,
        // para que el índice y los campos no reaccionen por debajo).
        if (S) {
            if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
            if (/^F\d+$/.test(ev.key) && ev.key !== 'F1' && ev.key !== 'F10') return; // F5, F12...: pasan
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.repeat) return;
            if (ev.key === 'ArrowRight' || ev.key === 'Enter' || ev.key === 'PageDown') advance();
            else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') prev();
            else if (ev.key === 'Escape') end();
            return;
        }

        const typing = ev.target && ev.target.tagName === 'INPUT';
        const isTrigger = ev.key === 'F1' || (ev.key === '?' && !typing);
        if (!isTrigger || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        if (!q('#view-index.view-active') && !q('#view-doc.view-active')) return;
        ev.preventDefault();
        startContextual();
    }

    window.addEventListener('keydown', onKeydown, true);

    document.addEventListener('click', (ev) => {
        const btn = ev.target.closest && ev.target.closest('[data-tutorial]');
        if (!btn) return;
        ev.preventDefault();
        startContextual();
    });

    // ---------- API pública ----------

    function startContextual() {
        if (q('#view-doc.view-active')) return start(docSteps());
        if (q('#view-index.view-active')) return start(indexSteps());
        return false;
    }

    // Primera sesión: lanza el recorrido solo, una vez.
    function maybeAutoStart() {
        if (seenGet()) return;
        window.setTimeout(() => {
            if (S || !q('#view-index.view-active')) return;
            start(indexSteps());
        }, 500);
    }

    const api = { maybeAutoStart, startContextual, isOpen: () => !!S, end: () => end(true) };
    window.Tutorial = api;
    return api;
})();
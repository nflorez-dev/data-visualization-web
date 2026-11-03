
// ---------- Login ----------

function setupLogin() {
    const form = $('login-form');
    const errorEl = $('login-error');

    form.addEventListener('submit', (ev) => {
        ev.preventDefault();

        const user = $('user-input').value.trim().toUpperCase();
        const pass = $('pass-input').value;

        const isValid =
            Object.prototype.hasOwnProperty.call(VALID_CREDENTIALS, user) &&
            VALID_CREDENTIALS[user] === pass;

        if (isValid) {
            currentUser = user;
            errorEl.textContent = '';
            enterIndex();
        } else {
            errorEl.textContent =
                'ACCESO DENEGADO — CREDENCIALES NO VALIDAS. INTENTO REGISTRADO.';
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

    if (window.Tutorial) {
        window.Tutorial.maybeAutoStart();
    }
}

function renderDataError(err) {
    const body = $('file-table-body');

    body.innerHTML = `
        <tr>
            <td colspan="5" class="data-error">
                ⚠ ERROR AL LEER data/files.json —
                ${err?.message || 'error desconocido'}<br/>
                Revisa que el archivo tenga JSON válido
                (sin comas finales, comillas correctas).
                Si abriste index.html con doble clic, usa un servidor local
                (por ejemplo <code>python3 -m http.server</code>)
                en vez de file://.
            </td>
        </tr>
    `;
}

function tickClock() {
    const now = new Date();

    $('clock').textContent =
        `1996-11-30 ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
}

function tickSession() {
    if (!sessionStartTime) return;

    const secs = Math.floor((Date.now() - sessionStartTime) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;

    $('session-timer').textContent =
        `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

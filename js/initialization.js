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
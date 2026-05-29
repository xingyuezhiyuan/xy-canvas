(function(){
    const KEY = 'studio_theme';
    const LEGACY_KEY = 'canvas_theme';

    function currentTheme(){
        return localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || 'dark';
    }

    function applyTheme(theme){
        const next = theme === 'dark' ? 'dark' : 'light';
        const dark = next === 'dark';
        document.documentElement.classList.toggle('studio-theme-dark', dark);
        if(document.body){
            document.body.classList.toggle('studio-theme-dark', dark);
            document.body.classList.toggle('theme-dark', dark);
        }
        window.dispatchEvent(new CustomEvent('studio-theme-change', { detail: { theme: next } }));
    }

    window.StudioTheme = {
        key: KEY,
        get: currentTheme,
        apply: applyTheme,
        set(theme){
            const next = theme === 'dark' ? 'dark' : 'light';
            localStorage.setItem(KEY, next);
            localStorage.setItem(LEGACY_KEY, next);
            applyTheme(next);
        }
    };

    applyTheme(currentTheme());

    document.addEventListener('DOMContentLoaded', () => applyTheme(currentTheme()));
    window.addEventListener('message', event => {
        if(event.data?.type === 'studio-theme') applyTheme(event.data.theme);
    });
    window.addEventListener('storage', event => {
        if(event.key === KEY || event.key === LEGACY_KEY) applyTheme(currentTheme());
    });
})();

/* AniTrack — alternância cíclica de temas */
(() => {
    "use strict";

    const button = document.getElementById("themeCycleButton");
    const themeName = document.getElementById("themeCycleName");
    if (!button || !themeName) return;

    const STORAGE_KEY = "anitrack-theme";
    const themes = [
        { id: "original", label: "Original — AniTrack", color: "#111426" },
        { id: "maomao", label: "MaoMao — Botânica", color: "#203c35" },
        { id: "gentildonna", label: "Gentildonna — Imperial", color: "#351827" }
    ];

    function applyTheme(themeId) {
        const selected = themes.find(theme => theme.id === themeId) || themes[0];

        if (selected.id === "original") {
            delete document.body.dataset.theme;
        } else {
            document.body.dataset.theme = selected.id;
        }

        themeName.textContent = selected.label;
        button.setAttribute("aria-label", `Tema atual: ${selected.label}. Clique para trocar de tema.`);
        button.title = `Tema atual: ${selected.label} — clique para trocar`;

        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) metaTheme.setAttribute("content", selected.color);

        try {
            localStorage.setItem(STORAGE_KEY, selected.id);
        } catch (error) {
            console.warn("AniTrack: não foi possível salvar a preferência de tema.", error);
        }
    }

    let savedTheme = "original";
    try {
        savedTheme = localStorage.getItem(STORAGE_KEY) || "original";
    } catch (error) {
        console.warn("AniTrack: não foi possível recuperar a preferência de tema.", error);
    }

    applyTheme(savedTheme);

    button.addEventListener("click", () => {
        const currentIndex = themes.findIndex(theme => theme.id === document.body.dataset.theme || (theme.id === "original" && !document.body.dataset.theme));
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        applyTheme(nextTheme.id);
    });
})();

/* AniTrack — alternância de temas */
(() => {
    "use strict";

    const select = document.getElementById("themeSelect");
    if (!select) return;

    const STORAGE_KEY = "anitrack-theme";
    const validThemes = ["original", "maomao", "gentildonna"];

    function applyTheme(theme) {
        const selectedTheme = validThemes.includes(theme) ? theme : "original";

        if (selectedTheme === "original") {
            delete document.body.dataset.theme;
        } else {
            document.body.dataset.theme = selectedTheme;
        }
        select.value = selectedTheme;

        // Atualiza a cor da barra do navegador em dispositivos compatíveis.
        const themeColor = selectedTheme === "gentildonna"
            ? "#351827"
            : selectedTheme === "maomao"
                ? "#203c35"
                : "#111426";
        let metaTheme = document.querySelector('meta[name="theme-color"]');

        if (metaTheme) {
            metaTheme.setAttribute("content", themeColor);
        }

        try {
            localStorage.setItem(STORAGE_KEY, selectedTheme);
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

    select.addEventListener("change", () => {
        applyTheme(select.value);
    });
})();

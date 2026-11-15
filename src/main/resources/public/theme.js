/* AniTrack — alternância de temas */
(() => {
    "use strict";

    const select = document.getElementById("themeSelect");
    if (!select) return;

    const STORAGE_KEY = "anitrack-theme";
    const validThemes = ["maomao", "gentildonna"];

    function applyTheme(theme) {
        const selectedTheme = validThemes.includes(theme) ? theme : "maomao";

        document.body.dataset.theme = selectedTheme;
        select.value = selectedTheme;

        // Atualiza a cor da barra do navegador em dispositivos compatíveis.
        const themeColor = selectedTheme === "gentildonna" ? "#351827" : "#203c35";
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

    let savedTheme = "maomao";
    try {
        savedTheme = localStorage.getItem(STORAGE_KEY) || "maomao";
    } catch (error) {
        console.warn("AniTrack: não foi possível recuperar a preferência de tema.", error);
    }

    applyTheme(savedTheme);

    select.addEventListener("change", () => {
        applyTheme(select.value);
    });
})();

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

    async function loadAccountTheme() {
        const client = window.supabaseClient;
        if (!client) return;
        try {
            const { data: sessionData } = await client.auth.getSession();
            const user = sessionData?.session?.user;
            if (!user) return;
            const { data, error } = await client
                .from("profiles")
                .select("preferred_theme")
                .eq("id", user.id)
                .maybeSingle();
            if (error) throw error;
            if (data?.preferred_theme && themes.some(theme => theme.id === data.preferred_theme)) {
                applyTheme(data.preferred_theme);
            }
        } catch (error) {
            console.warn("AniTrack: não foi possível carregar o tema da conta.", error);
        }
    }

    loadAccountTheme();

    button.addEventListener("click", async () => {
        const currentIndex = themes.findIndex(theme => theme.id === document.body.dataset.theme || (theme.id === "original" && !document.body.dataset.theme));
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        applyTheme(nextTheme.id);

        const client = window.supabaseClient;
        if (!client) return;
        try {
            const { data: sessionData } = await client.auth.getSession();
            const user = sessionData?.session?.user;
            if (!user) return;
            const { error } = await client
                .from("profiles")
                .update({ preferred_theme: nextTheme.id })
                .eq("id", user.id);
            if (error) throw error;
        } catch (error) {
            console.warn("AniTrack: tema aplicado localmente, mas não foi possível sincronizá-lo com a conta.", error);
        }
    });
})();

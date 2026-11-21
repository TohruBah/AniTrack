(() => {
    "use strict";

    const view = document.querySelector("#discoveriesView");
    if (!view) return;

    const catalogView = document.querySelector("#catalogView");
    const statisticsView = document.querySelector("#statisticsView");
    const addAnimeView = document.querySelector("#addAnimeView");
    const profileView = document.querySelector("#profileView");
    const grid = document.querySelector("#discoveriesGrid");
    const status = document.querySelector("#discoveriesStatus");
    const heading = document.querySelector("#discoveriesHeading");
    const resultCount = document.querySelector("#discoveriesResultCount");
    const search = document.querySelector("#discoveriesSearch");
    const genreSelect = document.querySelector("#discoveriesGenre");
    const tabs = [...document.querySelectorAll("[data-discovery-category]")];

    const API = "https://kitsu.io/api/edge";
    const labels = {
        trending: "Animes em alta",
        popular: "Animes populares",
        "top-rated": "Mais bem avaliados",
        recent: "Lançamentos recentes"
    };
    let category = "trending";
    let allAnime = [];
    let requestNumber = 0;
    let searchTimer = null;

    function setActiveNav() {
        document.querySelectorAll(".nav-item").forEach(item => {
            item.classList.toggle("active", item.dataset.view === "discoveries");
        });
    }

    function showDiscoveries() {
        document.querySelectorAll(".main-content .page-view").forEach(section => {
            section.hidden = section !== view;
        });
        setActiveNav();
        window.scrollTo({ top: 0, behavior: "smooth" });
        if (!allAnime.length) loadCategory();
    }

    // Captura antes do handler geral do catálogo para manter a nova tela isolada.
    document.addEventListener("click", event => {
        const button = event.target.closest('.nav-item[data-view="discoveries"]');
        if (!button) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        showDiscoveries();
    }, true);

    function requestUrl(params) {
        const query = new URLSearchParams(params);
        return `${API}/anime?${query.toString()}`;
    }

    async function fetchAnime(params) {
        const response = await fetch(requestUrl(params), {
            headers: { Accept: "application/vnd.api+json" }
        });
        if (!response.ok) throw new Error(`O serviço de recomendações respondeu com o status ${response.status}.`);
        const payload = await response.json();
        const included = new Map((payload.included || []).map(item => [`${item.type}:${item.id}`, item]));
        return (payload.data || []).map(item => {
            const rel = item.relationships?.genres?.data || [];
            const genres = rel.map(ref => included.get(`${ref.type}:${ref.id}`)?.attributes?.name).filter(Boolean);
            return { id: item.id, ...item.attributes, genres };
        });
    }

    function paramsForCategory() {
        const common = { "page[limit]": "20", "include": "genres" };
        if (category === "trending") {
            return { ...common, sort: "popularityRank" };
        }
        if (category === "popular") {
            return { ...common, sort: "-userCount" };
        }
        if (category === "top-rated") {
            return { ...common, sort: "-averageRating" };
        }
        return { ...common, sort: "-startDate" };
    }

    function formatYear(date) {
        if (!date) return "Ano não informado";
        const year = String(date).slice(0, 4);
        return /^\d{4}$/.test(year) ? year : "Ano não informado";
    }

    function safeText(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[char]);
    }

    function render() {
        const term = search.value.trim().toLocaleLowerCase("pt-BR");
        const selectedGenre = genreSelect.value;
        const filtered = allAnime.filter(anime => {
            const title = anime.canonicalTitle || Object.values(anime.titles || {})[0] || "Anime sem título";
            const matchesTerm = !term || title.toLocaleLowerCase("pt-BR").includes(term)
                || Object.values(anime.titles || {}).some(name => String(name).toLocaleLowerCase("pt-BR").includes(term));
            const matchesGenre = !selectedGenre || anime.genres.includes(selectedGenre);
            return matchesTerm && matchesGenre;
        });

        resultCount.textContent = `${filtered.length} resultado(s)`;
        grid.replaceChildren();
        status.hidden = filtered.length > 0;
        status.classList.remove("is-error");
        status.textContent = allAnime.length ? "Nenhum anime encontrado com esses filtros." : "";

        filtered.forEach(anime => {
            const title = anime.canonicalTitle || Object.values(anime.titles || {})[0] || "Anime sem título";
            const poster = anime.posterImage?.large || anime.posterImage?.medium || anime.posterImage?.original || "";
            const rating = Number(anime.averageRating);
            const ratingText = Number.isFinite(rating) ? `${(rating / 10).toFixed(1)} ★` : "Sem nota";
            const genres = anime.genres.slice(0, 3).join(" · ");
            const card = document.createElement("article");
            card.className = "discovery-card";
            card.dataset.animeDetail = "true";
            card.dataset.animeTitle = title;
            card.dataset.animePoster = poster;
            card.dataset.animeFormat = anime.subtype || "Anime";
            card.tabIndex = 0;
            card.setAttribute("role", "button");
            card.setAttribute("aria-label", `Ver detalhes de ${title}`);
            card.innerHTML = `
                <div class="discovery-poster-wrap">
                    ${poster ? `<img class="discovery-poster" src="${safeText(poster)}" alt="Capa de ${safeText(title)}" loading="lazy">` : '<div class="discovery-poster"></div>'}
                    <span class="discovery-rating">${safeText(ratingText)}</span>
                </div>
                <div class="discovery-card-body">
                    <h3 class="discovery-card-title" title="${safeText(title)}">${safeText(title)}</h3>
                    <div class="discovery-card-meta"><span>${safeText(anime.subtype || "Anime")}</span><span>•</span><span>${safeText(formatYear(anime.startDate))}</span></div>
                    ${genres ? `<div class="discovery-card-genres">${safeText(genres)}</div>` : ""}
                </div>`;
            grid.append(card);
        });
    }

    function populateGenres() {
        const genres = [...new Set(allAnime.flatMap(anime => anime.genres))].sort((a, b) => a.localeCompare(b, "pt-BR"));
        const selected = genreSelect.value;
        genreSelect.replaceChildren(new Option("Todos os gêneros", ""));
        genres.forEach(genre => genreSelect.add(new Option(genre, genre)));
        if (genres.includes(selected)) genreSelect.value = selected;
    }

    async function loadCategory() {
        const thisRequest = ++requestNumber;
        heading.textContent = labels[category];
        status.hidden = false;
        status.classList.remove("is-error");
        status.textContent = "Carregando recomendações...";
        grid.replaceChildren();
        resultCount.textContent = "";
        try {
            const result = await fetchAnime(paramsForCategory());
            if (thisRequest !== requestNumber) return;
            allAnime = result;
            populateGenres();
            render();
        } catch (error) {
            if (thisRequest !== requestNumber) return;
            allAnime = [];
            status.hidden = false;
            status.classList.add("is-error");
            status.textContent = `Não foi possível carregar os animes. ${error.message} Tente novamente em instantes.`;
            resultCount.textContent = "";
            console.error("AniTrack — Central de descobertas:", error);
        }
    }

    tabs.forEach(tab => tab.addEventListener("click", () => {
        category = tab.dataset.discoveryCategory;
        tabs.forEach(item => {
            const active = item === tab;
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-selected", String(active));
        });
        genreSelect.value = "";
        search.value = "";
        loadCategory();
    }));

    search.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(render, 180);
    });
    genreSelect.addEventListener("change", render);

})();

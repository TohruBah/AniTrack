
(() => {
    const supabase = window.supabaseClient;

    // Elementos principais
    const form = document.querySelector("#form");
    const list = document.querySelector("#list");
    const message = document.querySelector("#message");
    const animeSearchInput = document.querySelector("#animeSearchInput");
    const animeSuggestions = document.querySelector("#animeSuggestions");
    const selectedAnimePreview = document.querySelector("#selectedAnimePreview");
    const totalEpisodesField = document.querySelector("#totalEpisodesField");
    const totalEpisodesDisplay = document.querySelector("#totalEpisodesDisplay");

    const catalogView = document.querySelector("#catalogView");
    const addAnimeView = document.querySelector("#addAnimeView");

    const addAnimeButton = document.querySelector("#addAnimeButton");
    const backToCatalog = document.querySelector("#backToCatalog");

    const search = document.querySelector("#catalogSearch");
    const statsContainer = document.querySelector("#stats");
    const statisticsView = document.querySelector("#statisticsView");

    if (!supabase || !form || !list || !message) {
        console.error("AniTrack: elementos ou conexão com Supabase não encontrados.");
        return;
    }

    if (!catalogView || !addAnimeView || !statisticsView || !statsContainer || !search
        || !animeSearchInput || !animeSuggestions || !selectedAnimePreview
        || !totalEpisodesField || !totalEpisodesDisplay) {
        console.error("AniTrack: elementos de navegação não encontrados.");
        return;
    }

    let currentUserId = null;
    let editingId = null;
    let animes = [];
    let libraryFilter = "all";
    let selectedAnime = null;
    let libraryView = "grid";
    const librarySort = document.querySelector("#librarySort");
    const filterStatus = document.querySelector("#filterStatus");
    const filterGenre = document.querySelector("#filterGenre");
    const filterFormat = document.querySelector("#filterFormat");
    const filterRating = document.querySelector("#filterRating");
    const filterPanel = document.querySelector("#libraryFilterPanel");
    const filterToggle = document.querySelector("#toggleLibraryFilters");
    const filterCount = document.querySelector("#activeFilterCount");
    const listView = document.querySelector("#list");
    let suggestionTimer = null;
    let suggestionRequestId = 0;
    let isSaving = false;

    const coverCache = new Map();

    // Capa substituta
    const fallbackCover = "data:image/svg+xml," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="160" height="220">
            <rect width="100%" height="100%" fill="#24213d"/>
            <text x="50%" y="48%" text-anchor="middle"
                fill="#c8b4f0" font-size="42">✧</text>
            <text x="50%" y="65%" text-anchor="middle"
                fill="#a9a3c9" font-size="12">AniTrack</text>
        </svg>
    `);

    // Botões do formulário
    const submitButton = form.querySelector('button[type="submit"]');

    // Seletor visual de status: mantém o <select> original como fonte do valor enviado.
    const statusSelect = form.elements.status;
    const statusPicker = form.querySelector("[data-status-picker]");
    const statusTrigger = statusPicker?.querySelector(".status-picker-trigger");
    const statusMenu = statusPicker?.querySelector(".status-picker-menu");
    const statusLabel = statusPicker?.querySelector(".status-picker-label");

    function syncStatusPicker() {
        if (!statusSelect || !statusPicker) return;
        const current = statusSelect.value || "Planejado";
        statusLabel.textContent = current;
        statusPicker.dataset.status = current.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        statusPicker.querySelectorAll(".status-option").forEach(option => {
            const selected = option.dataset.value === current;
            option.setAttribute("aria-selected", String(selected));
            option.classList.toggle("is-selected", selected);
        });
    }

    function closeStatusPicker() {
        if (!statusMenu || !statusTrigger) return;
        statusMenu.hidden = true;
        statusTrigger.setAttribute("aria-expanded", "false");
    }

    if (statusPicker && statusSelect && statusTrigger && statusMenu) {
        statusTrigger.addEventListener("click", () => {
            const opening = statusMenu.hidden;
            statusMenu.hidden = !opening;
            statusTrigger.setAttribute("aria-expanded", String(opening));
        });
        statusMenu.querySelectorAll(".status-option").forEach(option => {
            option.addEventListener("click", () => {
                statusSelect.value = option.dataset.value;
                statusSelect.dispatchEvent(new Event("change", { bubbles: true }));
                syncStatusPicker();
                closeStatusPicker();
            });
        });
        document.addEventListener("click", event => {
            if (!statusPicker.contains(event.target)) closeStatusPicker();
        });
        statusSelect.addEventListener("change", syncStatusPicker);
        syncStatusPicker();
    }

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "secondary-button";
    cancelButton.textContent = "Cancelar edição";
    cancelButton.hidden = true;

    submitButton.insertAdjacentElement("afterend", cancelButton);
    submitButton.disabled = true;

    // Mensagens
    function showMessage(text, isError = false) {
        message.textContent = text;
        message.style.color = isError ? "#f3a4b8" : "";
    }

    // Navegação entre telas
    
function openCatalog() {
    catalogView.hidden = false;
    statisticsView.hidden = true;
    addAnimeView.hidden = true;

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function openStatistics() {
    catalogView.hidden = true;
    statisticsView.hidden = false;
    addAnimeView.hidden = true;

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function openAddScreen() {
    catalogView.hidden = true;
    statisticsView.hidden = true;
    addAnimeView.hidden = false;

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (!editingId) {
        showMessage("");
    }
}


    addAnimeButton.addEventListener("click", () => {
        cancelEditing();
        form.reset();
        syncStatusPicker();
        animeSearchInput.value = "";
        clearAnimeSelection();
        closeAnimeSuggestions();
        openAddScreen();
    });

    backToCatalog.addEventListener("click", () => {
        if (editingId !== null) {
            cancelEditing();
        }

        openCatalog();
    });

    // Normalização de títulos
    function normalizeTitle(title) {
        return title.normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
    }

    // Buscar capas na Kitsu
    async function findAnimeCover(title) {
        const key = normalizeTitle(title);

        if (coverCache.has(key)) {
            return coverCache.get(key);
        }

        const request = (async () => {
            try {
                const url =
                    `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=10`;

                const response = await fetch(url, {
                    headers: {
                        Accept: "application/vnd.api+json"
                    }
                });

                if (!response.ok) return null;

                const result = await response.json();
                const wanted = normalizeTitle(title);

                const match = (result.data || []).find(anime => {
                    const attributes = anime.attributes;
                    const titles = attributes.titles || {};

                    const possibleTitles = [
                        attributes.canonicalTitle,
                        ...Object.values(titles)
                    ].filter(Boolean);

                    return possibleTitles.some(name => {
                        const normalized = normalizeTitle(name);

                        return normalized === wanted
                            || normalized.includes(wanted)
                            || wanted.includes(normalized);
                    });
                });

                if (!match) return null;

                const poster = match.attributes.posterImage;

                return poster?.medium
                    || poster?.small
                    || poster?.large
                    || poster?.original
                    || null;

            } catch (error) {
                console.error("Erro ao buscar capa:", error);
                return null;
            }
        })();

        coverCache.set(key, request);
        return request;
    }

    async function loadCover(title, image) {
        const cover = await findAnimeCover(title);

        if (cover && image.isConnected) {
            image.src = cover;
        }
    }

    // Exibe o total informado pelo Kitsu sem permitir edição manual.
    function displayTotalEpisodes(count) {
        const validCount = Number.isInteger(count) && count > 0 ? count : null;
        form.elements.totalEpisodes.value = validCount ?? "";
        totalEpisodesField.hidden = false;
        totalEpisodesDisplay.textContent = validCount
            ? `${validCount} episódios`
            : "Quantidade de episódios não informada pelo Kitsu";
    }

    // Busca de sugestões Kitsu para selecionar uma obra válida.
    function clearAnimeSelection() {
        selectedAnime = null;
        form.elements.title.value = "";
        form.elements.totalEpisodes.value = "";
        totalEpisodesField.hidden = true;
        totalEpisodesDisplay.textContent = "Selecione um anime para consultar os episódios.";
        selectedAnimePreview.hidden = true;
        selectedAnimePreview.replaceChildren();
        submitButton.disabled = true;
    }

    function closeAnimeSuggestions() {
        animeSuggestions.hidden = true;
        animeSuggestions.replaceChildren();
        animeSearchInput.setAttribute("aria-expanded", "false");
    }

    function selectAnimeSuggestion(anime) {
        const attributes = anime.attributes || {};
        const title = attributes.canonicalTitle
            || Object.values(attributes.titles || {}).find(Boolean);
        if (!title) return;

        const poster = attributes.posterImage?.large
            || attributes.posterImage?.medium
            || attributes.posterImage?.small
            || attributes.posterImage?.original
            || null;

        selectedAnime = {
            id: String(anime.id),
            title,
            poster,
            genres: Array.isArray(anime._aniTrackGenres) ? anime._aniTrackGenres : [],
            format: attributes.showType || attributes.subtype || "",
            year: attributes.startDate ? attributes.startDate.slice(0, 4) : "",
            episodeCount: Number.isInteger(attributes.episodeCount) && attributes.episodeCount > 0
                ? attributes.episodeCount
                : null
        };
        displayTotalEpisodes(selectedAnime.episodeCount);
        animeSearchInput.value = title;
        form.elements.title.value = title;
        closeAnimeSuggestions();

        selectedAnimePreview.replaceChildren();
        if (poster) {
            const image = document.createElement("img");
            image.src = poster;
            image.alt = `Capa de ${title}`;
            image.loading = "lazy";
            selectedAnimePreview.append(image);
        }
        const details = document.createElement("div");
        const selectedTitle = document.createElement("strong");
        selectedTitle.textContent = title;
        details.append(selectedTitle);
        if (selectedAnime.year) {
            const year = document.createElement("small");
            year.textContent = selectedAnime.year;
            details.append(year);
        }
        selectedAnimePreview.append(details);
        selectedAnimePreview.hidden = false;

        if (poster) {
            coverCache.set(normalizeTitle(title), Promise.resolve(poster));
        }
        validateDuplicateSelection();
    }

    function validateDuplicateSelection() {
        if (!selectedAnime) return;
        const duplicate = animes.some(anime =>
            anime.userId === currentUserId
            && anime.id !== editingId
            && (
                (anime.kitsuId && String(anime.kitsuId) === String(selectedAnime.id))
                || (!anime.kitsuId && normalizeTitle(anime.title) === normalizeTitle(selectedAnime.title))
            )
        );
        submitButton.disabled = duplicate || isSaving;
        if (duplicate) {
            showMessage("Esta obra já está na sua biblioteca.", true);
        } else if (form.elements.title.value) {
            showMessage("");
        }
    }

    async function searchAnimeSuggestions(term, requestId) {
        try {
            const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(term)}&page[limit]=8&sort=popularityRank&include=genres`;
            const response = await fetch(url, {
                headers: { Accept: "application/vnd.api+json" }
            });
            if (!response.ok) throw new Error(`Kitsu respondeu ${response.status}`);
            const result = await response.json();
            if (requestId !== suggestionRequestId) return;

            animeSuggestions.replaceChildren();
            const includedGenres = new Map((result.included || [])
                .filter(item => item.type === "genres")
                .map(item => [String(item.id), item.attributes?.name || ""]));
            const entries = (result.data || []).filter(item =>
                item.attributes?.canonicalTitle || Object.values(item.attributes?.titles || {}).some(Boolean)
            ).map(item => ({
                ...item,
                _aniTrackGenres: (item.relationships?.genres?.data || [])
                    .map(genre => includedGenres.get(String(genre.id)))
                    .filter(Boolean)
            }));

            if (!entries.length) {
                const empty = document.createElement("div");
                empty.className = "anime-suggestion-empty";
                empty.textContent = "Nenhuma obra encontrada. Tente outro título.";
                animeSuggestions.append(empty);
            } else {
                entries.forEach(anime => {
                    const attributes = anime.attributes;
                    const title = attributes.canonicalTitle
                        || Object.values(attributes.titles || {}).find(Boolean);
                    const poster = attributes.posterImage?.small
                        || attributes.posterImage?.medium
                        || null;
                    const option = document.createElement("button");
                    option.type = "button";
                    option.className = "anime-suggestion-option";
                    option.setAttribute("role", "option");
                    const image = document.createElement("img");
                    image.alt = "";
                    image.src = poster || fallbackCover;
                    const info = document.createElement("span");
                    const name = document.createElement("strong");
                    name.textContent = title;
                    info.append(name);
                    if (attributes.startDate) {
                        const year = document.createElement("small");
                        year.textContent = attributes.startDate.slice(0, 4);
                        info.append(year);
                    }
                    option.append(image, info);
                    option.addEventListener("click", () => selectAnimeSuggestion(anime));
                    animeSuggestions.append(option);
                });
            }
            animeSuggestions.hidden = false;
            animeSearchInput.setAttribute("aria-expanded", "true");
        } catch (error) {
            if (requestId !== suggestionRequestId) return;
            console.error("Erro ao buscar sugestões no Kitsu:", error);
            closeAnimeSuggestions();
            showMessage("Não foi possível buscar sugestões agora. Verifique sua conexão e tente novamente.", true);
        }
    }

    animeSearchInput.addEventListener("input", () => {
        clearAnimeSelection();
        showMessage("");
        closeAnimeSuggestions();
        const term = animeSearchInput.value.trim();
        const requestId = ++suggestionRequestId;
        clearTimeout(suggestionTimer);
        if (term.length < 2) return;
        suggestionTimer = setTimeout(() => searchAnimeSuggestions(term, requestId), 350);
    });

    animeSearchInput.addEventListener("keydown", event => {
        if (event.key === "Escape") closeAnimeSuggestions();
    });

    document.addEventListener("click", event => {
        if (!event.target.closest(".anime-picker-field")) closeAnimeSuggestions();
    });

    // Converter dados do Supabase
    function mapAnime(row) {
        return {
            id: row.id,
            userId: row.user_id,
            title: row.title,
            totalEpisodes: row.total_episodes,
            watchedEpisodes: row.watched_episodes,
            status: row.status,
            favorite: row.favorite,
            rating: row.rating,
            kitsuId: row.kitsu_id || null,
            genres: Array.isArray(row.genres) ? row.genres : [],
            format: row.format || "",
            posterUrl: row.poster_url || "",
            updatedAt: row.updated_at || null
        };
    }

    // Atualizar estatísticas
    function updateStats(items) {
        const total = items.length;

        const completed = items.filter(
            anime => anime.status === "Concluído"
        ).length;

        const watching = items.filter(
            anime => anime.status === "Assistindo"
        ).length;

        const rated = items.filter(
            anime => anime.rating !== null && anime.rating !== undefined
        );

        const average = rated.length
            ? (
                rated.reduce((sum, anime) => sum + Number(anime.rating), 0)
                / rated.length
            ).toFixed(1)
            : "—";

        statsContainer.innerHTML = `
            <article class="stat-card stat-total">
                <span class="stat-icon">✧</span>
                <strong>${total}</strong>
                <span>Total de animes</span>
            </article>

            <article class="stat-card stat-completed">
                <span class="stat-icon">✓</span>
                <strong>${completed}</strong>
                <span>Concluídos</span>
            </article>

            <article class="stat-card stat-watching">
                <span class="stat-icon">▶</span>
                <strong>${watching}</strong>
                <span>Assistindo</span>
            </article>

            <article class="stat-card stat-rating">
                <span class="stat-icon">★</span>
                <strong>${average}</strong>
                <span>Média das notas</span>
            </article>
        `;
    }

    // Atualizar navegação lateral
    
function updateNavigation() {
    document.querySelectorAll(".nav-item").forEach(button => {
        const currentView = libraryFilter === "all"
            ? "home"
            : libraryFilter;

        button.classList.toggle(
            "active",
            button.dataset.view === currentView
        );
    });
}


    // Navegação lateral
    
// Navegação lateral
document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
        // A tela de perfil possui navegação própria em profile.js.
        // Não deixe o handler do catálogo redirecioná-la de volta para a biblioteca.
        if (button.id === "profileNavButton") return;

        const view = button.dataset.view;

        // Abrir estatísticas
        if (view === "statistics") {
            openStatistics();

            document.querySelectorAll(".nav-item").forEach(item => {
                item.classList.toggle(
                    "active",
                    item.dataset.view === "statistics"
                );
            });

            return;
        }

        // Ao escolher qualquer outra seção,
        // voltar primeiro para o catálogo.
        openCatalog();

        // Aplicar filtro selecionado
        libraryFilter = view === "favorites"
            ? "favorites"
            : view === "mine"
                ? "mine"
                : view === "shared"
                    ? "shared"
                    : "all";

        updateNavigation();
        render();
    });
});


    // Carregar bibliotecas
    async function load() {
        if (!currentUserId) return;

        try {
            const term = search.value.trim();

            let query = supabase
                .from("anime")
                .select("*")
                .order("title");

            if (term) {
                query = query.ilike("title", `%${term}%`);
            }

            const { data, error } = await query;

            if (error) throw error;

            animes = (data || []).map(mapAnime);
            render();

        } catch (error) {
            console.error("Erro ao carregar catálogo:", error);
            showMessage(
                "Não foi possível carregar o catálogo: " + error.message,
                true
            );
        }
    }

    // Renderizar catálogo
    function refreshFilterOptions() {
        if (!filterGenre || !filterFormat) return;
        const currentGenre = filterGenre.value;
        const currentFormat = filterFormat.value;
        const genres = [...new Set(animes.flatMap(a => a.genres || []))].sort((a,b) => a.localeCompare(b, "pt-BR"));
        const formats = [...new Set(animes.map(a => a.format).filter(Boolean))].sort((a,b) => a.localeCompare(b, "pt-BR"));
        filterGenre.replaceChildren(new Option("Todos os gêneros", ""));
        genres.forEach(value => filterGenre.add(new Option(value, value)));
        filterFormat.replaceChildren(new Option("Todos os formatos", ""));
        formats.forEach(value => filterFormat.add(new Option(value, value)));
        filterGenre.value = genres.includes(currentGenre) ? currentGenre : "";
        filterFormat.value = formats.includes(currentFormat) ? currentFormat : "";
    }

    function updateFilterCount() {
        const count = [filterStatus?.value, filterGenre?.value, filterFormat?.value, filterRating?.value].filter(Boolean).length;
        if (filterCount) {
            filterCount.textContent = String(count);
            filterCount.hidden = count === 0;
        }
    }

    function render() {
        list.innerHTML = "";
        refreshFilterOptions();

        let visibleAnimes = animes.filter(anime => {
            if (libraryFilter === "mine" && anime.userId !== currentUserId) return false;
            if (libraryFilter === "shared" && anime.userId === currentUserId) return false;
            if (libraryFilter === "favorites" && !(anime.userId === currentUserId && anime.favorite)) return false;
            if (filterStatus?.value && anime.status !== filterStatus.value) return false;
            if (filterGenre?.value && !(anime.genres || []).includes(filterGenre.value)) return false;
            if (filterFormat?.value && anime.format !== filterFormat.value) return false;
            if (filterRating?.value && (anime.rating == null || Number(anime.rating) < Number(filterRating.value))) return false;
            return true;
        });

        const progressOf = anime => anime.totalEpisodes > 0
            ? Math.min(100, Math.max(0, anime.watchedEpisodes / anime.totalEpisodes * 100)) : 0;
        const sortMode = librarySort?.value || "updated";
        visibleAnimes.sort((a,b) => {
            if (sortMode === "title-asc") return a.title.localeCompare(b.title, "pt-BR");
            if (sortMode === "title-desc") return b.title.localeCompare(a.title, "pt-BR");
            if (sortMode === "rating-desc") return (Number(b.rating) || -1) - (Number(a.rating) || -1);
            if (sortMode === "progress-desc") return progressOf(b) - progressOf(a);
            if (sortMode === "progress-asc") return progressOf(a) - progressOf(b);
            return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
        });

        updateFilterCount();
        updateStats(visibleAnimes);

        if (!visibleAnimes.length) {
            const empty = document.createElement("p");
            empty.className = "muted library-empty";
            empty.textContent = search.value.trim() || filterStatus?.value || filterGenre?.value || filterFormat?.value || filterRating?.value
                ? "Nenhum anime corresponde aos filtros selecionados."
                : libraryFilter === "favorites" ? "Você ainda não possui favoritos." : "Esta biblioteca ainda está vazia.";
            list.append(empty);
            return;
        }

        list.classList.toggle("anime-list-view", libraryView === "list");
        visibleAnimes.forEach(anime => {
            const isOwner = anime.userId === currentUserId;
            const item = document.createElement("article");
            item.className = `item item-modern ${isOwner ? "item-own" : "item-shared"}`;

            const coverContainer = document.createElement("div");
            coverContainer.className = "anime-cover";
            const coverImage = document.createElement("img");
            coverImage.src = anime.posterUrl || fallbackCover;
            coverImage.alt = `Capa de ${anime.title}`;
            coverImage.loading = "lazy";
            coverImage.onerror = () => { coverImage.src = fallbackCover; };
            coverContainer.append(coverImage);

            const statusBadge = document.createElement("span");
            statusBadge.className = "status-badge status-overlay status-" + anime.status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            statusBadge.textContent = anime.status;
            coverContainer.append(statusBadge);

            if (isOwner) {
                const favoriteButton = document.createElement("button");
                favoriteButton.type = "button";
                favoriteButton.className = `favorite-overlay-button ${anime.favorite ? "is-favorite" : ""}`;
                favoriteButton.textContent = anime.favorite ? "★" : "☆";
                favoriteButton.title = anime.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos";
                favoriteButton.setAttribute("aria-label", favoriteButton.title);
                favoriteButton.onclick = event => { event.stopPropagation(); toggleFavorite(anime); };
                coverContainer.append(favoriteButton);
            }

            const info = document.createElement("div");
            info.className = "anime-info";
            const title = document.createElement("h3");
            title.textContent = anime.title;
            const meta = document.createElement("div");
            meta.className = "anime-card-meta";
            if (anime.format) {
                const format = document.createElement("span");
                format.textContent = anime.format.toUpperCase();
                meta.append(format);
            }
            (anime.genres || []).slice(0, 2).forEach(genreName => {
                const genre = document.createElement("span");
                genre.textContent = genreName;
                meta.append(genre);
            });
            const details = document.createElement("p");
            details.className = "anime-episode-count";
            details.textContent = `${anime.watchedEpisodes} / ${anime.totalEpisodes} episódios`;
            const progress = document.createElement("div");
            progress.className = "anime-progress";
            const progressBar = document.createElement("div");
            progressBar.className = "anime-progress-bar";
            progressBar.style.width = `${progressOf(anime)}%`;
            progress.append(progressBar);
            const progressText = document.createElement("small");
            progressText.className = "progress-text";
            progressText.textContent = `${Math.round(progressOf(anime))}% concluído`;
            const ratingLabel = document.createElement("span");
            ratingLabel.className = "anime-card-rating";
            ratingLabel.textContent = anime.rating == null ? "Sem avaliação" : `★ ${anime.rating}/10`;
            info.append(title, meta, details, progress, progressText, ratingLabel);

            const actions = document.createElement("div");
            actions.className = "anime-actions";
            if (isOwner) {
                const ratingSelect = document.createElement("select");
                ratingSelect.className = "rating-select";
                ratingSelect.setAttribute("aria-label", `Avaliação de ${anime.title}`);
                ratingSelect.add(new Option("Avaliar", ""));
                for (let i=0; i<=10; i++) ratingSelect.add(new Option(`${i}/10`, String(i)));
                ratingSelect.value = anime.rating == null ? "" : String(anime.rating);
                ratingSelect.onchange = () => updateRating(anime, ratingSelect.value);
                const editButton = document.createElement("button");
                editButton.type = "button"; editButton.textContent = "Editar";
                editButton.onclick = () => startEditing(anime);
                const deleteButton = document.createElement("button");
                deleteButton.type = "button"; deleteButton.textContent = "Excluir";
                deleteButton.onclick = () => deleteAnime(anime);
                actions.append(ratingSelect, editButton, deleteButton);
            } else {
                const sharedLabel = document.createElement("small");
                sharedLabel.textContent = "Somente visualização";
                actions.append(sharedLabel);
            }

            item.append(coverContainer, info, actions);
            list.append(item);
            if (!anime.posterUrl) loadCover(anime.title, coverImage);
        });
    }

    filterToggle?.addEventListener("click", () => {
        const isOpen = !filterPanel.hidden;
        filterPanel.hidden = isOpen;
        filterToggle.setAttribute("aria-expanded", String(!isOpen));
    });
    [filterStatus, filterGenre, filterFormat, filterRating, librarySort].forEach(control => {
        control?.addEventListener("change", render);
    });
    document.querySelector("#clearLibraryFilters")?.addEventListener("click", () => {
        [filterStatus, filterGenre, filterFormat, filterRating].forEach(control => { if (control) control.value = ""; });
        render();
    });
    document.querySelectorAll("[data-library-view]").forEach(button => {
        button.addEventListener("click", () => {
            libraryView = button.dataset.libraryView;
            document.querySelectorAll("[data-library-view]").forEach(option => {
                const active = option === button;
                option.classList.toggle("is-active", active);
                option.setAttribute("aria-pressed", String(active));
            });
            render();
        });
    });

    // Verificar propriedade
    function canEdit(anime) {
        return anime.userId === currentUserId;
    }

    // Atualizar favorito
    async function toggleFavorite(anime) {
        if (!canEdit(anime)) return;

        try {
            const { error } = await supabase
                .from("anime")
                .update({ favorite: !anime.favorite })
                .eq("id", anime.id)
                .eq("user_id", currentUserId);

            if (error) throw error;

            showMessage("Favorito atualizado!");
            await load();

        } catch (error) {
            console.error(error);
            showMessage("Não foi possível atualizar o favorito: " + error.message, true);
        }
    }

    // Atualizar avaliação
    async function updateRating(anime, rating) {
        if (!canEdit(anime)) return;

        try {
            const value = rating === "" ? null : Number(rating);

            const { error } = await supabase
                .from("anime")
                .update({ rating: value })
                .eq("id", anime.id)
                .eq("user_id", currentUserId);

            if (error) throw error;

            showMessage("Avaliação atualizada!");
            await load();

        } catch (error) {
            console.error(error);
            showMessage("Não foi possível atualizar a avaliação: " + error.message, true);
        }
    }

    // Confirmação visual de exclusão (substitui o confirm nativo do navegador)
    function confirmAnimeDeletion(title) {
        const modal = document.querySelector("#deleteConfirmModal");
        const dialog = modal?.querySelector(".delete-confirm-dialog");
        const animeName = document.querySelector("#deleteConfirmAnime");
        const cancelButton = document.querySelector("#cancelDeleteAnime");
        const confirmButton = document.querySelector("#confirmDeleteAnime");
        if (!modal || !dialog || !animeName || !cancelButton || !confirmButton) {
            console.error("AniTrack: modal de confirmação não encontrado.");
            return Promise.resolve(false);
        }

        animeName.textContent = title;
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        confirmButton.focus();

        return new Promise(resolve => {
            let settled = false;
            const finish = accepted => {
                if (settled) return;
                settled = true;
                modal.hidden = true;
                modal.setAttribute("aria-hidden", "true");
                document.body.style.overflow = "";
                cancelButton.removeEventListener("click", cancel);
                confirmButton.removeEventListener("click", accept);
                modal.removeEventListener("click", backdropCancel);
                document.removeEventListener("keydown", onKeyDown);
                resolve(accepted);
            };
            const cancel = () => finish(false);
            const accept = () => finish(true);
            const backdropCancel = event => { if (event.target === modal) cancel(); };
            const onKeyDown = event => {
                if (event.key === "Escape") { event.preventDefault(); cancel(); }
                if (event.key === "Tab") {
                    event.preventDefault();
                    (document.activeElement === confirmButton ? cancelButton : confirmButton).focus();
                }
            };
            cancelButton.addEventListener("click", cancel);
            confirmButton.addEventListener("click", accept);
            modal.addEventListener("click", backdropCancel);
            document.addEventListener("keydown", onKeyDown);
        });
    }

    // Excluir anime
    async function deleteAnime(anime) {
        if (!canEdit(anime)) return;

        const confirmed = await confirmAnimeDeletion(anime.title);
        if (!confirmed) return;

        try {
            const { error } = await supabase
                .from("anime")
                .delete()
                .eq("id", anime.id)
                .eq("user_id", currentUserId);

            if (error) throw error;

            showMessage("Anime excluído com sucesso!");
            await load();

        } catch (error) {
            console.error(error);
            showMessage("Não foi possível excluir o anime: " + error.message, true);
        }
    }

    // Iniciar edição
    function startEditing(anime) {
        if (!canEdit(anime)) return;

        editingId = anime.id;

        form.elements.title.value = anime.title;
        animeSearchInput.value = anime.title;
        selectedAnime = { title: anime.title, id: null, poster: null, year: "", episodeCount: anime.totalEpisodes };
        selectedAnimePreview.hidden = true;
        submitButton.disabled = false;
        displayTotalEpisodes(anime.totalEpisodes);
        form.elements.watchedEpisodes.value = anime.watchedEpisodes;
        form.elements.status.value = anime.status;
        syncStatusPicker();

        submitButton.textContent = "Salvar alterações";
        cancelButton.hidden = false;

        showMessage(`Editando: ${anime.title}`);

        openAddScreen();
    }

    // Cancelar edição
    function cancelEditing() {
        editingId = null;
        form.reset();
        syncStatusPicker();
        animeSearchInput.value = "";
        clearAnimeSelection();
        closeAnimeSuggestions();

        submitButton.textContent = "＋ Adicionar à coleção";
        cancelButton.hidden = true;

        showMessage("");
    }

    cancelButton.addEventListener("click", () => {
        cancelEditing();
        openCatalog();
    });

    // Cadastrar e editar
    form.addEventListener("submit", async event => {
        event.preventDefault();

        if (!currentUserId) {
            showMessage("Faça login para cadastrar animes.", true);
            return;
        }

        const title = form.elements.title.value.trim();
        const totalEpisodes = Number(form.elements.totalEpisodes.value);
        const watchedEpisodes = Number(form.elements.watchedEpisodes.value);
        const status = form.elements.status.value;

        if (!title || title.length > 100 || !selectedAnime || normalizeTitle(title) !== normalizeTitle(selectedAnime.title)) {
            showMessage("Escolha um anime entre as sugestões do Kitsu antes de cadastrar.", true);
            return;
        }

        const duplicate = animes.some(anime =>
            anime.userId === currentUserId
            && anime.id !== editingId
            && normalizeTitle(anime.title) === normalizeTitle(title)
        );
        if (duplicate) {
            showMessage("Esta obra já está na sua biblioteca.", true);
            submitButton.disabled = true;
            return;
        }

        if (!Number.isInteger(totalEpisodes) || totalEpisodes <= 0
            || totalEpisodes !== selectedAnime.episodeCount) {
            showMessage("O Kitsu não informou um total válido de episódios para esta obra. Não é possível cadastrar sem essa informação.", true);
            return;
        }

        if (
            !Number.isInteger(watchedEpisodes)
            || watchedEpisodes < 0
            || watchedEpisodes > totalEpisodes
        ) {
            showMessage("Os episódios assistidos devem estar entre zero e o total.", true);
            return;
        }

        if (!["Planejado", "Assistindo", "Pausado", "Concluído"].includes(status)) {
            showMessage("Selecione um status válido.", true);
            return;
        }

        if (isSaving) return;
        isSaving = true;
        submitButton.disabled = true;

        try {
            let error;

            if (editingId !== null) {
                const { error: updateError } = await supabase
                    .from("anime")
                    .update({
                        title,
                        total_episodes: totalEpisodes,
                        watched_episodes: watchedEpisodes,
                        status,
                        // Durante uma edição comum, selectedAnime.id é null.
                        // Nesse caso, preservamos o kitsu_id e os metadados já salvos.
                        // Só substituímos esses campos quando uma obra válida do Kitsu
                        // foi selecionada explicitamente no formulário.
                        ...(selectedAnime?.id ? {
                            kitsu_id: String(selectedAnime.id),
                            genres: selectedAnime.genres || [],
                            format: selectedAnime.format || null,
                            poster_url: selectedAnime.poster || null
                        } : {})
                    })
                    .eq("id", editingId)
                    .eq("user_id", currentUserId);

                error = updateError;

            } else {
                const { error: insertError } = await supabase
                    .from("anime")
                    .insert({
                        user_id: currentUserId,
                        title,
                        total_episodes: totalEpisodes,
                        watched_episodes: watchedEpisodes,
                        status,
                        favorite: false,
                        rating: null,
                        kitsu_id: String(selectedAnime.id),
                        genres: selectedAnime.genres || [],
                        format: selectedAnime.format || null,
                        poster_url: selectedAnime.poster || null
                    });

                error = insertError;
            }

            if (error) throw error;

            showMessage(
                editingId !== null
                    ? "Anime atualizado com sucesso!"
                    : "Anime cadastrado com sucesso!"
            );

            cancelEditing();
            await load();
            openCatalog();

        } catch (error) {
            console.error(error);
            showMessage("Não foi possível salvar: " + error.message, true);

        } finally {
            isSaving = false;
            submitButton.disabled = editingId === null && !selectedAnime;
            if (selectedAnime && editingId === null) validateDuplicateSelection();
        }
    });

    // Pesquisa
    search.addEventListener("input", load);

    // Inicialização
    async function initializeCatalog() {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
            showMessage("Erro ao verificar sessão: " + error.message, true);
            return;
        }

        currentUserId = data.session?.user.id || null;

        if (currentUserId) {
            await load();
        }
    }

    // Mudanças de autenticação
    supabase.auth.onAuthStateChange((event, session) => {
        const nextUserId = session?.user.id || null;

        if (nextUserId !== currentUserId) {
            currentUserId = nextUserId;

            if (currentUserId) {
                queueMicrotask(() => load());
            } else {
                animes = [];
                list.innerHTML = "";
                statsContainer.innerHTML = "";
                search.value = "";
                cancelEditing();
                openCatalog();
            }
        }
    });

    updateNavigation();
    initializeCatalog();

})();

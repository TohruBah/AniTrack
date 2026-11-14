
(() => {
    const supabase = window.supabaseClient;

    // Elementos principais
    const form = document.querySelector("#form");
    const list = document.querySelector("#list");
    const message = document.querySelector("#message");

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

    if (!catalogView || !addAnimeView || !statisticsView || !statsContainer || !search) {
        console.error("AniTrack: elementos de navegação não encontrados.");
        return;
    }

    let currentUserId = null;
    let editingId = null;
    let animes = [];
    let libraryFilter = "all";

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

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "secondary-button";
    cancelButton.textContent = "Cancelar edição";
    cancelButton.hidden = true;

    submitButton.insertAdjacentElement("afterend", cancelButton);

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
            rating: row.rating
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
    function render() {
        list.innerHTML = "";

        let visibleAnimes = animes.filter(anime => {
            if (libraryFilter === "mine") {
                return anime.userId === currentUserId;
            }

            if (libraryFilter === "shared") {
                return anime.userId !== currentUserId;
            }

            if (libraryFilter === "favorites") {
                return anime.userId === currentUserId && anime.favorite;
            }

            return true;
        });

        updateStats(visibleAnimes);

        if (!visibleAnimes.length) {
            const empty = document.createElement("p");
            empty.className = "muted";

            empty.textContent = search.value.trim()
                ? "Nenhum anime encontrado."
                : libraryFilter === "favorites"
                    ? "Você ainda não possui favoritos."
                    : "Esta biblioteca ainda está vazia.";

            list.append(empty);
            return;
        }

        visibleAnimes.forEach(anime => {
            const isOwner = anime.userId === currentUserId;

            const item = document.createElement("div");
            item.className = isOwner
                ? "item item-own"
                : "item item-shared";

            // Capa
            const coverContainer = document.createElement("div");
            coverContainer.className = "anime-cover";

            const coverImage = document.createElement("img");
            coverImage.src = fallbackCover;
            coverImage.alt = `Capa de ${anime.title}`;
            coverImage.loading = "lazy";

            coverImage.onerror = () => {
                coverImage.src = fallbackCover;
            };

            coverContainer.append(coverImage);

            // Informações
            const info = document.createElement("div");
            info.className = "anime-info";

            const title = document.createElement("h3");
            title.textContent = anime.title;

            const details = document.createElement("p");
            details.textContent =
                `${anime.watchedEpisodes}/${anime.totalEpisodes} episódios`;

            const progress = Math.min(
                100,
                Math.max(
                    0,
                    (anime.watchedEpisodes / anime.totalEpisodes) * 100
                )
            );

            const progressContainer = document.createElement("div");
            progressContainer.className = "anime-progress";

            const progressBar = document.createElement("div");
            progressBar.className = "anime-progress-bar";
            progressBar.style.width = `${progress}%`;

            const progressText = document.createElement("small");
            progressText.className = "progress-text";
            progressText.textContent =
                `${Math.round(progress)}% concluído`;

            progressContainer.append(progressBar);

            const statusBadge = document.createElement("span");
            statusBadge.className =
                "status-badge status-" +
                anime.status.toLowerCase().normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");

            statusBadge.textContent = anime.status;

            const ownerLabel = document.createElement("small");
            ownerLabel.className = "library-label";
            ownerLabel.textContent = isOwner
                ? "Minha biblioteca"
                : "Biblioteca compartilhada";

            // Status sobre a capa
statusBadge.classList.add("status-overlay");
coverContainer.append(statusBadge);

// Informações abaixo da capa
info.append(
    title,
    details,
    progressContainer,
    progressText,
    ownerLabel
);

            // Ações
            const actions = document.createElement("div");
            actions.className = "anime-actions";

            if (isOwner) {
                
const favoriteButton = document.createElement("button");
favoriteButton.type = "button";
favoriteButton.className = "favorite-overlay-button";

favoriteButton.textContent = anime.favorite ? "★" : "☆";
favoriteButton.title = anime.favorite
    ? "Remover dos favoritos"
    : "Adicionar aos favoritos";

favoriteButton.setAttribute("aria-label", favoriteButton.title);
favoriteButton.classList.toggle("is-favorite", anime.favorite);

favoriteButton.onclick = (event) => {
    event.stopPropagation();
    toggleFavorite(anime);
};

// Posicionamento garantido sobre a capa
coverContainer.style.setProperty("position", "relative", "important");

const favoriteStyles = {
    position: "absolute",
    top: "10px",
    right: "10px",
    left: "auto",
    bottom: "auto",
    width: "38px",
    height: "38px",
    minWidth: "38px",
    minHeight: "38px",
    maxWidth: "38px",
    padding: "0",
    margin: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    border: "1px solid rgba(220,205,255,0.4)",
    background: "rgba(20,17,38,0.88)",
    color: anime.favorite ? "#ffb8e4" : "#eee5ff",
    fontSize: "23px",
    lineHeight: "1",
    zIndex: "20",
    cursor: "pointer",
    boxShadow: anime.favorite
        ? "0 0 15px rgba(220,150,255,0.5)"
        : "0 3px 10px rgba(0,0,0,0.3)"
};

Object.entries(favoriteStyles).forEach(([property, value]) => {
    favoriteButton.style.setProperty(
        property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`),
        value,
        "important"
    );
});

coverContainer.append(favoriteButton);


                
const ratingWrapper = document.createElement("div");
ratingWrapper.className = "rating-wrapper";

const ratingIcon = document.createElement("span");
ratingIcon.className = "rating-icon";
ratingIcon.textContent = "★";

const ratingSelect = document.createElement("select");
ratingSelect.className = "rating-select";
ratingSelect.setAttribute(
    "aria-label",
    `Avaliação de ${anime.title}`
);

const noRating = document.createElement("option");
noRating.value = "";
noRating.textContent = "Sem nota";
ratingSelect.append(noRating);

for (let i = 0; i <= 10; i++) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = `${i}/10`;
    ratingSelect.append(option);
}

ratingSelect.value = anime.rating == null
    ? ""
    : String(anime.rating);

ratingSelect.onchange = () =>
    updateRating(anime, ratingSelect.value);

ratingWrapper.append(ratingIcon, ratingSelect);


                const editButton = document.createElement("button");
                editButton.type = "button";
                editButton.textContent = "Editar";
                editButton.onclick = () => startEditing(anime);

                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.textContent = "Excluir";
                deleteButton.onclick = () => deleteAnime(anime);

                actions.append(
                    favoriteButton,
                    ratingWrapper,
                    editButton,
                    deleteButton
                );

            } else {
                const sharedLabel = document.createElement("small");
                sharedLabel.textContent = "Somente visualização";
                actions.append(sharedLabel);
            }

            item.append(coverContainer, info, actions);
            list.append(item);

            loadCover(anime.title, coverImage);
        });
    }

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

    // Excluir anime
    async function deleteAnime(anime) {
        if (!canEdit(anime)) return;

        if (!confirm(`Deseja excluir "${anime.title}"?`)) return;

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
        form.elements.totalEpisodes.value = anime.totalEpisodes;
        form.elements.watchedEpisodes.value = anime.watchedEpisodes;
        form.elements.status.value = anime.status;

        submitButton.textContent = "Salvar alterações";
        cancelButton.hidden = false;

        showMessage(`Editando: ${anime.title}`);

        openAddScreen();
    }

    // Cancelar edição
    function cancelEditing() {
        editingId = null;
        form.reset();

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

        if (!title || title.length > 100) {
            showMessage("Informe um título de até 100 caracteres.", true);
            return;
        }

        if (!Number.isInteger(totalEpisodes) || totalEpisodes <= 0) {
            showMessage("O total de episódios deve ser maior que zero.", true);
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
                        status
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
                        rating: null
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
            submitButton.disabled = false;
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

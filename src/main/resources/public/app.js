
const form = document.querySelector("#form");
const list = document.querySelector("#list");
const message = document.querySelector("#message");

let editingId = null;

// Cache das capas para evitar pesquisas repetidas
const coverCache = new Map();

// Imagem substituta caso não encontre capa
const fallbackCover = "data:image/svg+xml," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="220">
        <rect width="100%" height="100%" fill="#24213d"/>
        <text x="50%" y="48%" text-anchor="middle"
              fill="#c8b4f0" font-size="42">✧</text>
        <text x="50%" y="65%" text-anchor="middle"
              fill="#a9a3c9" font-size="12">AniTrack</text>
    </svg>
`);

// Campo de pesquisa
const search = document.createElement("input");
search.type = "search";
search.placeholder = "Pesquisar anime pelo título...";
search.setAttribute("aria-label", "Pesquisar anime pelo título");
search.style.marginBottom = "15px";

list.parentElement.insertBefore(search, list);

// Botões do formulário
const submitButton = form.querySelector("button");

const cancelButton = document.createElement("button");
cancelButton.type = "button";
cancelButton.textContent = "Cancelar edição";
cancelButton.style.marginLeft = "8px";
cancelButton.style.display = "none";

submitButton.insertAdjacentElement("afterend", cancelButton);

// Normalizar títulos para comparação
function normalizeTitle(title) {
    return title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

// Buscar capa na Kitsu API
async function findAnimeCover(title) {
    const cacheKey = normalizeTitle(title);

    if (coverCache.has(cacheKey)) {
        return coverCache.get(cacheKey);
    }

    const request = (async () => {
        try {
            const url =
                `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=10`;

            const response = await fetch(url, {
                headers: {
                    "Accept": "application/vnd.api+json"
                }
            });

            if (!response.ok) {
                return null;
            }

            const result = await response.json();
            const animes = result.data || [];

            // Procurar correspondência pelo título
            const wanted = normalizeTitle(title);

            const match = animes.find(anime => {
                const attributes = anime.attributes;
                const titles = attributes.titles || {};

                const possibleTitles = [
                    attributes.canonicalTitle,
                    ...Object.values(titles)
                ].filter(Boolean);

                return possibleTitles.some(name => {
                    const normalized = normalizeTitle(name);

                    return normalized === wanted ||
                        normalized.includes(wanted) ||
                        wanted.includes(normalized);
                });
            });

            if (!match) {
                return null;
            }

            const poster = match.attributes.posterImage;

            return poster?.medium ||
                poster?.small ||
                poster?.large ||
                poster?.original ||
                null;

        } catch (error) {
            console.error("Erro ao buscar capa:", error);
            return null;
        }
    })();

    coverCache.set(cacheKey, request);

    return request;
}

// Carregar imagem do anime
async function loadCover(title, image) {
    const cover = await findAnimeCover(title);

    if (cover) {
        image.src = cover;
    }
}

// Atualizar favorito
async function toggleFavorite(anime) {
    const response = await fetch(
        `/api/animes/${anime.id}/favorite`,
        {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                favorite: !anime.favorite
            })
        }
    );

    if (response.ok) {
        message.textContent = anime.favorite
            ? "Anime removido dos favoritos."
            : "Anime adicionado aos favoritos!";

        await load();
    } else {
        message.textContent = "Não foi possível atualizar o favorito.";
    }
}

// Atualizar avaliação
async function updateRating(anime, rating) {
    const response = await fetch(
        `/api/animes/${anime.id}/rating`,
        {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                rating: rating === "" ? null : Number(rating)
            })
        }
    );

    if (response.ok) {
        message.textContent = "Avaliação atualizada com sucesso!";
        await load();
    } else {
        message.textContent = "Não foi possível atualizar a avaliação.";
    }
}

// Carregar catálogo
async function load() {
    const response = await fetch(
        `/api/animes?search=${encodeURIComponent(search.value)}`
    );

    if (!response.ok) {
        message.textContent = "Erro ao carregar o catálogo.";
        return;
    }

    const animes = await response.json();
    list.innerHTML = "";

    if (!animes.length) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = search.value
            ? "Nenhum anime encontrado."
            : "Seu catálogo está vazio.";

        list.append(empty);
        return;
    }

    animes.forEach(anime => {
        const item = document.createElement("div");
        item.className = "item";

        // Capa do anime
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
            `${anime.watchedEpisodes}/${anime.totalEpisodes} episódios • ${anime.status}`;

        info.append(title, details);

        // Ações
        const actions = document.createElement("div");
        actions.className = "anime-actions";

        // Favoritos
        const favoriteButton = document.createElement("button");
        favoriteButton.type = "button";
        favoriteButton.textContent = anime.favorite
            ? "⭐ Favorito"
            : "☆ Favoritar";

        favoriteButton.onclick = () => toggleFavorite(anime);

        // Avaliação
        const ratingSelect = document.createElement("select");
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

        ratingSelect.onchange = () => {
            updateRating(anime, ratingSelect.value);
        };

        // Editar
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "Editar";
        editButton.onclick = () => startEditing(anime);

        // Excluir
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "Excluir";

        deleteButton.onclick = async () => {
            const confirmed = confirm(
                `Deseja excluir "${anime.title}"?`
            );

            if (!confirmed) return;

            const response = await fetch(
                `/api/animes/${anime.id}`,
                { method: "DELETE" }
            );

            if (response.ok) {
                message.textContent = "Anime excluído com sucesso!";
                await load();
            } else {
                message.textContent = "Não foi possível excluir o anime.";
            }
        };

        actions.append(
            favoriteButton,
            ratingSelect,
            editButton,
            deleteButton
        );

        item.append(coverContainer, info, actions);
        list.append(item);

        // Buscar a capa sem bloquear a montagem do catálogo
        loadCover(anime.title, coverImage);
    });
}

// Iniciar edição
function startEditing(anime) {
    editingId = anime.id;

    form.elements.title.value = anime.title;
    form.elements.totalEpisodes.value = anime.totalEpisodes;
    form.elements.watchedEpisodes.value = anime.watchedEpisodes;
    form.elements.status.value = anime.status;

    submitButton.textContent = "Salvar alterações";
    cancelButton.style.display = "inline-block";

    message.textContent = `Editando: ${anime.title}`;
    form.scrollIntoView({ behavior: "smooth" });
}

// Cancelar edição
function cancelEditing() {
    editingId = null;
    form.reset();

    submitButton.textContent = "Adicionar";
    cancelButton.style.display = "none";

    message.textContent = "Edição cancelada.";
}

cancelButton.addEventListener("click", cancelEditing);

// Cadastro e edição
form.addEventListener("submit", async event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(form));

    data.totalEpisodes = Number(data.totalEpisodes);
    data.watchedEpisodes = Number(data.watchedEpisodes);

    if (
        !Number.isInteger(data.totalEpisodes) ||
        data.totalEpisodes <= 0
    ) {
        message.textContent =
            "O total de episódios deve ser maior que zero.";
        return;
    }

    if (
        !Number.isInteger(data.watchedEpisodes) ||
        data.watchedEpisodes < 0 ||
        data.watchedEpisodes > data.totalEpisodes
    ) {
        message.textContent =
            "Os episódios assistidos devem estar entre zero e o total.";
        return;
    }

    const isEditing = editingId !== null;

    const url = isEditing
        ? `/api/animes/${editingId}`
        : "/api/animes";

    const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const error = await response.text();
        message.textContent =
            error || "Não foi possível salvar os dados.";
        return;
    }

    if (isEditing) {
        message.textContent = "Anime atualizado com sucesso!";
        cancelEditing();
    } else {
        message.textContent = "Anime cadastrado com sucesso!";
        form.reset();
    }

    await load();
});

// Pesquisa em tempo real
search.addEventListener("input", load);

// Carregamento inicial
load();

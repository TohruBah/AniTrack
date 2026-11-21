(() => {
    "use strict";

    const view = document.querySelector("#animeDetailsView");
    if (!view) return;

    const status = document.querySelector("#animeDetailsStatus");
    const content = document.querySelector("#animeDetailsContent");
    const backButton = document.querySelector("#animeDetailsBack");
    const API = "https://kitsu.io/api/edge";
    const ALLOWED_FORMATS = new Set(["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA"]);
    let previousView = null;
    let previousNav = null;
    let activeRequest = 0;
    let currentTitle = "";
    const translationCache = new Map();

    function normalizeTitle(value) {
        return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
    }

    function kitsuFormat(subtype) {
        const formats = {
            "tv": "TV", "tv short": "TV_SHORT", "movie": "MOVIE",
            "special": "SPECIAL", "ova": "OVA", "ona": "ONA"
        };
        return formats[String(subtype || "").trim().toLowerCase()] || "";
    }

    function mapKitsuAnime(item, included = []) {
        const attributes = item?.attributes || {};
        const format = kitsuFormat(attributes.subtype);
        if (!format || !ALLOWED_FORMATS.has(format)) return null;
        const includedMap = new Map(included.map(entry => [`${entry.type}:${entry.id}`, entry]));
        const genres = (item.relationships?.genres?.data || [])
            .map(ref => includedMap.get(`${ref.type}:${ref.id}`)?.attributes?.name)
            .filter(Boolean);
        const startDate = attributes.startDate || "";
        const month = Number(startDate.slice(5, 7));
        const season = month >= 3 && month <= 5 ? "SPRING"
            : month >= 6 && month <= 8 ? "SUMMER"
            : month >= 9 && month <= 11 ? "FALL" : month ? "WINTER" : null;
        const poster = attributes.posterImage || {};
        const cover = attributes.coverImage || {};
        const rating = Number(attributes.averageRating);
        return {
            id: item.id,
            title: {
                userPreferred: attributes.canonicalTitle || attributes.titles?.en || attributes.titles?.en_jp || "Anime sem título",
                english: attributes.titles?.en || "",
                romaji: attributes.titles?.en_jp || ""
            },
            description: attributes.synopsis || "Sinopse não informada.",
            coverImage: { extraLarge: poster.original || poster.large || poster.medium || "", large: poster.large || poster.medium || "" },
            bannerImage: cover.original || cover.large || "",
            genres,
            format,
            episodes: attributes.episodeCount,
            duration: attributes.episodeLength,
            status: ({ finished: "FINISHED", current: "RELEASING", unreleased: "NOT_YET_RELEASED", tba: "NOT_YET_RELEASED" })[String(attributes.status || "").toLowerCase()] || "",
            season,
            seasonYear: startDate ? Number(startDate.slice(0, 4)) || null : null,
            averageScore: Number.isFinite(rating) ? Math.round(rating) : null,
            popularity: attributes.userCount || 0,
            studios: { nodes: [] },
            relations: { edges: [] }
        };
    }

    async function fetchAnimeDetails(title) {
        const params = new URLSearchParams({ "filter[text]": title, "page[limit]": "10", include: "genres" });
        const response = await fetch(`${API}/anime?${params.toString()}`, {
            headers: { Accept: "application/vnd.api+json" }
        });
        if (!response.ok) throw new Error(`A consulta dos detalhes falhou (${response.status}).`);
        const payload = await response.json();
        const candidates = (payload.data || []).map(item => mapKitsuAnime(item, payload.included || [])).filter(Boolean);
        if (!candidates.length) throw new Error("Nenhum anime compatível foi encontrado.");
        const wanted = normalizeTitle(title);
        return candidates.find(item => normalizeTitle(titleOf(item)) === wanted)
            || candidates.find(item => normalizeTitle(item.title.english) === wanted)
            || candidates[0];
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[char]);
    }

    function plainDescription(value) {
        return String(value || "Sinopse não informada.")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n\n")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .trim();
    }

    async function translateToPortuguese(value) {
        const source = plainDescription(value);
        if (!source || source === "Sinopse não informada.") return source;
        if (translationCache.has(source)) return translationCache.get(source);

        // Divide textos extensos para evitar limites da API pública de tradução.
        const chunks = [];
        let remaining = source;
        while (remaining.length > 4500) {
            let cut = remaining.lastIndexOf(". ", 4500);
            if (cut < 1800) cut = remaining.lastIndexOf(" ", 4500);
            if (cut < 1) cut = 4500;
            chunks.push(remaining.slice(0, cut + 1));
            remaining = remaining.slice(cut + 1).trim();
        }
        if (remaining) chunks.push(remaining);

        try {
            const translated = [];
            for (const chunk of chunks) {
                const url = new URL("https://translate.googleapis.com/translate_a/single");
                url.search = new URLSearchParams({ client: "gtx", sl: "auto", tl: "pt", dt: "t", q: chunk }).toString();
                const response = await fetch(url.toString());
                if (!response.ok) throw new Error(`Serviço de tradução indisponível (${response.status}).`);
                const payload = await response.json();
                const text = (payload?.[0] || []).map(part => part?.[0] || "").join("");
                if (!text) throw new Error("A tradução não retornou texto.");
                translated.push(text);
            }
            const result = translated.join(" ").trim();
            translationCache.set(source, result);
            return result;
        } catch (error) {
            console.warn("AniTrack — tradução da sinopse indisponível:", error);
            return "A sinopse original está disponível em outro idioma. Não foi possível realizar a tradução automática neste momento.";
        }
    }

    function titleOf(media) {
        return media?.title?.userPreferred || media?.title?.english || media?.title?.romaji || currentTitle;
    }

    function formatPtBr(value) {
        const formats = {
            TV: "Série de TV", TV_SHORT: "Série curta de TV", MOVIE: "Filme",
            SPECIAL: "Especial", OVA: "OVA", ONA: "ONA", MUSIC: "Videoclipe musical"
        };
        return formats[value] || value || "Não informado";
    }

    function generoPtBr(value) {
        const genres = {
            Action: "Ação", Adventure: "Aventura", Comedy: "Comédia", Drama: "Drama",
            Fantasy: "Fantasia", Horror: "Terror", Mystery: "Mistério", Romance: "Romance",
            "Sci-Fi": "Ficção científica", "Slice of Life": "Cotidiano", Sports: "Esportes",
            Supernatural: "Sobrenatural", Thriller: "Suspense", Psychological: "Psicológico",
            Mecha: "Robôs gigantes", Music: "Música", Historical: "Histórico",
            Ecchi: "Ecchi", "Mahou Shoujo": "Garotas mágicas", Hentai: "Hentai"
        };
        return genres[value] || value;
    }

    function seasonPtBr(value) {
        const seasons = { WINTER: "Inverno", SPRING: "Primavera", SUMMER: "Verão", FALL: "Outono" };
        return seasons[value] || value || "";
    }

    function relationPtBr(value) {
        const relations = {
            PREQUEL: "História anterior", SEQUEL: "Continuação", PARENT: "Obra principal",
            SIDE_STORY: "História paralela", CHARACTER: "Personagens relacionados",
            SUMMARY: "Resumo", ALTERNATIVE: "Versão alternativa", SPIN_OFF: "Derivação",
            ADAPTATION: "Adaptação", SOURCE: "Obra original", COMPILATION: "Compilação",
            CONTAINS: "Contém", OTHER: "Outra relação"
        };
        return relations[value] || "Obra relacionada";
    }

    function showPage() {
        document.querySelectorAll(".main-content .page-view").forEach(page => {
            page.hidden = page !== view;
        });
        view.hidden = false;
        document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function rememberPreviousPage() {
        const visiblePage = [...document.querySelectorAll(".main-content .page-view")].find(page => !page.hidden && page !== view);
        if (visiblePage) previousView = visiblePage;
        if (!previousView) previousView = document.querySelector("#catalogView");
        const activeItem = document.querySelector(".nav-item.active");
        if (activeItem) previousNav = activeItem;
    }

    function renderRelations(media) {
        const relations = (media.relations?.edges || [])
            .filter(edge => edge.node?.type === "ANIME")
            .slice(0, 12);
        if (!relations.length) return '<p class="details-muted">Não há relações de anime disponíveis.</p>';
        return `<div class="details-related-grid">${relations.map(edge => {
            const item = edge.node;
            const title = titleOf(item);
            const image = safeUrl(item.coverImage?.large || item.coverImage?.medium);
            return `<button type="button" class="details-related-card" data-anime-detail="true"
                data-anime-title="${escapeHtml(title)}" data-anime-poster="${escapeHtml(image)}"
                data-anime-format="${escapeHtml(formatPtBr(item.format))}">
                ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : '<span class="details-related-placeholder">✦</span>'}
                <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(relationPtBr(edge.relationType))}</small></span>
            </button>`;
        }).join("")}</div>`;
    }

    async function loadCollectionEntry(title) {
        const supabase = window.supabaseClient;
        if (!supabase) return null;
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id;
            if (!userId) return null;
            const { data, error } = await supabase.from("anime").select("id,title,total_episodes,watched_episodes,status,favorite,rating")
                .eq("user_id", userId).ilike("title", title).limit(1).maybeSingle();
            if (error) {
                console.warn("AniTrack — não foi possível consultar a coleção:", error);
                return null;
            }
            return data || null;
        } catch (error) {
            console.warn("AniTrack — consulta da coleção indisponível:", error);
            return null;
        }
    }

    async function renderMedia(media, request) {
        const title = titleOf(media);
        const cover = safeUrl(media.coverImage?.extraLarge || media.coverImage?.large);
        const banner = safeUrl(media.bannerImage);
        const [collectionEntry, translatedDescription] = await Promise.all([
            loadCollectionEntry(title),
            translateToPortuguese(media.description)
        ]);
        if (request !== activeRequest) return;

        const studios = (media.studios?.nodes || []).map(studio => studio.name).filter(Boolean);
        const airingStatus = {
            FINISHED: "Finalizado", RELEASING: "Em lançamento",
            NOT_YET_RELEASED: "Ainda não lançado", CANCELLED: "Cancelado", HIATUS: "Em pausa"
        };
        const meta = [
            formatPtBr(media.format),
            media.season && media.seasonYear ? `${seasonPtBr(media.season)} de ${media.seasonYear}` : media.seasonYear,
            airingStatus[media.status] || "Situação não informada"
        ].filter(Boolean);
        const score = Number(media.averageScore);
        const relationHtml = renderRelations(media);
        const collectionHtml = collectionEntry
            ? `<section class="details-collection-panel">
                <div><span class="eyebrow">SUA COLEÇÃO</span><h2>${escapeHtml(collectionEntry.status || "Adicionado")}</h2></div>
                <div class="details-progress-copy"><strong>${Number(collectionEntry.watched_episodes || 0)} / ${Number(collectionEntry.total_episodes || media.episodes || 0)}</strong><span>episódios assistidos</span></div>
                <div class="details-progress-track"><span style="width:${Math.min(100, Math.max(0, Number(collectionEntry.total_episodes) ? Number(collectionEntry.watched_episodes) / Number(collectionEntry.total_episodes) * 100 : 0))}%"></span></div>
              </section>`
            : `<section class="details-collection-panel is-empty">
                <div><span class="eyebrow">SUA COLEÇÃO</span><h2>Ainda não está na sua coleção</h2></div>
                <p>Você pode adicionar este anime pela tela de cadastro do AniTrack.</p>
              </section>`;

        content.innerHTML = `
          <header class="anime-detail-hero" ${banner ? `style="--anime-detail-banner:url('${escapeHtml(banner)}')"` : ""}>
            <div class="anime-detail-hero-shade"></div>
            <div class="anime-detail-hero-content">
              ${cover ? `<img class="anime-detail-cover" src="${escapeHtml(cover)}" alt="Capa de ${escapeHtml(title)}">` : '<div class="anime-detail-cover details-cover-placeholder">✦</div>'}
              <div class="anime-detail-heading">
                <span class="eyebrow">DETALHES DO ANIME</span>
                <h1>${escapeHtml(title)}</h1>
                <p class="anime-detail-meta">${meta.map(escapeHtml).join(" · ") || "Informações gerais"}</p>
                <div class="anime-detail-tags">${(media.genres || []).map(genre => `<span>${escapeHtml(generoPtBr(genre))}</span>`).join("")}</div>
              </div>
            </div>
          </header>
          <div class="anime-detail-body">
            <section class="anime-detail-main">
              <div class="details-section-heading"><span class="eyebrow">SOBRE A OBRA</span><h2>Sinopse</h2></div>
              <p class="anime-detail-description">${escapeHtml(translatedDescription)}</p>
              <div class="details-section-heading related-heading"><span class="eyebrow">EXPANDA SUA JORNADA</span><h2>Obras relacionadas</h2></div>
              ${relationHtml}
            </section>
            <aside class="anime-detail-aside">
              ${collectionHtml}
              <section class="details-facts-panel">
                <span class="eyebrow">INFORMAÇÕES</span>
                <dl>
                  <div><dt>Episódios</dt><dd>${escapeHtml(media.episodes ?? "Não informado")}</dd></div>
                  <div><dt>Duração</dt><dd>${media.duration ? `${escapeHtml(media.duration)} min` : "Não informada"}</dd></div>
                  <div><dt>Formato</dt><dd>${escapeHtml(formatPtBr(media.format))}</dd></div>
                  <div><dt>Temporada</dt><dd>${escapeHtml(media.season && media.seasonYear ? `${seasonPtBr(media.season)} de ${media.seasonYear}` : media.seasonYear || "Não informada")}</dd></div>
                  <div><dt>Estúdio principal</dt><dd>${escapeHtml(studios.join(", ") || "Não informado")}</dd></div>
                  <div><dt>Avaliação</dt><dd>${Number.isFinite(score) && score > 0 ? `${(score / 10).toFixed(1)} / 10` : "Não informada"}</dd></div>
                </dl>
              </section>
            </aside>
          </div>
        `;
        content.hidden = false;
        status.hidden = true;
    }

    async function openDetails(title, poster = "", format = "") {
        if (!title) return;
        rememberPreviousPage();
        currentTitle = title;
        const request = ++activeRequest;
        showPage();
        status.hidden = false;
        status.classList.remove("is-error");
        status.textContent = `Buscando informações sobre ${title}...`;
        content.hidden = true;
        content.replaceChildren();

        try {
            const media = await fetchAnimeDetails(title);
            if (request !== activeRequest) return;
            await renderMedia(media, request);
        } catch (error) {
            if (request !== activeRequest) return;
            status.hidden = false;
            status.classList.add("is-error");
            status.textContent = "Não foi possível carregar os detalhes agora. Verifique sua conexão e tente novamente.";
            content.hidden = false;
            const fallbackPoster = safeUrl(poster);
            content.innerHTML = `<div class="details-fallback">
                ${fallbackPoster ? `<img src="${escapeHtml(fallbackPoster)}" alt="">` : ""}
                <div><h1>${escapeHtml(title)}</h1><p>Não foi possível obter os dados completos agora. Verifique sua conexão e tente novamente.</p>
                ${format ? `<span>${escapeHtml(format)}</span>` : ""}</div>
              </div>`;
            console.error("AniTrack — detalhes do anime:", error);
        }
    }

    function closeDetails() {
        const target = previousView || document.querySelector("#catalogView");
        document.querySelectorAll(".main-content .page-view").forEach(page => { page.hidden = page !== target; });
        if (previousNav?.isConnected) {
            document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item === previousNav));
        } else {
            document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === "home"));
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    document.addEventListener("click", event => {
        const trigger = event.target.closest("[data-anime-detail='true']");
        if (!trigger) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        openDetails(trigger.dataset.animeTitle, trigger.dataset.animePoster, trigger.dataset.animeFormat);
    }, true);

    document.addEventListener("keydown", event => {
        const trigger = event.target.closest(".discovery-card[data-anime-detail='true']");
        if (!trigger || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openDetails(trigger.dataset.animeTitle, trigger.dataset.animePoster, trigger.dataset.animeFormat);
    }, true);

    backButton.addEventListener("click", closeDetails);
})();

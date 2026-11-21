(() => {
    "use strict";

    const view = document.querySelector("#animeDetailsView");
    if (!view) return;

    const status = document.querySelector("#animeDetailsStatus");
    const content = document.querySelector("#animeDetailsContent");
    const backButton = document.querySelector("#animeDetailsBack");
    const API = "https://graphql.anilist.co";
    let previousView = null;
    let previousNav = null;
    let activeRequest = 0;
    let currentTitle = "";

    const detailsQuery = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          id
          title { userPreferred romaji english native }
          description(asHtml: false)
          coverImage { extraLarge large }
          bannerImage
          genres
          format
          episodes
          duration
          status
          season
          seasonYear
          averageScore
          popularity
          siteUrl
          studios(isMain: true) { nodes { name } }
          relations {
            edges {
              relationType(version: 2)
              node {
                id
                type
                title { userPreferred romaji english }
                coverImage { medium large }
                format
                season
                seasonYear
              }
            }
          }
        }
      }`;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[char]);
    }

    function safeUrl(value) {
        try {
            const url = new URL(value);
            return ["https:", "http:"].includes(url.protocol) ? url.href : "";
        } catch { return ""; }
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

    function titleOf(media) {
        return media?.title?.userPreferred || media?.title?.english || media?.title?.romaji || currentTitle;
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
                data-anime-format="${escapeHtml(item.format || "Anime")}">
                ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : '<span class="details-related-placeholder">✦</span>'}
                <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml((edge.relationType || "RELATED").replace(/_/g, " "))}</small></span>
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
        const collectionEntry = await loadCollectionEntry(title);
        if (request !== activeRequest) return;

        const studios = (media.studios?.nodes || []).map(studio => studio.name).filter(Boolean);
        const meta = [
            media.format,
            media.season && media.seasonYear ? `${media.season} ${media.seasonYear}` : media.seasonYear,
            media.status?.replace(/_/g, " ")
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
                <div class="anime-detail-tags">${(media.genres || []).map(genre => `<span>${escapeHtml(genre)}</span>`).join("")}</div>
              </div>
            </div>
          </header>
          <div class="anime-detail-body">
            <section class="anime-detail-main">
              <div class="details-section-heading"><span class="eyebrow">SOBRE A OBRA</span><h2>Sinopse</h2></div>
              <p class="anime-detail-description">${escapeHtml(plainDescription(media.description))}</p>
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
                  <div><dt>Formato</dt><dd>${escapeHtml(media.format || "Não informado")}</dd></div>
                  <div><dt>Temporada</dt><dd>${escapeHtml(media.season && media.seasonYear ? `${media.season} ${media.seasonYear}` : media.seasonYear || "Não informada")}</dd></div>
                  <div><dt>Estúdio principal</dt><dd>${escapeHtml(studios.join(", ") || "Não informado")}</dd></div>
                  <div><dt>Nota AniList</dt><dd>${Number.isFinite(score) && score > 0 ? `${(score / 10).toFixed(1)} / 10` : "Não informada"}</dd></div>
                </dl>
                ${safeUrl(media.siteUrl) ? `<a class="details-source-link" href="${escapeHtml(safeUrl(media.siteUrl))}" target="_blank" rel="noopener noreferrer">Ver página no AniList ↗</a>` : ""}
              </section>
            </aside>
          </div>
          <p class="details-source-note">Informações externas fornecidas pelo AniList. Alguns campos podem estar indisponíveis ou desatualizados.</p>
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
            const response = await fetch(API, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ query: detailsQuery, variables: { search: title } })
            });
            if (!response.ok) throw new Error(`AniList respondeu com status ${response.status}.`);
            const payload = await response.json();
            if (payload.errors?.length) throw new Error(payload.errors[0].message || "Erro ao consultar o anime.");
            const media = payload.data?.Media;
            if (!media) throw new Error("Não encontramos informações para este anime.");
            if (request !== activeRequest) return;
            await renderMedia(media, request);
        } catch (error) {
            if (request !== activeRequest) return;
            status.hidden = false;
            status.classList.add("is-error");
            status.textContent = `Não foi possível carregar os detalhes. ${error.message}`;
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

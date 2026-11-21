(() => {
    "use strict";

    const view = document.querySelector("#calendarView");
    if (!view) return;

    const $ = selector => view.querySelector(selector);
    const weekHost = $("#calendarWeek");
    const monthHost = $("#calendarMonth");
    const status = $("#calendarStatus");
    const periodLabel = $("#calendarPeriodLabel");
    const timezoneSelect = $("#calendarTimezone");
    const ANILIST_API = "https://graphql.anilist.co";
    // Formatos permitidos na programação: séries, filmes e especiais de anime.
    const ALLOWED_ANIME_FORMATS = new Set(["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA"]);

    let mode = "week";
    let anchorDate = new Date();
    let schedules = [];
    let collectionTitles = new Set();
    let requestId = 0;
    let loading = false;

    const query = `
      query ($page: Int, $from: Int, $to: Int) {
        Page(page: $page, perPage: 50) {
          pageInfo { hasNextPage }
          airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
            id
            airingAt
            episode
            media {
              id
              type
              title { userPreferred romaji english }
              coverImage { medium large }
              format
              episodes
              season
              seasonYear
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

    function titleOf(media) {
        return media?.title?.userPreferred || media?.title?.english || media?.title?.romaji || "Anime sem título";
    }

    function formatPtBr(value) {
        const formats = {
            TV: "Série de TV", TV_SHORT: "Série curta de TV", MOVIE: "Filme",
            SPECIAL: "Especial", OVA: "OVA", ONA: "ONA", MUSIC: "Videoclipe musical"
        };
        return formats[value] || value || "Anime";
    }

    function normalizeTitle(value) {
        return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
    }

    function useUtc() { return timezoneSelect.value === "UTC"; }
    function startOfDay(date) {
        const result = new Date(date);
        if (useUtc()) result.setUTCHours(0, 0, 0, 0);
        else result.setHours(0, 0, 0, 0);
        return result;
    }
    function addDays(date, amount) {
        const result = new Date(date);
        if (useUtc()) result.setUTCDate(result.getUTCDate() + amount);
        else result.setDate(result.getDate() + amount);
        return result;
    }
    function dayNumber(date) { return useUtc() ? date.getUTCDay() : date.getDay(); }
    function dateKey(date) {
        const y = useUtc() ? date.getUTCFullYear() : date.getFullYear();
        const m = (useUtc() ? date.getUTCMonth() : date.getMonth()) + 1;
        const d = useUtc() ? date.getUTCDate() : date.getDate();
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    function dateFromKey(key) {
        const [y, m, d] = key.split("-").map(Number);
        return useUtc() ? new Date(Date.UTC(y, m - 1, d)) : new Date(y, m - 1, d);
    }
    function dateFormatter(options) {
        return new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: useUtc() ? "UTC" : undefined });
    }
    function timeOf(timestamp) {
        return dateFormatter({ hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(timestamp * 1000));
    }
    function dateLabel(date, options) { return dateFormatter(options).format(date); }

    function weekStart(date) {
        const day = dayNumber(date);
        return addDays(startOfDay(date), day === 0 ? -6 : 1 - day);
    }

    function monthGridStart(date) {
        const first = useUtc()
            ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
            : new Date(date.getFullYear(), date.getMonth(), 1);
        const day = dayNumber(first);
        return addDays(first, day === 0 ? -6 : 1 - day);
    }

    function setNavigationActive() {
        document.querySelectorAll(".nav-item").forEach(item => {
            item.classList.toggle("active", item.dataset.view === "calendar");
        });
    }

    async function loadCollectionTitles() {
        const supabase = window.supabaseClient;
        if (!supabase) return;
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id;
            if (!userId) return;
            const { data, error } = await supabase.from("anime").select("title").eq("user_id", userId);
            if (error) throw error;
            collectionTitles = new Set((data || []).map(row => normalizeTitle(row.title)).filter(Boolean));
        } catch (error) {
            console.warn("AniTrack — não foi possível identificar os animes da coleção no calendário:", error);
        }
    }

    function isInCollection(media) {
        const title = normalizeTitle(titleOf(media));
        if (collectionTitles.has(title)) return true;
        const aliases = [media?.title?.english, media?.title?.romaji, media?.title?.userPreferred]
            .map(normalizeTitle).filter(Boolean);
        return aliases.some(alias => collectionTitles.has(alias));
    }

    async function fetchSchedules(fromDate, toDate, currentRequest) {
        const from = Math.floor(fromDate.getTime() / 1000);
        const to = Math.floor(toDate.getTime() / 1000);
        const all = [];
        let page = 1;
        let hasNext = true;

        while (hasNext && page <= 8) {
            const response = await fetch(ANILIST_API, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ query, variables: { page, from, to } })
            });
            if (!response.ok) throw new Error(`Não foi possível consultar a programação (${response.status}).`);
            const payload = await response.json();
            if (payload.errors?.length) throw new Error(payload.errors[0].message || "Erro ao consultar o calendário.");
            if (currentRequest !== requestId) return [];
            const result = payload.data?.Page;
            all.push(...(result?.airingSchedules || []));
            hasNext = Boolean(result?.pageInfo?.hasNextPage);
            page += 1;
        }
        // O calendário deve conter exclusivamente obras do tipo ANIME e os formatos permitidos.
        return all.filter(event =>
            event.media?.type === "ANIME" && ALLOWED_ANIME_FORMATS.has(event.media?.format)
        );
    }

    function eventCard(event) {
        const media = event.media || {};
        const title = titleOf(media);
        const cover = safeUrl(media.coverImage?.large || media.coverImage?.medium);
        const own = isInCollection(media);
        return `
          <button type="button" class="calendar-event ${own ? "is-collection" : "is-discovery"}"
            data-anime-detail="true" data-anime-title="${escapeHtml(title)}"
            data-anime-poster="${escapeHtml(cover)}" data-anime-format="${escapeHtml(formatPtBr(media.format))}">
            ${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy">` : '<span class="calendar-event-placeholder">✦</span>'}
            <span class="calendar-event-info">
              <strong>${escapeHtml(title)}</strong>
              <small>Episódio ${escapeHtml(event.episode)} · ${escapeHtml(timeOf(event.airingAt))}</small>
              ${own ? '<em>Na minha coleção</em>' : ""}
            </span>
          </button>`;
    }

    function renderWeek(start) {
        weekHost.hidden = false;
        monthHost.hidden = true;
        weekHost.replaceChildren();
        const todayKey = dateKey(startOfDay(new Date()));
        const fragments = document.createDocumentFragment();

        for (let i = 0; i < 7; i++) {
            const date = addDays(start, i);
            const key = dateKey(date);
            const dayEvents = schedules.filter(event => dateKey(new Date(event.airingAt * 1000)) === key);
            const column = document.createElement("section");
            column.className = `calendar-day-column ${key === todayKey ? "is-today" : ""}`;
            const heading = document.createElement("header");
            heading.className = "calendar-day-heading";
            const weekday = document.createElement("span");
            weekday.textContent = dateLabel(date, { weekday: "short" }).replace(".", "");
            const day = document.createElement("strong");
            day.textContent = dateLabel(date, { day: "2-digit", month: "short" });
            heading.append(weekday, day);
            column.append(heading);
            const eventsHost = document.createElement("div");
            eventsHost.className = "calendar-day-events";
            if (!dayEvents.length) {
                const empty = document.createElement("p");
                empty.className = "calendar-empty-day";
                empty.textContent = "Nenhum lançamento";
                eventsHost.append(empty);
            } else {
                dayEvents.sort((a, b) => a.airingAt - b.airingAt).forEach(event => {
                    const wrapper = document.createElement("div");
                    wrapper.innerHTML = eventCard(event);
                    eventsHost.append(wrapper.firstElementChild);
                });
            }
            column.append(eventsHost);
            fragments.append(column);
        }
        weekHost.append(fragments);
    }

    function renderMonth(date) {
        weekHost.hidden = true;
        monthHost.hidden = false;
        monthHost.replaceChildren();
        const monthStart = useUtc()
            ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
            : new Date(date.getFullYear(), date.getMonth(), 1);
        const firstDay = dayNumber(monthStart);
        const offset = firstDay === 0 ? 6 : firstDay - 1;
        const gridStart = addDays(monthStart, -offset);
        const todayKey = dateKey(startOfDay(new Date()));
        const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
        weekdays.forEach(label => {
            const header = document.createElement("div");
            header.className = "calendar-month-weekday";
            header.textContent = label;
            monthHost.append(header);
        });

        for (let i = 0; i < 42; i++) {
            const dateCell = addDays(gridStart, i);
            const key = dateKey(dateCell);
            const inMonth = (useUtc() ? dateCell.getUTCMonth() : dateCell.getMonth()) ===
                (useUtc() ? date.getUTCMonth() : date.getMonth());
            const dayEvents = schedules.filter(event => dateKey(new Date(event.airingAt * 1000)) === key);
            const cell = document.createElement("section");
            cell.className = `calendar-month-day ${inMonth ? "" : "is-outside"} ${key === todayKey ? "is-today" : ""}`;
            const number = document.createElement("strong");
            number.className = "calendar-month-day-number";
            number.textContent = String(useUtc() ? dateCell.getUTCDate() : dateCell.getDate());
            cell.append(number);
            const eventsHost = document.createElement("div");
            eventsHost.className = "calendar-month-events";
            dayEvents.slice(0, 3).forEach(event => {
                const media = event.media || {};
                const own = isInCollection(media);
                const button = document.createElement("button");
                button.type = "button";
                button.className = `calendar-month-event ${own ? "is-collection" : "is-discovery"}`;
                button.dataset.animeDetail = "true";
                button.dataset.animeTitle = titleOf(media);
                button.dataset.animePoster = media.coverImage?.large || media.coverImage?.medium || "";
                button.dataset.animeFormat = formatPtBr(media.format);
                button.textContent = `${timeOf(event.airingAt)} ${titleOf(media)} · Episódio ${event.episode}`;
                button.title = `${titleOf(media)} — episódio ${event.episode}`;
                eventsHost.append(button);
            });
            if (dayEvents.length > 3) {
                const more = document.createElement("small");
                more.className = "calendar-more-events";
                more.textContent = `+${dayEvents.length - 3} lançamentos`;
                eventsHost.append(more);
            }
            cell.append(eventsHost);
            monthHost.append(cell);
        }
    }

    function updatePeriodLabel(start, end) {
        if (mode === "week") {
            periodLabel.textContent = `${dateLabel(start, { day: "numeric", month: "long" })} – ${dateLabel(addDays(end, -1), { day: "numeric", month: "long", year: "numeric" })}`;
        } else {
            periodLabel.textContent = dateLabel(anchorDate, { month: "long", year: "numeric" });
        }
    }

    async function loadCalendar() {
        loading = true;
        const currentRequest = ++requestId;
        status.hidden = false;
        status.classList.remove("is-error");
        status.textContent = "Consultando a programação de lançamentos...";
        weekHost.replaceChildren();
        monthHost.replaceChildren();

        try {
            await loadCollectionTitles();
            const first = mode === "week" ? weekStart(anchorDate) : monthGridStart(anchorDate);
            const last = mode === "week" ? addDays(first, 7) : addDays(first, 42);
            schedules = await fetchSchedules(first, last, currentRequest);
            if (currentRequest !== requestId) return;
            schedules.sort((a, b) => a.airingAt - b.airingAt);
            status.hidden = schedules.length > 0;
            status.textContent = schedules.length
                ? ""
                : "Nenhum lançamento encontrado para este período. Tente outra data.";
            const rangeEnd = mode === "week" ? addDays(first, 7) : last;
            updatePeriodLabel(first, rangeEnd);
            if (mode === "week") renderWeek(first);
            else renderMonth(anchorDate);
        } catch (error) {
            if (currentRequest !== requestId) return;
            status.hidden = false;
            status.classList.add("is-error");
            status.textContent = "Não foi possível carregar os lançamentos. Verifique sua conexão e tente novamente.";
            console.error("AniTrack — calendário:", error);
        } finally {
            if (currentRequest === requestId) loading = false;
        }
    }

    function showCalendar() {
        document.querySelectorAll(".main-content .page-view").forEach(page => { page.hidden = page !== view; });
        view.hidden = false;
        setNavigationActive();
        window.scrollTo({ top: 0, behavior: "smooth" });
        loadCalendar();
    }

    document.addEventListener("click", event => {
        const button = event.target.closest('.nav-item[data-view="calendar"]');
        if (!button) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        showCalendar();
    }, true);

    document.querySelectorAll("[data-calendar-mode]").forEach(button => {
        button.addEventListener("click", () => {
            mode = button.dataset.calendarMode;
            document.querySelectorAll("[data-calendar-mode]").forEach(item => {
                const active = item === button;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-pressed", String(active));
            });
            loadCalendar();
        });
    });

    $("#calendarPrevious").addEventListener("click", () => {
        anchorDate = mode === "week" ? addDays(anchorDate, -7) :
            (useUtc() ? new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth() - 1, 1)) :
                new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1));
        loadCalendar();
    });
    $("#calendarNext").addEventListener("click", () => {
        anchorDate = mode === "week" ? addDays(anchorDate, 7) :
            (useUtc() ? new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth() + 1, 1)) :
                new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1));
        loadCalendar();
    });
    $("#calendarToday").addEventListener("click", () => { anchorDate = new Date(); loadCalendar(); });
    timezoneSelect.addEventListener("change", loadCalendar);
})();

(() => {
  "use strict";
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const $ = selector => document.querySelector(selector);
  const profileView = $("#profileView");
  const navButton = $("#profileNavButton");
  const modal = $("#immersiveProfileModal");
  if (!profileView || !navButton || !modal) return;

  const BUCKET = "profile-avatars";
  const DEFAULT_AVATAR = "/favicon.ico";
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  let user = null;
  let profile = null;
  let collection = [];
  let selectedBanner = null;
  let removeBanner = false;
  let previewUrl = null;

  function setMessage(message, error = false) {
    $("#immersiveProfileMessage").textContent = message;
    $("#immersiveProfileMessage").style.color = error ? "#f3a4b8" : "";
  }

  function showProfileView() {
    // Oculta todas as telas e exibe somente o perfil.
    document.querySelectorAll(".main-content .page-view").forEach(view => {
      view.hidden = view !== profileView;
    });
    profileView.hidden = false;
    document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item === navButton));
    window.scrollTo({ top: 0, behavior: "smooth" });
    loadProfilePage();
  }

  navButton.addEventListener("click", showProfileView);
  document.querySelectorAll(".nav-item").forEach(button => {
    if (button === navButton) return;
    button.addEventListener("click", () => { profileView.hidden = true; });
  });

  function formatNumber(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function imageUrl(path) { return path || DEFAULT_AVATAR; }

  async function loadProfilePage() {
    const { data: sessionData } = await supabase.auth.getSession();
    user = sessionData?.session?.user || null;
    if (!user) return;

    const [profileResult, animeResult] = await Promise.all([
      supabase.from("profiles").select("username, avatar_url, banner_url, featured_anime_ids").eq("id", user.id).maybeSingle(),
      supabase.from("anime").select("id,title,total_episodes,watched_episodes,status,favorite,rating,poster_url").eq("user_id", user.id).order("title")
    ]);

    if (profileResult.error) {
      console.error("Erro ao carregar perfil imersivo:", profileResult.error);
      $("#immersiveUsername").textContent = "Não foi possível carregar o perfil";
      return;
    }
    if (animeResult.error) console.error("Erro ao carregar coleção para o perfil:", animeResult.error);

    profile = profileResult.data || {};
    collection = animeResult.data || [];
    $("#immersiveUsername").textContent = `@${profile.username || "Usuário"}`;
    $("#immersiveAvatar").src = imageUrl(profile.avatar_url);
    $("#immersiveAvatar").onerror = () => { $("#immersiveAvatar").src = DEFAULT_AVATAR; };
    const banner = $("#profileBanner");
    banner.style.backgroundImage = profile.banner_url ? `linear-gradient(90deg, rgba(8,10,22,.35), rgba(8,10,22,.08)), url("${profile.banner_url}")` : "";

    const completed = collection.filter(anime => anime.status === "Concluído").length;
    const watched = collection.reduce((sum, anime) => sum + Number(anime.watched_episodes || 0), 0);
    const rated = collection.filter(anime => anime.rating !== null && anime.rating !== undefined);
    const average = rated.length ? (rated.reduce((sum, anime) => sum + Number(anime.rating), 0) / rated.length).toFixed(1) : "—";
    const stats = [
      ["ANIMES", formatNumber(collection.length)],
      ["CONCLUÍDOS", formatNumber(completed)],
      ["EPISÓDIOS VISTOS", formatNumber(watched)],
      ["MÉDIA DAS NOTAS", average]
    ];
    $("#profileStats").replaceChildren(...stats.map(([label, value]) => {
      const card = document.createElement("article"); card.className = "profile-stat-card";
      const caption = document.createElement("span"); caption.textContent = label;
      const strong = document.createElement("strong"); strong.textContent = value;
      card.append(caption, strong); return card;
    }));
    renderFeatured();
  }

  function renderFeatured() {
    const host = $("#profileFeaturedAnime");
    host.replaceChildren();
    const ids = Array.isArray(profile?.featured_anime_ids) ? profile.featured_anime_ids.map(String) : [];
    const featured = ids.map(id => collection.find(anime => String(anime.id) === id)).filter(Boolean).slice(0, 3);
    if (!featured.length) {
      const empty = document.createElement("p"); empty.className = "profile-empty-state";
      empty.textContent = "Você ainda não escolheu animes para destacar. Use “Personalizar perfil” para selecionar até três títulos.";
      host.append(empty); return;
    }
    featured.forEach(anime => {
      const card = document.createElement("article"); card.className = "profile-featured-card";
      const cover = document.createElement("img"); cover.src = anime.poster_url || ""; cover.alt = `Capa de ${anime.title}`; cover.loading = "lazy";
      cover.onerror = () => { cover.style.display = "none"; };
      const info = document.createElement("div"); info.className = "profile-featured-info";
      const title = document.createElement("strong"); title.textContent = anime.title;
      const meta = document.createElement("span"); meta.textContent = `${anime.watched_episodes || 0}/${anime.total_episodes || 0} episódios`;
      info.append(title, meta); card.append(cover, info); host.append(card);
    });
  }

  function renderChoices() {
    const host = $("#featuredAnimeChoices"); host.replaceChildren();
    if (!collection.length) { const p = document.createElement("p"); p.textContent = "Adicione animes à sua coleção para poder destacá-los."; host.append(p); return; }
    const chosen = new Set((profile?.featured_anime_ids || []).map(String));
    collection.forEach(anime => {
      const label = document.createElement("label"); label.className = "featured-anime-choice";
      const input = document.createElement("input"); input.type = "checkbox"; input.value = String(anime.id); input.checked = chosen.has(String(anime.id));
      input.addEventListener("change", () => {
        const checked = host.querySelectorAll('input[type="checkbox"]:checked');
        if (checked.length > 3) { input.checked = false; setMessage("Você pode destacar no máximo três animes.", true); }
        else setMessage(`${checked.length} de 3 animes selecionados.`);
      });
      const title = document.createElement("span"); title.textContent = anime.title;
      label.append(input, title); host.append(label);
    });
  }

  function openEditor() {
    selectedBanner = null; removeBanner = false;
    $("#profileBannerInput").value = "";
    const preview = $("#bannerPreview");
    preview.style.backgroundImage = profile?.banner_url ? `url("${profile.banner_url}")` : "";
    renderChoices(); setMessage("Escolha um banner e até três animes."); modal.hidden = false;
  }
  function closeEditor() { modal.hidden = true; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; }
  $("#editImmersiveProfile").addEventListener("click", openEditor);
  $("#closeImmersiveProfile").addEventListener("click", closeEditor);
  modal.addEventListener("click", event => { if (event.target === modal) closeEditor(); });
  $("#profileBannerInput").addEventListener("change", () => {
    const file = $("#profileBannerInput").files?.[0]; if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setMessage("Use uma imagem PNG, JPG ou WEBP.", true); return; }
    if (file.size > MAX_IMAGE_SIZE) { setMessage("O banner deve ter no máximo 5 MB.", true); return; }
    selectedBanner = file; removeBanner = false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    $("#bannerPreview").style.backgroundImage = `url("${previewUrl}")`;
    setMessage("Prévia do banner atualizada.");
  });
  $("#removeProfileBanner").addEventListener("click", () => {
    selectedBanner = null; removeBanner = true; $("#profileBannerInput").value = "";
    $("#bannerPreview").style.backgroundImage = ""; setMessage("O banner será removido ao salvar.");
  });

  function storagePathFromUrl(url) {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const index = (url || "").indexOf(marker);
    return index < 0 ? null : decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
  }

  $("#saveImmersiveProfile").addEventListener("click", async () => {
    if (!user) return;
    const button = $("#saveImmersiveProfile"); button.disabled = true;
    let uploaded = null;
    const previousBanner = profile?.banner_url || null;
    try {
      let bannerUrl = previousBanner;
      if (selectedBanner) {
        const extension = selectedBanner.type === "image/jpeg" ? "jpg" : selectedBanner.type.split("/")[1];
        const path = `${user.id}/banner-${Date.now()}.${extension}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, selectedBanner, { cacheControl: "3600", upsert: false, contentType: selectedBanner.type });
        if (error) throw error;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        uploaded = { path, url: data.publicUrl }; bannerUrl = data.publicUrl;
      } else if (removeBanner) bannerUrl = null;

      const selectedIds = [...$("#featuredAnimeChoices").querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
      if (selectedIds.length > 3) throw new Error("Selecione no máximo três animes.");
      const { error: updateError } = await supabase.from("profiles")
        .update({ banner_url: bannerUrl, featured_anime_ids: selectedIds })
        .eq("id", user.id);
      if (updateError) throw updateError;

      // Busca separada evita erro de coerção quando UPDATE não retorna linha.
      const { data, error: fetchError } = await supabase.from("profiles")
        .select("username, avatar_url, banner_url, featured_anime_ids")
        .eq("id", user.id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!data) throw new Error("Perfil não encontrado. Confira o registro do usuário na tabela profiles.");
      if ((data.banner_url || null) !== (bannerUrl || null) ||
          JSON.stringify(data.featured_anime_ids || []) !== JSON.stringify(selectedIds)) {
        throw new Error("O Supabase não confirmou as alterações. Verifique as políticas RLS e as colunas da tabela profiles.");
      }
      profile = data;
      const oldPath = storagePathFromUrl(previousBanner);
      if ((uploaded || removeBanner) && oldPath && previousBanner !== bannerUrl) {
        const { error: deleteError } = await supabase.storage.from(BUCKET).remove([oldPath]);
        if (deleteError) console.warn("Não foi possível excluir o banner anterior:", deleteError);
      }
      setMessage("Perfil atualizado com sucesso!");
      await loadProfilePage();
      setTimeout(closeEditor, 700);
    } catch (error) {
      console.error("Erro ao salvar personalização:", error);
      if (uploaded) await supabase.storage.from(BUCKET).remove([uploaded.path]);
      setMessage("Não foi possível salvar as alterações do perfil. Verifique sua conexão e tente novamente.", true);
    } finally { button.disabled = false; }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    user = session?.user || null;
    if (!user) { profileView.hidden = true; closeEditor(); }
  });
})();

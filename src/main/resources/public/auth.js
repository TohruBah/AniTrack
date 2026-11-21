
(() => {
    const supabaseClient = window.supabaseClient;
    const AVATAR_BUCKET = "profile-avatars";
    const DEFAULT_AVATAR = "/favicon.ico";
    const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

    // Elementos de autenticação
    const authSection = document.querySelector("#authSection");
    const appContent = document.querySelector("#appContent");
    const authForm = document.querySelector("#authForm");
    const authTitle = document.querySelector("#authTitle");
    const authSubmit = document.querySelector("#authSubmit");
    const authToggle = document.querySelector("#authToggle");
    const authMessage = document.querySelector("#authMessage");
    const currentUser = document.querySelector("#currentUser");
    const logoutButton = document.querySelector("#logoutButton");

    // Elementos do perfil
    const editProfileButton = document.querySelector("#editProfileButton");
    const profileModal = document.querySelector("#profileModal");
    const closeProfileModal = document.querySelector("#closeProfileModal");
    const profileForm = document.querySelector("#profileForm");
    const profileUsername = document.querySelector("#profileUsername");
    const profileMessage = document.querySelector("#profileMessage");

    // Elementos do avatar
    const sidebarAvatar = document.querySelector("#sidebarAvatar");
    const profileAvatarInput = document.querySelector("#profileAvatarInput");
    const profileAvatarPreview = document.querySelector("#profileAvatarPreview");
    const removeProfileAvatar = document.querySelector("#removeProfileAvatar");

    let isRegistering = false;
    let profileRequest = 0;
    let currentAuthUser = null;
    let currentAvatarUrl = null;
    let selectedAvatarFile = null;
    let removeAvatarRequested = false;
    let previewObjectUrl = null;

    // Traduzir mensagens comuns do serviço de autenticação para português do Brasil.
    function translateServiceError(message) {
        const original = String(message || "");
        if (!original.trim()) return "";
        const normalized = original.toLowerCase();
        if (normalized.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
        if (normalized.includes("user already registered")) return "Este e-mail já possui uma conta cadastrada.";
        if (normalized.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
        if (normalized.includes("password should be at least")) return "A senha não atende ao tamanho mínimo exigido.";
        if (normalized.includes("email rate limit exceeded")) return "Muitas tentativas foram realizadas. Aguarde alguns instantes e tente novamente.";
        if (normalized.includes("user not found")) return "Não encontramos uma conta com esses dados.";
        if (normalized.includes("network request failed") || normalized.includes("failed to fetch")) return "Não foi possível conectar ao serviço. Verifique sua internet.";
        return "Ocorreu um erro inesperado. Verifique sua conexão e tente novamente.";
    }

    // Mensagens
    function showMessage(message, isError = false) {
        message = translateServiceError(message);
        authMessage.textContent = message;
        authMessage.style.color = isError ? "#f3a4b8" : "#b6e9fa";
    }

    function showProfileMessage(message, isError = false) {
        message = translateServiceError(message);
        profileMessage.textContent = message;
        profileMessage.style.color = isError ? "#f3a4b8" : "#b6e9fa";
    }

    // Atualizar imagem da barra lateral
    function updateSidebarAvatar(url) {
        sidebarAvatar.src = url || DEFAULT_AVATAR;
    }

    sidebarAvatar.addEventListener("error", () => {
        sidebarAvatar.src = DEFAULT_AVATAR;
    });

    // Limpar pré-visualização temporária
    function clearPreviewObjectUrl() {
        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = null;
        }
    }

    function resetAvatarEditor() {
        selectedAvatarFile = null;
        removeAvatarRequested = false;

        clearPreviewObjectUrl();

        profileAvatarInput.value = "";
        profileAvatarPreview.src = currentAvatarUrl || DEFAULT_AVATAR;
    }

    // Garantir que todo usuário autenticado tenha uma linha em public.profiles.
    // O trigger SQL cria o registro no signup; esta rotina cobre contas antigas
    // e usuários cujo registro ainda não exista.
    function buildDefaultUsername(user) {
        const emailName = (user.email || "usuario").split("@")[0];
        const base = emailName.replace(/[^A-Za-z0-9_]/g, "").slice(0, 13) || "usuario";
        const suffix = String(user.id || "").replace(/-/g, "").slice(0, 6);
        return `${base}_${suffix}`.slice(0, 20);
    }

    async function ensureProfile(user) {
        if (!user?.id) return null;

        const { data: existing, error: selectError } = await supabaseClient
            .from("profiles")
            .select("id, username, avatar_url")
            .eq("id", user.id)
            .maybeSingle();

        if (selectError) throw selectError;
        if (existing) return existing;

        const username = buildDefaultUsername(user);
        const { error: insertError } = await supabaseClient
            .from("profiles")
            .insert({
                id: user.id,
                username,
                avatar_url: null
            });

        // Se duas inicializações tentarem criar ao mesmo tempo, a segunda
        // pode receber conflito; nesse caso, verificamos se a primeira venceu.
        if (insertError && insertError.code !== "23505") throw insertError;

        const { data: created, error: verifyError } = await supabaseClient
            .from("profiles")
            .select("id, username, avatar_url")
            .eq("id", user.id)
            .maybeSingle();

        if (verifyError) throw verifyError;
        if (!created) {
            throw new Error(
                "Não foi possível criar seu perfil. Confira a política INSERT da tabela profiles no Supabase."
            );
        }

        return created;
    }

    // Carregar perfil completo
    async function loadProfile(user) {
        const requestId = ++profileRequest;

        if (!user) return null;

        currentUser.textContent = "Carregando perfil...";

        let data;
        try {
            data = await ensureProfile(user);
        } catch (error) {
            if (requestId !== profileRequest) return null;
            console.error("Erro ao garantir/criar perfil:", error);
            currentUser.textContent = "Perfil não disponível";
            return null;
        }

        if (requestId !== profileRequest) return null;

        currentUser.textContent = `@${data.username}`;
        currentAvatarUrl = data.avatar_url || null;

        updateSidebarAvatar(currentAvatarUrl);

        return data;
    }

    // Abrir janela de perfil
    async function openProfileModal() {
        if (!currentAuthUser) return;

        profileModal.hidden = false;
        profileUsername.value = "";
        resetAvatarEditor();

        showProfileMessage("Carregando perfil...");

        const profile = await loadProfile(currentAuthUser);

        if (profileModal.hidden) return;

        if (profile) {
            profileUsername.value = profile.username;
            currentAvatarUrl = profile.avatar_url || null;
            profileAvatarPreview.src = currentAvatarUrl || DEFAULT_AVATAR;

            showProfileMessage("");
            profileUsername.focus();
        } else {
            showProfileMessage(
                "Não foi possível carregar seu perfil.",
                true
            );
        }
    }

    // Fechar janela
    function closeProfile() {
        profileModal.hidden = true;
        profileForm.reset();
        resetAvatarEditor();
        showProfileMessage("");
    }

    // Selecionar imagem
    profileAvatarInput.addEventListener("change", () => {
        const file = profileAvatarInput.files[0];

        if (!file) return;

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {
            showProfileMessage(
                "Escolha uma imagem PNG, JPG ou WEBP.",
                true
            );

            profileAvatarInput.value = "";
            return;
        }

        if (file.size > MAX_AVATAR_SIZE) {
            showProfileMessage(
                "A imagem deve ter no máximo 2 MB.",
                true
            );

            profileAvatarInput.value = "";
            return;
        }

        selectedAvatarFile = file;
        removeAvatarRequested = false;

        clearPreviewObjectUrl();

        previewObjectUrl = URL.createObjectURL(file);
        profileAvatarPreview.src = previewObjectUrl;

        showProfileMessage("Pré-visualização atualizada.");
    });

    // Remover imagem selecionada ou atual
    removeProfileAvatar.addEventListener("click", () => {
        clearPreviewObjectUrl();

        selectedAvatarFile = null;
        removeAvatarRequested = true;

        profileAvatarInput.value = "";
        profileAvatarPreview.src = DEFAULT_AVATAR;

        showProfileMessage("A foto será removida ao salvar.");
    });

    // Extrair caminho do arquivo a partir da URL pública
    function getAvatarStoragePath(url) {
        if (!url) return null;

        const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
        const index = url.indexOf(marker);

        if (index === -1) return null;

        try {
            return decodeURIComponent(
                url.slice(index + marker.length).split("?")[0]
            );
        } catch {
            return null;
        }
    }

    // Enviar imagem para o Supabase Storage
    async function uploadAvatar(file) {
        const extensions = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp"
        };

        const extension = extensions[file.type];

        if (!extension) {
            throw new Error("Formato de imagem não permitido.");
        }

        const filePath =
            `${currentAuthUser.id}/avatar-${Date.now()}.${extension}`;

        const { error } = await supabaseClient.storage
            .from(AVATAR_BUCKET)
            .upload(filePath, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type
            });

        if (error) throw error;

        const { data } = supabaseClient.storage
            .from(AVATAR_BUCKET)
            .getPublicUrl(filePath);

        return {
            path: filePath,
            url: data.publicUrl
        };
    }

    // Excluir imagem antiga
    async function deleteOldAvatar(url) {
        const path = getAvatarStoragePath(url);

        if (!path) return;

        const { error } = await supabaseClient.storage
            .from(AVATAR_BUCKET)
            .remove([path]);

        if (error) {
            console.error("Não foi possível excluir o avatar antigo:", error);
        }
    }

    // Salvar perfil
    profileForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!currentAuthUser) return;

        const username = profileUsername.value.trim();

        if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
            showProfileMessage(
                "Use de 3 a 20 caracteres: letras, números ou _.",
                true
            );
            return;
        }

        const saveButton = profileForm.querySelector(
            'button[type="submit"]'
        );

        saveButton.disabled = true;
        showProfileMessage("Salvando alterações...");

        let uploadedAvatar = null;
        const previousAvatarUrl = currentAvatarUrl;

        try {
            let newAvatarUrl = currentAvatarUrl;

            // Enviar nova imagem, se houver
            if (selectedAvatarFile) {
                showProfileMessage("Enviando imagem...");

                uploadedAvatar = await uploadAvatar(selectedAvatarFile);
                newAvatarUrl = uploadedAvatar.url;
            } else if (removeAvatarRequested) {
                newAvatarUrl = null;
            }

            showProfileMessage("Atualizando perfil...");

            const { error: updateError } = await supabaseClient
                .from("profiles")
                .update({
                    username,
                    avatar_url: newAvatarUrl
                })
                .eq("id", currentAuthUser.id);

            if (updateError) throw updateError;

            // Não usar .single() no retorno do UPDATE: o PostgREST pode
            // devolver zero linhas e gerar "Cannot coerce ... single JSON object".
            const { data, error: fetchError } = await supabaseClient
                .from("profiles")
                .select("username, avatar_url")
                .eq("id", currentAuthUser.id)
                .maybeSingle();

            if (fetchError) throw fetchError;
            if (!data) {
                throw new Error("Seu perfil não foi encontrado. Verifique se existe um registro em profiles para esta conta.");
            }
            if (data.username !== username || (data.avatar_url || null) !== (newAvatarUrl || null)) {
                throw new Error("O Supabase não confirmou a atualização do perfil. Verifique as permissões RLS da tabela profiles.");
            }

            // Atualizar informações na interface
            currentAvatarUrl = data.avatar_url || null;

            currentUser.textContent = `@${data.username}`;
            updateSidebarAvatar(currentAvatarUrl);

            // Excluir imagem anterior somente após salvar o novo perfil
            if (
                (uploadedAvatar || removeAvatarRequested) &&
                previousAvatarUrl &&
                previousAvatarUrl !== currentAvatarUrl
            ) {
                await deleteOldAvatar(previousAvatarUrl);
            }

            selectedAvatarFile = null;
            removeAvatarRequested = false;

            clearPreviewObjectUrl();
            profileAvatarInput.value = "";
            profileAvatarPreview.src = currentAvatarUrl || DEFAULT_AVATAR;

            showProfileMessage("Perfil atualizado com sucesso!");

            setTimeout(() => {
                closeProfile();
            }, 1000);

        } catch (error) {
            console.error("Erro ao salvar perfil:", error);

            // Limpar arquivo novo se o perfil não foi salvo
            if (uploadedAvatar) {
                const { error: cleanupError } = await supabaseClient.storage
                    .from(AVATAR_BUCKET)
                    .remove([uploadedAvatar.path]);

                if (cleanupError) {
                    console.error("Erro ao limpar upload:", cleanupError);
                }
            }

            showProfileMessage(
                error.code === "23505"
                    ? "Esse nome de usuário já está em uso."
                    : error.message || "Não foi possível salvar o perfil.",
                true
            );
        } finally {
            saveButton.disabled = false;
        }
    });

    // Eventos da janela
    editProfileButton.addEventListener("click", openProfileModal);
    closeProfileModal.addEventListener("click", closeProfile);

    profileModal.addEventListener("click", (event) => {
        if (event.target === profileModal) {
            closeProfile();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !profileModal.hidden) {
            closeProfile();
        }
    });

    // Atualizar a tela conforme a sessão
    function updateScreen(session) {
        if (session) {
            currentAuthUser = session.user;

            authSection.hidden = true;
            appContent.hidden = false;

            loadProfile(session.user);
        } else {
            profileRequest++;
            currentAuthUser = null;
            currentAvatarUrl = null;

            authSection.hidden = false;
            appContent.hidden = true;
            currentUser.textContent = "";

            updateSidebarAvatar(null);
            closeProfile();
        }
    }

    // Alternar entre login e cadastro
    authToggle.addEventListener("click", () => {
        isRegistering = !isRegistering;

        authTitle.textContent = isRegistering
            ? "Criar sua conta"
            : "Entrar na sua conta";

        authSubmit.textContent = isRegistering
            ? "Cadastrar"
            : "Entrar";

        authToggle.textContent = isRegistering
            ? "Voltar para o login"
            : "Criar conta";

        document.querySelector("#authPassword").autocomplete =
            isRegistering ? "new-password" : "current-password";

        showMessage("");
    });

    // Login e cadastro
    authForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = document.querySelector("#authEmail").value.trim();
        const password = document.querySelector("#authPassword").value;

        authSubmit.disabled = true;
        showMessage(isRegistering ? "Criando conta..." : "Entrando...");

        try {
            if (isRegistering) {
                const { data, error } = await supabaseClient.auth.signUp({
                    email,
                    password
                });

                if (error) throw error;

                if (data.session) {
                    updateScreen(data.session);
                    showMessage("Conta criada e login realizado!");
                } else {
                    showMessage(
                        "Cadastro realizado! Confira seu e-mail para confirmar a conta."
                    );
                }
            } else {
                const { data, error } =
                    await supabaseClient.auth.signInWithPassword({
                        email,
                        password
                    });

                if (error) throw error;

                updateScreen(data.session);
                showMessage("Login realizado com sucesso!");
            }
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            authSubmit.disabled = false;
        }
    });

    // Encerrar sessão
    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;

        try {
            const { error } = await supabaseClient.auth.signOut();

            if (error) throw error;

            updateScreen(null);
            authForm.reset();
            showMessage("Sessão encerrada.");
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            logoutButton.disabled = false;
        }
    });

    // Recuperar sessão e acompanhar alterações
    async function initializeAuth() {
        const { data, error } = await supabaseClient.auth.getSession();

        if (error) {
            showMessage(error.message, true);
            return;
        }

        updateScreen(data.session);

        supabaseClient.auth.onAuthStateChange((event, session) => {
            updateScreen(session);
        });
    }

    initializeAuth();

})();

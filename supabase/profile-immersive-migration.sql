-- AniTrack — Perfil Imersivo
-- Execute no SQL Editor do Supabase somente depois de revisar este arquivo.
-- Não remove nem altera os dados atuais dos perfis.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS featured_anime_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_theme TEXT NOT NULL DEFAULT 'original';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_theme_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_theme_check
  CHECK (preferred_theme IN ('original', 'maomao', 'gentildonna'));

COMMENT ON COLUMN public.profiles.banner_url IS
  'URL pública do banner personalizado do perfil.';

COMMENT ON COLUMN public.profiles.featured_anime_ids IS
  'IDs dos animes selecionados pelo usuário para destaque no perfil (máximo de três, validado pela aplicação).';

-- As políticas RLS atuais de INSERT e UPDATE permanecem inalteradas.
-- A política SELECT atual continua permitindo que usuários autenticados
-- consultem os perfis. Não habilite leitura pública anônima sem revisar
-- também as políticas da tabela anime e do Storage.

COMMENT ON COLUMN public.profiles.preferred_theme IS
  'Tema visual preferido do usuário: original, maomao ou gentildonna.';


-- Cria automaticamente o perfil no momento em que uma conta é criada no Auth.
-- SECURITY DEFINER permite inserir em public.profiles mesmo com RLS habilitado.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
  generated_username TEXT;
  user_suffix TEXT;
BEGIN
  base_username := regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(COALESCE(NEW.email, ''), '@', 1), 'usuario'),
    '[^A-Za-z0-9_]',
    '',
    'g'
  );

  IF length(base_username) < 3 THEN
    base_username := 'usuario';
  END IF;

  user_suffix := left(replace(NEW.id::text, '-', ''), 6);
  generated_username := left(base_username, 13) || '_' || user_suffix;

  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (NEW.id, generated_username, NULL)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();


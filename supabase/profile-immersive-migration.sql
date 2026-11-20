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

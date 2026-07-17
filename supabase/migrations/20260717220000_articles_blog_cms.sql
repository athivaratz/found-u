-- Blog/Article CMS: TipTap JSON content, draft/publish, blog|help destination

CREATE TABLE public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  section text NOT NULL DEFAULT 'blog'
    CHECK (section IN ('blog', 'help')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  title text NOT NULL,
  excerpt text,
  cover_image_url text,
  author_name text,
  tags text[] NOT NULL DEFAULT '{}',
  content_json jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX articles_section_status_idx
  ON public.articles (section, status, published_at DESC);

CREATE INDEX articles_tags_idx
  ON public.articles USING gin (tags);

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.articles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO service_role;

-- Public can only read published articles
CREATE POLICY articles_select_published ON public.articles
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

-- Admins can do everything (including reading drafts)
CREATE POLICY articles_admin_all ON public.articles
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Public storage bucket for blog cover + inline images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-assets',
  'blog-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'blog_assets_public_read'
  ) THEN
    CREATE POLICY blog_assets_public_read
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'blog-assets');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'blog_assets_service_write'
  ) THEN
    CREATE POLICY blog_assets_service_write
      ON storage.objects FOR ALL
      TO service_role
      USING (bucket_id = 'blog-assets')
      WITH CHECK (bucket_id = 'blog-assets');
  END IF;
END $$;

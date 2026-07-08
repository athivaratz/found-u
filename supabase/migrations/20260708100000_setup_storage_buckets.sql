-- Setup wizard storage buckets (Module 4)
-- school-branding: wizard logo uploads
-- item-uploads: lost/found images when R2 is not configured

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'school-branding',
    'school-branding',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'item-uploads',
    'item-uploads',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  )
ON CONFLICT (id) DO NOTHING;

-- Public read for branding assets
CREATE POLICY school_branding_public_read
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'school-branding');

CREATE POLICY school_branding_service_write
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'school-branding')
  WITH CHECK (bucket_id = 'school-branding');

-- Public read for item images (lost/found)
CREATE POLICY item_uploads_public_read
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'item-uploads');

CREATE POLICY item_uploads_service_write
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'item-uploads')
  WITH CHECK (bucket_id = 'item-uploads');

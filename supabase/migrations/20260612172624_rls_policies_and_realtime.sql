-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_lookup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.found_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_off_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_found_reports ENABLE ROW LEVEL SECURITY;

-- Grants for API access
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lost_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.found_items TO authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT INSERT ON public.activity_logs TO authenticated;
GRANT INSERT ON public.error_logs TO authenticated;
GRANT INSERT ON public.ai_usage TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.nfc_tags TO authenticated;
GRANT INSERT, UPDATE ON public.nfc_found_reports TO authenticated;

-- profiles
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id AND role = 'user' AND is_student_verified = false);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (
    (auth.uid() = id AND role = (SELECT role FROM public.profiles p WHERE p.id = auth.uid())
     AND is_student_verified = (SELECT is_student_verified FROM public.profiles p WHERE p.id = auth.uid())
     AND (student_id IS NOT DISTINCT FROM (SELECT student_id FROM public.profiles p WHERE p.id = auth.uid())))
    OR public.is_admin()
  );
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated
  USING (public.is_admin());

-- student_accounts & passkey_lookup: no policies (deny all except service role)

-- admin_whitelist
CREATE POLICY admin_whitelist_all ON public.admin_whitelist FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- app_settings
CREATE POLICY app_settings_select ON public.app_settings FOR SELECT USING (true);
CREATE POLICY app_settings_write ON public.app_settings FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- lost_items
CREATE POLICY lost_items_select ON public.lost_items FOR SELECT USING (true);
CREATE POLICY lost_items_insert ON public.lost_items FOR INSERT TO authenticated
  WITH CHECK (status = 'searching' AND user_id = auth.uid());
CREATE POLICY lost_items_update ON public.lost_items FOR UPDATE TO authenticated
  USING (public.is_admin());
CREATE POLICY lost_items_delete ON public.lost_items FOR DELETE TO authenticated
  USING (public.is_admin());

-- found_items
CREATE POLICY found_items_select ON public.found_items FOR SELECT USING (true);
CREATE POLICY found_items_insert ON public.found_items FOR INSERT TO authenticated
  WITH CHECK (status = 'pending_room_confirm' AND user_id = auth.uid());
CREATE POLICY found_items_update ON public.found_items FOR UPDATE TO authenticated
  USING (public.is_admin());
CREATE POLICY found_items_delete ON public.found_items FOR DELETE TO authenticated
  USING (public.is_admin());

-- config tables
CREATE POLICY categories_select ON public.categories FOR SELECT USING (true);
CREATE POLICY categories_write ON public.categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY locations_select ON public.locations FOR SELECT USING (true);
CREATE POLICY locations_write ON public.locations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY contact_types_select ON public.contact_types FOR SELECT USING (true);
CREATE POLICY contact_types_write ON public.contact_types FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY drop_off_locations_select ON public.drop_off_locations FOR SELECT USING (true);
CREATE POLICY drop_off_locations_write ON public.drop_off_locations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- activity_logs
CREATE POLICY activity_logs_select ON public.activity_logs FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY activity_logs_insert ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- error_logs
CREATE POLICY error_logs_select ON public.error_logs FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY error_logs_insert ON public.error_logs FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY error_logs_update ON public.error_logs FOR UPDATE TO authenticated
  USING (public.is_admin());

-- ai_usage
CREATE POLICY ai_usage_select ON public.ai_usage FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());
CREATE POLICY ai_usage_insert ON public.ai_usage FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- nfc_tags
CREATE POLICY nfc_tags_select ON public.nfc_tags FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin());
CREATE POLICY nfc_tags_insert ON public.nfc_tags FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY nfc_tags_update ON public.nfc_tags FOR UPDATE TO authenticated
  USING ((owner_id = auth.uid()) OR public.is_admin());
CREATE POLICY nfc_tags_delete ON public.nfc_tags FOR DELETE TO authenticated
  USING (public.is_admin());

-- nfc_found_reports
CREATE POLICY nfc_found_reports_select ON public.nfc_found_reports FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR finder_user_id = auth.uid() OR public.is_admin());
CREATE POLICY nfc_found_reports_insert ON public.nfc_found_reports FOR INSERT TO authenticated
  WITH CHECK (finder_user_id = auth.uid());
CREATE POLICY nfc_found_reports_update ON public.nfc_found_reports FOR UPDATE TO authenticated
  USING ((owner_id = auth.uid()) OR public.is_admin());
CREATE POLICY nfc_found_reports_delete ON public.nfc_found_reports FOR DELETE TO authenticated
  USING (public.is_admin());

-- Realtime publication (best-effort: never abort hydration if Realtime is unavailable)
DO $$
DECLARE
  tbl text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'publication supabase_realtime does not exist — skipping realtime table adds';
    RETURN;
  END IF;

  FOREACH tbl IN ARRAY ARRAY[
    'public.lost_items',
    'public.found_items',
    'public.profiles',
    'public.categories',
    'public.locations',
    'public.contact_types',
    'public.nfc_tags',
    'public.nfc_found_reports',
    'public.ai_usage',
    'public.app_settings'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', tbl);
    EXCEPTION
      WHEN duplicate_object THEN
        NULL; -- already in publication
      WHEN undefined_table THEN
        RAISE NOTICE 'skip realtime add for missing table %', tbl;
      WHEN OTHERS THEN
        RAISE NOTICE 'skip realtime add for %: %', tbl, SQLERRM;
    END;
  END LOOP;
END $$;

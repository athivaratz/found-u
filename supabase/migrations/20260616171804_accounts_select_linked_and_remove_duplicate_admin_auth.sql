-- Allow authenticated users to read their account via linked_uid
CREATE POLICY accounts_select_linked ON public.accounts
  FOR SELECT TO authenticated
  USING (linked_uid = auth.uid());

-- Remove duplicate auth user for student 11111 (legacy bodin2 domain)
DELETE FROM auth.users
WHERE id = '92af58ed-1c5e-4b37-abfb-6297ac330ef3'
  AND email = '11111@students.foundu.bodin2.ac.th';;

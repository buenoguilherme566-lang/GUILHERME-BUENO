-- ============================================================================
-- SCRIPT FASE 2: POLÍTICAS RLS RESTRITIVAS (SUPABASE AUTH + RBAC POR OFICINA)
-- ============================================================================
-- IMPORTANTE: Execute este script SOMENTE DEPOIS de:
--   1. Executar o Script Base (supabase_schema.sql) no SQL Editor
--   2. Publicar a Edge Function "manage-auth-users" no Supabase
--   3. Fazer login ao menos 1 vez como Administrador na nova versão publicada
--      (isso vincula sua conta ao Supabase Auth antes de fechar o acesso anônimo)
-- ============================================================================

-- 1. Funções auxiliares SECURITY DEFINER (evitam recursão infinita em políticas RLS)

CREATE OR REPLACE FUNCTION public.app_is_any_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u."authUserId" = auth.uid()
      AND UPPER(COALESCE(u.role, '')) ~ '(STOCK|ADMIN|ESTOQ|GERENTE|MASTER|OWNER)'
  );
$$;

CREATE OR REPLACE FUNCTION public.app_is_staff_in_tenant(p_tenant_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u."authUserId" = auth.uid()
      AND COALESCE(u."tenantId", 'tenant_matriz_hps') = COALESCE(p_tenant_id, 'tenant_matriz_hps')
  );
$$;

CREATE OR REPLACE FUNCTION public.app_is_admin_in_tenant(p_tenant_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u."authUserId" = auth.uid()
      AND COALESCE(u."tenantId", 'tenant_matriz_hps') = COALESCE(p_tenant_id, 'tenant_matriz_hps')
      AND UPPER(COALESCE(u.role, '')) ~ '(STOCK|ADMIN|ESTOQ|GERENTE|MASTER|OWNER)'
  );
$$;

CREATE OR REPLACE FUNCTION public.app_client_id_for_auth()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.clients c
  WHERE c."authUserId" = auth.uid()
    AND COALESCE(c."isAccessActive", true) = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_client_tenant_for_auth()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(c."tenantId", 'tenant_matriz_hps')
  FROM public.clients c
  WHERE c."authUserId" = auth.uid()
    AND COALESCE(c."isAccessActive", true) = true
  LIMIT 1;
$$;

-- ============================================================================
-- 2. POLÍTICAS RLS RESTRITAS POR OFICINA E PERFIL (ONLY AUTHENTICATED)
-- ============================================================================

-- 2.1 TENANTS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de oficinas" ON tenants;
DROP POLICY IF EXISTS "Gestão de oficinas" ON tenants;
DROP POLICY IF EXISTS "tenants_select_auth" ON tenants;
DROP POLICY IF EXISTS "tenants_write_admin" ON tenants;

CREATE POLICY "tenants_select_auth" ON tenants
  FOR SELECT TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant(id)
    OR id = public.app_client_tenant_for_auth()
  );

CREATE POLICY "tenants_write_admin" ON tenants
  FOR ALL TO authenticated
  USING (public.app_is_any_admin())
  WITH CHECK (public.app_is_any_admin());

-- 2.2 TENANT_USERS
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestão de vínculos de oficina" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_select_auth" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_write_admin" ON tenant_users;

CREATE POLICY "tenant_users_select_auth" ON tenant_users
  FOR SELECT TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "tenant_users_write_admin" ON tenant_users
  FOR ALL TO authenticated
  USING (public.app_is_any_admin())
  WITH CHECK (public.app_is_any_admin());

-- 2.3 USERS (Equipe)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura pública de perfis" ON users;
DROP POLICY IF EXISTS "Inserção/Atualização restrita" ON users;
DROP POLICY IF EXISTS "Atualização restrita" ON users;
DROP POLICY IF EXISTS "Gestão de usuários" ON users;
DROP POLICY IF EXISTS "users_select_staff" ON users;
DROP POLICY IF EXISTS "users_write_admin" ON users;

CREATE POLICY "users_select_staff" ON users
  FOR SELECT TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "users_write_admin" ON users
  FOR ALL TO authenticated
  USING (public.app_is_any_admin())
  WITH CHECK (public.app_is_any_admin());

-- 2.4 ITEMS (Estoque)
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de inventário" ON items;
DROP POLICY IF EXISTS "Modificação de inventário" ON items;
DROP POLICY IF EXISTS "Atualização de inventário" ON items;
DROP POLICY IF EXISTS "Gestão de inventário" ON items;
DROP POLICY IF EXISTS "Gestão de estoque" ON items;
DROP POLICY IF EXISTS "items_select_auth" ON items;
DROP POLICY IF EXISTS "items_insert_staff" ON items;
DROP POLICY IF EXISTS "items_update_staff" ON items;
DROP POLICY IF EXISTS "items_delete_admin" ON items;

CREATE POLICY "items_select_auth" ON items
  FOR SELECT TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
    OR "tenantId" = public.app_client_tenant_for_auth()
  );

CREATE POLICY "items_insert_staff" ON items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "items_update_staff" ON items
  FOR UPDATE TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  )
  WITH CHECK (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "items_delete_admin" ON items
  FOR DELETE TO authenticated
  USING (public.app_is_any_admin());

-- 2.5 HISTORY (Movimentações)
ALTER TABLE history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de logs" ON history;
DROP POLICY IF EXISTS "Inserção de logs" ON history;
DROP POLICY IF EXISTS "Gestão de logs" ON history;
DROP POLICY IF EXISTS "Gestão de histórico" ON history;
DROP POLICY IF EXISTS "history_select_staff" ON history;
DROP POLICY IF EXISTS "history_insert_staff" ON history;
DROP POLICY IF EXISTS "history_admin_manage" ON history;

CREATE POLICY "history_select_staff" ON history
  FOR SELECT TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "history_insert_staff" ON history
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "history_admin_manage" ON history
  FOR UPDATE TO authenticated
  USING (public.app_is_any_admin())
  WITH CHECK (public.app_is_any_admin());

DROP POLICY IF EXISTS "history_admin_delete" ON history;
CREATE POLICY "history_admin_delete" ON history
  FOR DELETE TO authenticated
  USING (public.app_is_any_admin());

-- 2.6 SERVICE_ORDERS (Ordens de Serviço)
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de OS" ON service_orders;
DROP POLICY IF EXISTS "Gestão de OS" ON service_orders;
DROP POLICY IF EXISTS "Atualização de OS" ON service_orders;
DROP POLICY IF EXISTS "Gestão de ordens de serviço" ON service_orders;
DROP POLICY IF EXISTS "os_select_staff" ON service_orders;
DROP POLICY IF EXISTS "os_insert_staff" ON service_orders;
DROP POLICY IF EXISTS "os_update_staff" ON service_orders;
DROP POLICY IF EXISTS "os_delete_admin" ON service_orders;

CREATE POLICY "os_select_staff" ON service_orders
  FOR SELECT TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "os_insert_staff" ON service_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "os_update_staff" ON service_orders
  FOR UPDATE TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  )
  WITH CHECK (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "os_delete_admin" ON service_orders
  FOR DELETE TO authenticated
  USING (public.app_is_any_admin());

-- 2.7 VEHICLE_SECTIONS
ALTER TABLE vehicle_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de seções" ON vehicle_sections;
DROP POLICY IF EXISTS "Gestão de seções" ON vehicle_sections;
DROP POLICY IF EXISTS "sections_select_staff" ON vehicle_sections;
DROP POLICY IF EXISTS "sections_write_admin" ON vehicle_sections;

CREATE POLICY "sections_select_staff" ON vehicle_sections
  FOR SELECT TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "sections_write_admin" ON vehicle_sections
  FOR ALL TO authenticated
  USING (public.app_is_any_admin())
  WITH CHECK (public.app_is_any_admin());

-- 2.8 LABOR_TEMPLATES
ALTER TABLE labor_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de modelos" ON labor_templates;
DROP POLICY IF EXISTS "Gestão de modelos" ON labor_templates;
DROP POLICY IF EXISTS "labor_select_staff" ON labor_templates;
DROP POLICY IF EXISTS "labor_write_admin" ON labor_templates;

CREATE POLICY "labor_select_staff" ON labor_templates
  FOR SELECT TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "labor_write_admin" ON labor_templates
  FOR ALL TO authenticated
  USING (public.app_is_any_admin())
  WITH CHECK (public.app_is_any_admin());

-- 2.9 CLIENTS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de clientes" ON clients;
DROP POLICY IF EXISTS "Gestão de clientes" ON clients;
DROP POLICY IF EXISTS "clients_select_auth" ON clients;
DROP POLICY IF EXISTS "clients_insert_staff" ON clients;
DROP POLICY IF EXISTS "clients_update_staff" ON clients;
DROP POLICY IF EXISTS "clients_delete_admin" ON clients;

CREATE POLICY "clients_select_auth" ON clients
  FOR SELECT TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
    OR id = public.app_client_id_for_auth()
  );

CREATE POLICY "clients_insert_staff" ON clients
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "clients_update_staff" ON clients
  FOR UPDATE TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  )
  WITH CHECK (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "clients_delete_admin" ON clients
  FOR DELETE TO authenticated
  USING (public.app_is_any_admin());

-- 2.10 CLIENT_MIRROR_ACCESS_LOGS
ALTER TABLE client_mirror_access_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Logs de acesso ao espelho" ON client_mirror_access_logs;
DROP POLICY IF EXISTS "mirror_logs_select_staff" ON client_mirror_access_logs;
DROP POLICY IF EXISTS "mirror_logs_insert_auth" ON client_mirror_access_logs;

CREATE POLICY "mirror_logs_select_staff" ON client_mirror_access_logs
  FOR SELECT TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "mirror_logs_insert_auth" ON client_mirror_access_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
    OR "clientId" = public.app_client_id_for_auth()
  );

-- 2.11 UTV_PASSPORTS
ALTER TABLE utv_passports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de passaportes UTV" ON utv_passports;
DROP POLICY IF EXISTS "Gestão de passaportes UTV" ON utv_passports;
DROP POLICY IF EXISTS "passports_select_auth" ON utv_passports;
DROP POLICY IF EXISTS "passports_insert_staff" ON utv_passports;
DROP POLICY IF EXISTS "passports_update_staff" ON utv_passports;
DROP POLICY IF EXISTS "passports_delete_admin" ON utv_passports;

CREATE POLICY "passports_select_auth" ON utv_passports
  FOR SELECT TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
    OR "clientId" = public.app_client_id_for_auth()
  );

CREATE POLICY "passports_insert_staff" ON utv_passports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "passports_update_staff" ON utv_passports
  FOR UPDATE TO authenticated
  USING (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  )
  WITH CHECK (
    public.app_is_any_admin()
    OR public.app_is_staff_in_tenant("tenantId")
  );

CREATE POLICY "passports_delete_admin" ON utv_passports
  FOR DELETE TO authenticated
  USING (public.app_is_any_admin());

-- Atualizar schema cache do PostgREST
NOTIFY pgrst, 'reload schema';

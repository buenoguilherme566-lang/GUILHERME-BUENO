-- ============================================================================
-- SCRIPT MASTER DEFINITIVO DE BANCO DE DADOS — HPS CONTROL (SUPABASE / POSTGRESQL)
-- Execute no SQL Editor do seu painel Supabase (app.supabase.com) e clique em RUN
-- Seguro para reexecução (Idempotente: CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================================

-- 0. Habilitar extensão de criptografia para senhas de funcionários
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. CRIAÇÃO DAS 11 TABELAS DO SISTEMA
-- ============================================================================

-- 1.1 Oficinas / Empresas (Multi-Tenant)
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "corporateName" TEXT,
    cnpj TEXT,
    phone TEXT,
    email TEXT,
    subtitle TEXT,
    address JSONB DEFAULT '{}'::jsonb,
    "logoUrl" TEXT,
    "defaultHourlyRate" NUMERIC DEFAULT 150,
    "printSettings" JSONB DEFAULT '{}'::jsonb,
    plan TEXT DEFAULT 'pro',
    status TEXT DEFAULT 'active',
    "createdAt" TEXT NOT NULL
);

-- 1.2 Vínculo de Usuários e Oficinas (RBAC)
CREATE TABLE IF NOT EXISTS tenant_users (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'OWNER',
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TEXT NOT NULL,
    UNIQUE("tenantId", "userId")
);

-- 1.3 Usuários (Equipe / Mecânicos / Administradores)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'MECHANIC',
    email TEXT,
    "avatarUrl" TEXT,
    password TEXT,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps',
    "authUserId" UUID,
    "authEmail" TEXT
);

-- 1.4 Itens de Estoque / Inventário
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    "partNumber" TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'OUTROS',
    "boxNumber" TEXT NOT NULL DEFAULT 'S/N',
    quantity NUMERIC DEFAULT 0,
    "minQuantity" NUMERIC DEFAULT 0,
    value NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'un',
    "entryDate" TEXT,
    description TEXT,
    "sectionId" TEXT,
    "laborTemplateId" TEXT,
    "linkedQRCode" TEXT,
    "imageUrl" TEXT,
    observations TEXT,
    "purchaseHistory" JSONB DEFAULT '[]'::jsonb,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps'
);

-- 1.5 Histórico de Movimentações / Auditoria de Estoque
CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "partNumber" TEXT,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    type TEXT NOT NULL,
    quantity NUMERIC DEFAULT 0,
    "unitValue" NUMERIC DEFAULT 0,
    "originalUnitValue" NUMERIC,
    "discountValue" NUMERIC DEFAULT 0,
    "discountPercentage" NUMERIC DEFAULT 0,
    date TEXT NOT NULL,
    destination TEXT,
    "osNumber" TEXT,
    "recipientName" TEXT,
    "mechanicId" TEXT,
    notes TEXT,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps'
);

-- 1.6 Ordens de Serviço (Abertas e Arquivadas/Finalizadas com Auditoria)
CREATE TABLE IF NOT EXISTS service_orders (
    id TEXT PRIMARY KEY,
    "osNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "clientId" TEXT,
    "vehicleId" TEXT,
    "mechanicId" TEXT,
    "mechanicName" TEXT,
    "passportId" TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    parts JSONB DEFAULT '[]'::jsonb,
    "laborItems" JSONB DEFAULT '[]'::jsonb,
    observations TEXT,
    notes TEXT,
    "stockDeducted" BOOLEAN DEFAULT false,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "completedAt" TEXT,
    "completedBy" TEXT,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps'
);

-- 1.7 Setores / Repartições do Veículo
CREATE TABLE IF NOT EXISTS vehicle_sections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    components JSONB DEFAULT '[]'::jsonb,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps'
);

-- 1.8 Catálogo de Mãos de Obra (Templates)
CREATE TABLE IF NOT EXISTS labor_templates (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    "defaultHours" NUMERIC DEFAULT 0,
    "defaultValuePerHour" NUMERIC DEFAULT 0,
    "sectionId" TEXT,
    "linkedItemIds" JSONB DEFAULT '[]'::jsonb,
    "pricingType" TEXT DEFAULT 'hourly',
    "fixedValue" NUMERIC DEFAULT 0,
    "minutes" NUMERIC DEFAULT 0,
    "linkedTemplateId" TEXT,
    "discountPercentage" NUMERIC DEFAULT 0,
    "discountValue" NUMERIC DEFAULT 0,
    "sharedNotes" TEXT,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps'
);

-- 1.9 Clientes e Frota (com Credenciais de Login Travado para Espelho do Cliente)
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cpf TEXT,
    phone TEXT,
    email TEXT,
    username TEXT,
    password TEXT,
    "isAccessActive" BOOLEAN DEFAULT true,
    vehicles JSONB DEFAULT '[]'::jsonb,
    "createdAt" TEXT NOT NULL,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps',
    "authUserId" UUID,
    "authEmail" TEXT
);

-- 1.10 Logs de Auditoria de Acesso ao Espelho do Cliente
CREATE TABLE IF NOT EXISTS client_mirror_access_logs (
    id TEXT PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "passportId" TEXT,
    "accessedAt" TEXT NOT NULL,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps'
);

-- 1.11 Passaportes UTV (Competição, Triagem QR e Manutenção Preventiva por KM)
CREATE TABLE IF NOT EXISTS utv_passports (
    id TEXT PRIMARY KEY,
    "qrCode" TEXT UNIQUE NOT NULL,
    "vehicleNumber" TEXT,
    "vehicleModel" TEXT NOT NULL,
    "chassisOrPlate" TEXT,
    "clientId" TEXT,
    "vehicleId" TEXT,
    "customerName" TEXT NOT NULL,
    "currentKm" NUMERIC DEFAULT 0,
    "lastMaintenanceSummary" TEXT,
    "lastMaintenanceDate" TEXT,
    "nextCompetitionPlan" TEXT,
    "carStatus" TEXT DEFAULT 'READY',
    "maintenanceItems" JSONB DEFAULT '[]'::jsonb,
    competitions JSONB DEFAULT '[]'::jsonb,
    "triageHistory" JSONB DEFAULT '[]'::jsonb,
    "activeTriage" JSONB,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps'
);

-- ============================================================================
-- 2. MIGRAÇÃO DE COLUNAS FALTANTES EM BASES JÁ EXISTENTES (ANTES DO SEED!)
-- ============================================================================

-- tenants
ALTER TABLE IF EXISTS tenants ADD COLUMN IF NOT EXISTS "corporateName" TEXT;
ALTER TABLE IF EXISTS tenants ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE IF EXISTS tenants ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE IF EXISTS tenants ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS tenants ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE IF EXISTS tenants ADD COLUMN IF NOT EXISTS address JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS tenants ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE IF EXISTS tenants ADD COLUMN IF NOT EXISTS "defaultHourlyRate" NUMERIC DEFAULT 150;
ALTER TABLE IF EXISTS tenants ADD COLUMN IF NOT EXISTS "printSettings" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS tenants ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'pro';
ALTER TABLE IF EXISTS tenants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- ============================================================================
-- 3. OFICINA PADRÃO MATRIZ (SEED INICIAL SEGURO)
-- ============================================================================
INSERT INTO tenants (id, name, "corporateName", cnpj, phone, email, subtitle, "defaultHourlyRate", "printSettings", "createdAt")
VALUES (
    'tenant_matriz_hps',
    'HPS Control Matriz',
    'HPS Motores e Preparações Especiais Ltda',
    '12.345.678/0001-90',
    '(11) 98765-4321',
    'contato@hpscontrol.com',
    'BRP Especialista • Centro Técnico de Oficina & Preparação',
    150,
    '{"warrantyTerms":"Garantia legal de 90 dias para serviços executados e peças genuínas conforme Art. 26 do CDC.","footerMessage":"Documento oficial para prestação de contas e auditoria.","showLogo":true}'::jsonb,
    NOW()::text
)
ON CONFLICT (id) DO NOTHING;

-- Demais colunas em bases já existentes

-- users
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "authUserId" UUID;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "authEmail" TEXT;

-- items
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "minQuantity" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS value NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'un';
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "entryDate" TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "linkedQRCode" TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS observations TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "sectionId" TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "laborTemplateId" TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "purchaseHistory" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';

-- history
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "unitValue" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "originalUnitValue" NUMERIC;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "discountValue" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "discountPercentage" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS destination TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "osNumber" TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "partNumber" TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "recipientName" TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "mechanicId" TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';

-- Permitir userId nulo em registros legados
DO $$ BEGIN
    ALTER TABLE history ALTER COLUMN "userId" DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- service_orders (incluindo Arquivamento/Finalização e Auditoria)
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS "vehicleId" TEXT;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS "mechanicId" TEXT;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS "mechanicName" TEXT;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS "passportId" TEXT;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'OPEN';
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS parts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS "laborItems" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS observations TEXT;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS "stockDeducted" BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS "createdAt" TEXT;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS "updatedAt" TEXT;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS "completedAt" TEXT;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS "completedBy" TEXT;
ALTER TABLE IF EXISTS service_orders ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';

-- Remover restrição global de osNumber para permitir sequencial independente por oficina
DO $$ BEGIN
    ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_osNumber_key;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- clients (incluindo Login e Senha travados para o Espelho do Cliente)
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS "isAccessActive" BOOLEAN DEFAULT true;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS vehicles JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS "authUserId" UUID;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS "authEmail" TEXT;

-- vehicle_sections
ALTER TABLE IF EXISTS vehicle_sections ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';

-- labor_templates
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "linkedItemIds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "pricingType" TEXT DEFAULT 'hourly';
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "fixedValue" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "minutes" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "linkedTemplateId" TEXT;
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "discountPercentage" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "discountValue" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "sharedNotes" TEXT;

-- utv_passports
ALTER TABLE IF EXISTS utv_passports ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';
ALTER TABLE IF EXISTS utv_passports ADD COLUMN IF NOT EXISTS "activeTriage" JSONB;
ALTER TABLE IF EXISTS utv_passports ADD COLUMN IF NOT EXISTS "triageHistory" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS utv_passports ADD COLUMN IF NOT EXISTS "maintenanceItems" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS utv_passports ADD COLUMN IF NOT EXISTS competitions JSONB DEFAULT '[]'::jsonb;

-- ============================================================================
-- 4. CONVERSÃO SEGURA DE COLUNAS PARA NUMERIC (DECIMAIS DE LITROS/ML E VALORES R$)
-- ============================================================================
DO $$ BEGIN ALTER TABLE tenants ALTER COLUMN "defaultHourlyRate" TYPE NUMERIC USING "defaultHourlyRate"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE items ALTER COLUMN quantity TYPE NUMERIC USING quantity::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE items ALTER COLUMN "minQuantity" TYPE NUMERIC USING "minQuantity"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE items ALTER COLUMN value TYPE NUMERIC USING value::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE history ALTER COLUMN quantity TYPE NUMERIC USING quantity::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE history ALTER COLUMN "unitValue" TYPE NUMERIC USING "unitValue"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE history ALTER COLUMN "originalUnitValue" TYPE NUMERIC USING "originalUnitValue"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE history ALTER COLUMN "discountValue" TYPE NUMERIC USING "discountValue"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE history ALTER COLUMN "discountPercentage" TYPE NUMERIC USING "discountPercentage"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE labor_templates ALTER COLUMN "defaultHours" TYPE NUMERIC USING "defaultHours"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE labor_templates ALTER COLUMN "defaultValuePerHour" TYPE NUMERIC USING "defaultValuePerHour"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE labor_templates ALTER COLUMN "fixedValue" TYPE NUMERIC USING "fixedValue"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE labor_templates ALTER COLUMN "minutes" TYPE NUMERIC USING "minutes"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE labor_templates ALTER COLUMN "discountPercentage" TYPE NUMERIC USING "discountPercentage"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE labor_templates ALTER COLUMN "discountValue" TYPE NUMERIC USING "discountValue"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE utv_passports ALTER COLUMN "currentKm" TYPE NUMERIC USING "currentKm"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Preencher tenantId nulo em registros legados
UPDATE users SET "tenantId" = 'tenant_matriz_hps' WHERE "tenantId" IS NULL;
UPDATE items SET "tenantId" = 'tenant_matriz_hps' WHERE "tenantId" IS NULL;
UPDATE history SET "tenantId" = 'tenant_matriz_hps' WHERE "tenantId" IS NULL;
UPDATE service_orders SET "tenantId" = 'tenant_matriz_hps' WHERE "tenantId" IS NULL;
UPDATE vehicle_sections SET "tenantId" = 'tenant_matriz_hps' WHERE "tenantId" IS NULL;
UPDATE labor_templates SET "tenantId" = 'tenant_matriz_hps' WHERE "tenantId" IS NULL;
UPDATE clients SET "tenantId" = 'tenant_matriz_hps' WHERE "tenantId" IS NULL;
UPDATE utv_passports SET "tenantId" = 'tenant_matriz_hps' WHERE "tenantId" IS NULL;

-- ============================================================================
-- 5. ÍNDICES DE PERFORMANCE E FILTRAGEM
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users("tenantId");
CREATE INDEX IF NOT EXISTS idx_items_tenant ON items("tenantId");
CREATE INDEX IF NOT EXISTS idx_history_tenant ON history("tenantId");
CREATE INDEX IF NOT EXISTS idx_service_orders_tenant ON service_orders("tenantId");
CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders(status);
CREATE INDEX IF NOT EXISTS idx_service_orders_os_number ON service_orders("osNumber");
CREATE INDEX IF NOT EXISTS idx_service_orders_customer_name ON service_orders("customerName");
CREATE INDEX IF NOT EXISTS idx_vehicle_sections_tenant ON vehicle_sections("tenantId");
CREATE INDEX IF NOT EXISTS idx_labor_templates_tenant ON labor_templates("tenantId");
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients("tenantId");
CREATE INDEX IF NOT EXISTS idx_clients_username ON clients(username);
CREATE INDEX IF NOT EXISTS idx_utv_passports_tenant ON utv_passports("tenantId");
CREATE INDEX IF NOT EXISTS idx_client_mirror_logs_client ON client_mirror_access_logs("clientId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id ON users("authUserId") WHERE "authUserId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_auth_user_id ON clients("authUserId") WHERE "authUserId" IS NOT NULL;

-- ============================================================================
-- 6. SEGURANÇA, HASHING DE SENHAS E FUNÇÕES RPC (EQUIPE + ESPELHO DO CLIENTE)
-- ============================================================================

-- Impedir leitura direta da coluna password da tabela users por clientes anônimos mantendo permissões de upsert
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
REVOKE SELECT ON users FROM anon, authenticated;
REVOKE SELECT (password) ON users FROM anon, authenticated;
GRANT SELECT (id, username, name, role, email, "avatarUrl", "tenantId", "authUserId", "authEmail"), INSERT, UPDATE, DELETE ON users TO anon, authenticated;

-- Gatilho para hashing automático de senhas de funcionários (bcrypt)
CREATE OR REPLACE FUNCTION hash_user_password()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.password IS NOT NULL AND NEW.password <> '' AND (TG_OP = 'INSERT' OR NEW.password IS DISTINCT FROM OLD.password) AND NEW.password NOT LIKE '$2a$%' AND NEW.password NOT LIKE '$2b$%' THEN
        NEW.password := crypt(NEW.password, gen_salt('bf', 8));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_hash_password ON users;
CREATE TRIGGER trg_hash_password
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION hash_user_password();

-- Criptografar automaticamente quaisquer senhas legadas em texto puro na tabela users
UPDATE users
SET password = crypt(password, gen_salt('bf', 8))
WHERE password IS NOT NULL
  AND password <> ''
  AND password NOT LIKE '$2a$%'
  AND password NOT LIKE '$2b$%';

-- RPC 1: Autenticação segura da Equipe (Admin / Estoque / Mecânicos)
DROP FUNCTION IF EXISTS login_user(TEXT, TEXT);
CREATE OR REPLACE FUNCTION login_user(p_username TEXT, p_password TEXT)
RETURNS TABLE (
    id TEXT,
    username TEXT,
    email TEXT,
    name TEXT,
    role TEXT,
    "avatarUrl" TEXT,
    "tenantId" TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.username, u.email, u.name, u.role, u."avatarUrl", COALESCE(u."tenantId", 'tenant_matriz_hps')
    FROM users u
    WHERE LOWER(TRIM(u.username)) = LOWER(TRIM(p_username))
      AND (
          u.password = crypt(p_password, u.password)
          OR u.password = p_password
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 2: Autenticação exclusiva de Clientes (Acesso Travado ao Espelho do UTV)
DROP FUNCTION IF EXISTS authenticate_client_mirror(TEXT, TEXT);
CREATE OR REPLACE FUNCTION authenticate_client_mirror(p_username TEXT, p_password TEXT)
RETURNS SETOF clients
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT *
  FROM clients
  WHERE LOWER(TRIM(username)) = LOWER(TRIM(p_username))
    AND password = p_password
    AND COALESCE("isAccessActive", true) = true
  LIMIT 1;
$$;

-- RPC 3: Perfil autenticado via Supabase Auth (auth.uid())
DROP FUNCTION IF EXISTS get_my_app_profile();
CREATE OR REPLACE FUNCTION get_my_app_profile()
RETURNS TABLE (
    "accountType" TEXT,
    id TEXT,
    username TEXT,
    name TEXT,
    role TEXT,
    email TEXT,
    "avatarUrl" TEXT,
    "tenantId" TEXT,
    "clientId" TEXT,
    "isAccessActive" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        'STAFF'::text,
        u.id,
        u.username,
        u.name,
        u.role,
        u.email,
        u."avatarUrl",
        COALESCE(u."tenantId", 'tenant_matriz_hps'),
        NULL::text,
        true
    FROM public.users u
    WHERE u."authUserId" = auth.uid()
    LIMIT 1;

    IF FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        'CLIENT'::text,
        c.id,
        COALESCE(c.username, c.id),
        c.name,
        'CLIENT'::text,
        c.email,
        NULL::text,
        COALESCE(c."tenantId", 'tenant_matriz_hps'),
        c.id,
        COALESCE(c."isAccessActive", true)
    FROM public.clients c
    WHERE c."authUserId" = auth.uid()
    LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION get_my_app_profile() TO authenticated;

-- RPC 4: Resolver e-mail de login no Supabase Auth a partir do usuário curto (somente usuários já migrados)
DROP FUNCTION IF EXISTS resolve_auth_login(TEXT);
CREATE OR REPLACE FUNCTION resolve_auth_login(p_identifier TEXT)
RETURNS TABLE (
    "authEmail" TEXT,
    "accountType" TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    clean_id TEXT := LOWER(TRIM(COALESCE(p_identifier, '')));
BEGIN
    IF clean_id = '' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT u."authEmail", 'STAFF'::text
    FROM public.users u
    WHERE u."authUserId" IS NOT NULL
      AND u."authEmail" IS NOT NULL
      AND (LOWER(TRIM(u.username)) = clean_id OR (clean_id LIKE '%@%' AND LOWER(TRIM(COALESCE(u.email, ''))) = clean_id))
    LIMIT 1;

    IF FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT c."authEmail", 'CLIENT'::text
    FROM public.clients c
    WHERE c."authUserId" IS NOT NULL
      AND c."authEmail" IS NOT NULL
      AND COALESCE(c."isAccessActive", true) = true
      AND (LOWER(TRIM(COALESCE(c.username, ''))) = clean_id OR (clean_id LIKE '%@%' AND LOWER(TRIM(COALESCE(c.email, ''))) = clean_id))
    LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION resolve_auth_login(TEXT) TO anon, authenticated;

-- RPC 5: Pré-visualização pública segura do cabeçalho do Passaporte UTV (para tela de login via QR)
DROP FUNCTION IF EXISTS get_public_utv_passport_preview(TEXT);
CREATE OR REPLACE FUNCTION get_public_utv_passport_preview(p_id_or_qr TEXT)
RETURNS TABLE (
    id TEXT,
    "qrCode" TEXT,
    "vehicleNumber" TEXT,
    "vehicleModel" TEXT,
    "customerName" TEXT,
    "tenantId" TEXT,
    "tenantName" TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        p.id,
        p."qrCode",
        p."vehicleNumber",
        p."vehicleModel",
        p."customerName",
        COALESCE(p."tenantId", 'tenant_matriz_hps'),
        t.name
    FROM public.utv_passports p
    LEFT JOIN public.tenants t ON t.id = COALESCE(p."tenantId", 'tenant_matriz_hps')
    WHERE p.id = TRIM(COALESCE(p_id_or_qr, ''))
       OR UPPER(p."qrCode") = UPPER(TRIM(COALESCE(p_id_or_qr, '')))
    LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_public_utv_passport_preview(TEXT) TO anon, authenticated;

-- ============================================================================
-- 7. POLÍTICAS RLS (ROW LEVEL SECURITY) PARA TODAS AS 11 TABELAS
-- ============================================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de oficinas" ON tenants;
DROP POLICY IF EXISTS "Gestão de oficinas" ON tenants;
CREATE POLICY "Gestão de oficinas" ON tenants FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestão de vínculos de oficina" ON tenant_users;
CREATE POLICY "Gestão de vínculos de oficina" ON tenant_users FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura pública de perfis" ON users;
DROP POLICY IF EXISTS "Inserção/Atualização restrita" ON users;
DROP POLICY IF EXISTS "Atualização restrita" ON users;
DROP POLICY IF EXISTS "Gestão de usuários" ON users;
CREATE POLICY "Gestão de usuários" ON users FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de inventário" ON items;
DROP POLICY IF EXISTS "Modificação de inventário" ON items;
DROP POLICY IF EXISTS "Atualização de inventário" ON items;
DROP POLICY IF EXISTS "Gestão de inventário" ON items;
DROP POLICY IF EXISTS "Gestão de estoque" ON items;
CREATE POLICY "Gestão de estoque" ON items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de logs" ON history;
DROP POLICY IF EXISTS "Inserção de logs" ON history;
DROP POLICY IF EXISTS "Gestão de logs" ON history;
DROP POLICY IF EXISTS "Gestão de histórico" ON history;
CREATE POLICY "Gestão de histórico" ON history FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de OS" ON service_orders;
DROP POLICY IF EXISTS "Gestão de OS" ON service_orders;
DROP POLICY IF EXISTS "Atualização de OS" ON service_orders;
DROP POLICY IF EXISTS "Gestão de ordens de serviço" ON service_orders;
CREATE POLICY "Gestão de ordens de serviço" ON service_orders FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE vehicle_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de seções" ON vehicle_sections;
DROP POLICY IF EXISTS "Gestão de seções" ON vehicle_sections;
CREATE POLICY "Gestão de seções" ON vehicle_sections FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE labor_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de modelos" ON labor_templates;
DROP POLICY IF EXISTS "Gestão de modelos" ON labor_templates;
CREATE POLICY "Gestão de modelos" ON labor_templates FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de clientes" ON clients;
DROP POLICY IF EXISTS "Gestão de clientes" ON clients;
CREATE POLICY "Gestão de clientes" ON clients FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE client_mirror_access_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Logs de acesso ao espelho" ON client_mirror_access_logs;
CREATE POLICY "Logs de acesso ao espelho" ON client_mirror_access_logs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE utv_passports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de passaportes UTV" ON utv_passports;
DROP POLICY IF EXISTS "Gestão de passaportes UTV" ON utv_passports;
CREATE POLICY "Gestão de passaportes UTV" ON utv_passports FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 8. ATUALIZAR SCHEMA CACHE DO POSTGREST IMEDIATAMENTE
-- ============================================================================
NOTIFY pgrst, 'reload schema';

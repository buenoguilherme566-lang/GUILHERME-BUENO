import { supabase } from '../lib/supabase';
import { User, UserRole, InventoryItem, Transaction, ServiceOrder, VehicleSection, LaborTemplate, Client, Tenant, UTVPassport } from '../types';

const getClient = () => {
  if (!supabase) {
    throw new Error('Supabase client is not initialized. Please check your environment variables.');
  }
  return supabase;
};

// Helper para remover campos undefined que causam erros no PostgREST
const cleanPayload = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(cleanPayload);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, cleanPayload(v)])
    );
  }
  return obj;
};

// Registro em memória de erros por tabela e tabelas ausentes
const missingTables = new Set<string>();
const tableErrors = new Map<string, string>();

export const isTableMissingError = (error: any): boolean => {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '');
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('could not find the table') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  );
};

export const isRlsError = (error: any): boolean => {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  return msg.includes('row-level security');
};

// Normaliza campos obrigatórios (NOT NULL no Postgres) para impedir erro 23502 com dados legados
const normalizeRowForTable = (tableName: string, row: any): any => {
  if (!row || typeof row !== 'object') return row;
  const nowIso = new Date().toISOString();
  const copy = { ...row };

  if (tableName === 'tenants') {
    if (!copy.name) copy.name = 'HPS Control Matriz';
    if (!copy.createdAt) copy.createdAt = nowIso;
  } else if (tableName === 'users') {
    if (!copy.username) copy.username = copy.id || `user_${Math.random().toString(36).slice(2, 7)}`;
    if (!copy.name) copy.name = copy.username;
    if (!copy.role) copy.role = 'MECHANIC';
    if (copy.password === '' || copy.password === null) delete copy.password;
  } else if (tableName === 'items') {
    if (copy.partNumber === undefined || copy.partNumber === null) copy.partNumber = 'S/N';
    if (!copy.name) copy.name = 'Peça sem nome';
    if (!copy.category) copy.category = 'Outros';
    if (copy.boxNumber === undefined || copy.boxNumber === null) copy.boxNumber = 'S/N';
    if (copy.quantity === undefined || copy.quantity === null || Number.isNaN(Number(copy.quantity))) copy.quantity = 0;
    if (copy.minQuantity === undefined || copy.minQuantity === null || Number.isNaN(Number(copy.minQuantity))) copy.minQuantity = 0;
    if (copy.value === undefined || copy.value === null || Number.isNaN(Number(copy.value))) copy.value = 0;
  } else if (tableName === 'history') {
    if (!copy.itemId) copy.itemId = 'unknown_item';
    if (!copy.itemName) copy.itemName = 'Item';
    if (!copy.userName) copy.userName = 'Sistema';
    if (!copy.type) copy.type = 'OUT';
    if (!copy.date) copy.date = nowIso;
    if (copy.quantity === undefined || copy.quantity === null || Number.isNaN(Number(copy.quantity))) copy.quantity = 0;
  } else if (tableName === 'service_orders') {
    if (!copy.osNumber) copy.osNumber = copy.id || 'OS-000';
    if (!copy.customerName) copy.customerName = 'Cliente';
    if (!copy.vehicleModel) copy.vehicleModel = 'UTV';
    if (!copy.status) copy.status = 'OPEN';
    if (!copy.createdAt) copy.createdAt = nowIso;
    if (!copy.updatedAt) copy.updatedAt = copy.createdAt || nowIso;
    if (!Array.isArray(copy.parts)) copy.parts = [];
    if (!Array.isArray(copy.laborItems)) copy.laborItems = [];
  } else if (tableName === 'vehicle_sections') {
    if (!copy.name) copy.name = 'Setor';
    if (!Array.isArray(copy.components)) copy.components = [];
  } else if (tableName === 'labor_templates') {
    if (!copy.description) copy.description = 'Serviço';
  } else if (tableName === 'clients') {
    if (!copy.name) copy.name = 'Cliente';
    if (!copy.createdAt) copy.createdAt = nowIso;
    if (!Array.isArray(copy.vehicles)) copy.vehicles = [];
  } else if (tableName === 'utv_passports') {
    if (!copy.qrCode) copy.qrCode = `UTV-${copy.id || Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    if (!copy.vehicleModel) copy.vehicleModel = 'Can-Am UTV';
    if (!copy.customerName) copy.customerName = 'Cliente';
    if (!copy.createdAt) copy.createdAt = nowIso;
    if (!copy.updatedAt) copy.updatedAt = copy.createdAt || nowIso;
  }

  return copy;
};

// Remove duplicatas no mesmo lote para evitar erro 21000 / 23505 no ON CONFLICT DO UPDATE
const deduplicateRows = (tableName: string, rows: any[]): any[] => {
  const byId = new Map<string, any>();
  for (const r of rows) {
    if (r && r.id !== undefined) {
      byId.set(String(r.id), r);
    }
  }
  let result = Array.from(byId.values());

  if (tableName === 'users') {
    const byUsername = new Map<string, any>();
    for (const u of result) {
      const key = String(u.username || u.id).trim().toLowerCase();
      byUsername.set(key, u);
    }
    result = Array.from(byUsername.values());
  } else if (tableName === 'utv_passports') {
    const byQr = new Map<string, any>();
    for (const p of result) {
      const key = String(p.qrCode || p.id).trim();
      byQr.set(key, p);
    }
    result = Array.from(byQr.values());
  }

  return result;
};

// Executa upsert de um único lote resiliente
const upsertBatchResilient = async (
  tableName: string,
  batchPayload: any,
  maxAttempts = 6,
  upsertOptions?: { onConflict?: string }
): Promise<void> => {
  let payload = batchPayload;
  let options = upsertOptions;

  let { error } = await getClient().from(tableName).upsert(payload, options);
  let attempts = 0;

  if (isTableMissingError(error)) {
    missingTables.add(tableName);
    tableErrors.set(tableName, 'Tabela não encontrada no Supabase');
    console.warn(`[Supabase] Tabela '${tableName}' ausente no schema cache do Supabase. Operação preservada localmente.`);
    return;
  }

  if (isRlsError(error)) {
    tableErrors.set(tableName, 'Bloqueado por política RLS (execute o script SQL no Supabase)');
    console.warn(`[Supabase] Tabela '${tableName}' bloqueada por política RLS. Execute o script SQL no Supabase.`);
    return;
  }

  while (error && attempts < maxAttempts) {
    if (isTableMissingError(error)) {
      missingTables.add(tableName);
      tableErrors.set(tableName, 'Tabela não encontrada no Supabase');
      return;
    }
    if (isRlsError(error)) {
      tableErrors.set(tableName, 'Bloqueado por política RLS (execute o script SQL no Supabase)');
      return;
    }

    attempts++;
    const errMsg = String(error.message || '');
    const errCode = String(error.code || '');
    const match = errMsg.match(/Could not find the '([^']+)' column/i);
    const colName = match ? match[1] : null;

    if (colName) {
      console.warn(`[Supabase] Aviso: Coluna '${colName}' ausente no schema de '${tableName}'. Removendo campo para sincronizar sem erro...`);
      payload = Array.isArray(payload)
        ? payload.map((row: any) => { const copy = { ...row }; delete copy[colName]; return copy; })
        : (() => { const copy = { ...payload }; delete copy[colName]; return copy; })();
      const retry = await getClient().from(tableName).upsert(payload, options);
      error = retry.error;
    } else if (errCode === '23505' && tableName === 'users' && options?.onConflict !== 'username') {
      // Conflito de username duplicado com ID diferente no Supabase -> atualiza pelo username
      console.warn(`[Supabase] Conflito de username em 'users'. Reenviando usando onConflict='username'...`);
      options = { onConflict: 'username' };
      const retry = await getClient().from(tableName).upsert(payload, options);
      error = retry.error;
    } else if (errCode === '23505' && tableName === 'utv_passports' && options?.onConflict !== 'qrCode') {
      // Conflito de qrCode duplicado com ID diferente no Supabase -> atualiza pelo qrCode
      console.warn(`[Supabase] Conflito de qrCode em 'utv_passports'. Reenviando usando onConflict='qrCode'...`);
      options = { onConflict: 'qrCode' };
      const retry = await getClient().from(tableName).upsert(payload, options);
      error = retry.error;
    } else if (errCode === '42501' && tableName === 'users') {
      // Permissão restrita na coluna password (REVOKE SELECT (password)) durante upsert -> reenvia sem a coluna password
      const hadPassword = Array.isArray(payload)
        ? payload.some((r: any) => r && 'password' in r)
        : (payload && 'password' in payload);
      if (hadPassword) {
        console.warn(`[Supabase] Restrição na coluna password de 'users' durante sincronização. Reenviando perfil sem alterar hash de senha...`);
        payload = Array.isArray(payload)
          ? payload.map(({ password, ...rest }: any) => rest)
          : (({ password, ...rest }: any) => rest)(payload);
        const retry = await getClient().from(tableName).upsert(payload, options);
        error = retry.error;
      } else {
        // Ainda 42501 sem password -> tenta atualizar linha a linha ignorando password
        const rows = Array.isArray(payload) ? payload : [payload];
        let lastRowErr: any = null;
        for (const r of rows) {
          const { id, password: _pw, ...fields } = r;
          const upd = await getClient().from('users').update(fields).eq('id', id);
          if (upd.error) lastRowErr = upd.error;
        }
        error = lastRowErr;
        break;
      }
    } else if (errMsg.includes('invalid input syntax for type integer') || errCode === '22P02') {
      console.warn(`[Supabase] Aviso: Coluna do tipo INTEGER no Supabase rejeitou valor decimal em '${tableName}'. Aplicando arredondamento temporário...`);
      const roundNumbers = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(roundNumbers);
        if (obj !== null && typeof obj === 'object') {
          const res: any = { ...obj };
          ['quantity', 'minQuantity', 'value', 'unitValue', 'hours', 'minutes', 'defaultHours', 'defaultValuePerHour', 'fixedValue', 'currentKm'].forEach(key => {
            if (typeof res[key] === 'number') {
              res[key] = Math.round(res[key]);
            }
          });
          return res;
        }
        return obj;
      };
      payload = roundNumbers(payload);
      const retry = await getClient().from(tableName).upsert(payload, options);
      error = retry.error;
      if (!error) {
        tableErrors.delete(tableName);
        break;
      }
    } else if (errCode === 'PGRST204' || errMsg.includes('schema cache')) {
      if (tableName === 'history') {
        payload = Array.isArray(payload)
          ? payload.map(({ notes, destination, osNumber, unitValue, userId, mechanicId, tenantId, ...rest }: any) => rest)
          : (({ notes, destination, osNumber, unitValue, userId, mechanicId, tenantId, ...rest }: any) => rest)(payload);
      } else if (tableName === 'users') {
        payload = Array.isArray(payload)
          ? payload.map(({ email, avatarUrl, password, tenantId, ...rest }: any) => rest)
          : (({ email, avatarUrl, password, tenantId, ...rest }: any) => rest)(payload);
      } else if (tableName === 'items') {
        payload = Array.isArray(payload)
          ? payload.map(({ purchaseHistory, linkedQRCode, observations, imageUrl, unit, entryDate, description, tenantId, ...rest }: any) => rest)
          : (({ purchaseHistory, linkedQRCode, observations, imageUrl, unit, entryDate, description, tenantId, ...rest }: any) => rest)(payload);
      } else if (tableName === 'service_orders') {
        payload = Array.isArray(payload)
          ? payload.map(({ mechanicName, mechanicId, clientId, vehicleId, stockDeducted, completedAt, completedBy, notes, passportId, tenantId, ...rest }: any) => rest)
          : (({ mechanicName, mechanicId, clientId, vehicleId, stockDeducted, completedAt, completedBy, notes, passportId, tenantId, ...rest }: any) => rest)(payload);
      } else if (tableName === 'tenants') {
        payload = Array.isArray(payload)
          ? payload.map(({ subtitle, printSettings, address, defaultHourlyRate, ...rest }: any) => rest)
          : (({ subtitle, printSettings, address, defaultHourlyRate, ...rest }: any) => rest)(payload);
      } else if (tableName === 'labor_templates') {
        payload = Array.isArray(payload)
          ? payload.map(({ linkedItemIds, pricingType, fixedValue, minutes, linkedTemplateId, discountPercentage, discountValue, sharedNotes, tenantId, ...rest }: any) => rest)
          : (({ linkedItemIds, pricingType, fixedValue, minutes, linkedTemplateId, discountPercentage, discountValue, sharedNotes, tenantId, ...rest }: any) => rest)(payload);
      } else if (tableName === 'clients') {
        payload = Array.isArray(payload)
          ? payload.map(({ phone, email, username, password, isAccessActive, tenantId, ...rest }: any) => rest)
          : (({ phone, email, username, password, isAccessActive, tenantId, ...rest }: any) => rest)(payload);
      }
      const retry = await getClient().from(tableName).upsert(payload, options);
      error = retry.error;
      break;
    } else {
      break;
    }
  }

  if (error) {
    if (isTableMissingError(error)) {
      missingTables.add(tableName);
      tableErrors.set(tableName, 'Tabela não encontrada no Supabase');
      return;
    }
    if (isRlsError(error)) {
      tableErrors.set(tableName, 'Bloqueado por política RLS (execute o script SQL no Supabase)');
      return;
    }
    const detail = error.code ? `[${error.code}] ${error.message}` : error.message;
    console.error(`[Supabase] Erro persistente na tabela '${tableName}':`, detail);
    tableErrors.set(tableName, detail);
  }
};

// Helper para upsert resiliente com normalização, deduplicação e envio em lotes seguros
const resilientUpsert = async (tableName: string, rawPayload: any, maxAttempts = 6): Promise<void> => {
  const cleaned = cleanPayload(rawPayload);

  if (Array.isArray(cleaned) && cleaned.length === 0) {
    tableErrors.delete(tableName);
    return;
  }

  if (missingTables.has(tableName)) {
    console.warn(`[Supabase] Tabela '${tableName}' ausente no schema cache. Operação preservada localmente.`);
    return;
  }

  tableErrors.delete(tableName);

  if (Array.isArray(cleaned)) {
    const normalized = deduplicateRows(
      tableName,
      cleaned.map(row => normalizeRowForTable(tableName, row))
    );
    const chunkSize = (tableName === 'items' || tableName === 'utv_passports' || tableName === 'service_orders') ? 20 : 50;
    for (let i = 0; i < normalized.length; i += chunkSize) {
      const batch = normalized.slice(i, i + chunkSize);
      await upsertBatchResilient(tableName, batch, maxAttempts);
      if (missingTables.has(tableName)) return;
    }
  } else {
    const normalized = normalizeRowForTable(tableName, cleaned);
    await upsertBatchResilient(tableName, normalized, maxAttempts);
  }
};

// Helper de consulta resiliente com filtro por tenantId
const fetchScoped = async <T>(tableName: string, tenantId?: string, orderBy?: { column: string, ascending: boolean }): Promise<T[]> => {
  if (missingTables.has(tableName)) {
    return [];
  }

  const client = getClient();
  try {
    let query = client.from(tableName).select('*');
    if (tenantId) {
      query = query.eq('tenantId', tenantId);
    }
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending });
    }
    const { data, error } = await query;
    if (isTableMissingError(error)) {
      missingTables.add(tableName);
      tableErrors.set(tableName, 'Tabela não encontrada no Supabase');
      console.warn(`[Supabase] Tabela '${tableName}' ausente no schema cache.`);
      return [];
    }

    if (!error && Array.isArray(data)) {
      return data as T[];
    }
    if (error && (error.message?.includes('tenantId') || error.code === 'PGRST204')) {
      let fallbackQuery = client.from(tableName).select('*');
      if (orderBy) {
        fallbackQuery = fallbackQuery.order(orderBy.column, { ascending: orderBy.ascending });
      }
      const { data: fbData, error: fbError } = await fallbackQuery;
      if (!fbError && Array.isArray(fbData)) {
        return fbData as T[];
      }
    }
    if (error) {
      console.warn(`[Supabase] Aviso ao consultar '${tableName}':`, error.message);
    }
  } catch (e) {
    console.warn(`[Supabase] Exceção ao consultar '${tableName}':`, e);
  }
  return [];
};

export const supabaseService = {
  // --- AVAILABILITY & MISSING TABLE TRACKING ---
  isAvailable() {
    return !!supabase;
  },
  isTableMissing(tableName: string): boolean {
    return missingTables.has(tableName);
  },
  getMissingTables(): string[] {
    return Array.from(missingTables);
  },
  getTableErrors(): Record<string, string> {
    const res: Record<string, string> = {};
    tableErrors.forEach((v, k) => { res[k] = v; });
    return res;
  },
  clearMissingTableCache() {
    missingTables.clear();
    tableErrors.clear();
  },
  getTenantMigrationSql(): string {
    return `-- ============================================================================
-- SCRIPT MASTER DEFINITIVO DE BANCO DE DADOS — HPS CONTROL (SUPABASE / POSTGRESQL)
-- Execute no SQL Editor do seu painel Supabase (app.supabase.com) e clique em RUN
-- Seguro para reexecução (Idempotente)
-- ============================================================================

-- 0. Habilitar extensão de criptografia para senhas de funcionários
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Criar todas as 11 Tabelas do Sistema caso ainda não existam
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

CREATE TABLE IF NOT EXISTS tenant_users (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'OWNER',
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TEXT NOT NULL,
    UNIQUE("tenantId", "userId")
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'MECHANIC',
    email TEXT,
    "avatarUrl" TEXT,
    password TEXT,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps'
);

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
    date TEXT NOT NULL,
    destination TEXT,
    "osNumber" TEXT,
    "recipientName" TEXT,
    "mechanicId" TEXT,
    notes TEXT,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps'
);

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

CREATE TABLE IF NOT EXISTS vehicle_sections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    components JSONB DEFAULT '[]'::jsonb,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps'
);

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
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps'
);

CREATE TABLE IF NOT EXISTS client_mirror_access_logs (
    id TEXT PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "passportId" TEXT,
    "accessedAt" TEXT NOT NULL,
    "tenantId" TEXT DEFAULT 'tenant_matriz_hps'
);

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

-- 2. GARANTIR QUE TODAS AS COLUNAS DE TENANTS EXISTAM ANTES DO SEED INICIAL
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

-- 3. Inserir oficina padrão Matriz (se não existir)
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

-- Demais colunas das tabelas principais (ADD COLUMN IF NOT EXISTS)

ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';

ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "minQuantity" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS value NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'un';
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "entryDate" TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "linkedQRCode" TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS observations TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "sectionId" TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "laborTemplateId" TEXT;
ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS "purchaseHistory" JSONB DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "unitValue" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS destination TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "osNumber" TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "partNumber" TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "recipientName" TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "mechanicId" TEXT;
ALTER TABLE IF EXISTS history ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';

DO $$ BEGIN
    ALTER TABLE history ALTER COLUMN "userId" DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

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

DO $$ BEGIN
    ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_osNumber_key;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS "isAccessActive" BOOLEAN DEFAULT true;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS vehicles JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';

ALTER TABLE IF EXISTS vehicle_sections ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';

ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "linkedItemIds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "pricingType" TEXT DEFAULT 'hourly';
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "fixedValue" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "minutes" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "linkedTemplateId" TEXT;
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "discountPercentage" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "discountValue" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS labor_templates ADD COLUMN IF NOT EXISTS "sharedNotes" TEXT;

ALTER TABLE IF EXISTS utv_passports ADD COLUMN IF NOT EXISTS "tenantId" TEXT DEFAULT 'tenant_matriz_hps';
ALTER TABLE IF EXISTS utv_passports ADD COLUMN IF NOT EXISTS "activeTriage" JSONB;
ALTER TABLE IF EXISTS utv_passports ADD COLUMN IF NOT EXISTS "triageHistory" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS utv_passports ADD COLUMN IF NOT EXISTS "maintenanceItems" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS utv_passports ADD COLUMN IF NOT EXISTS competitions JSONB DEFAULT '[]'::jsonb;

-- 4. CONVERSÃO SEGURA DE TIPOS PARA NUMERIC (DECIMAIS DE LITROS/ML E VALORES R$)
DO $$ BEGIN ALTER TABLE tenants ALTER COLUMN "defaultHourlyRate" TYPE NUMERIC USING "defaultHourlyRate"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE items ALTER COLUMN quantity TYPE NUMERIC USING quantity::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE items ALTER COLUMN "minQuantity" TYPE NUMERIC USING "minQuantity"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE items ALTER COLUMN value TYPE NUMERIC USING value::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE history ALTER COLUMN quantity TYPE NUMERIC USING quantity::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE history ALTER COLUMN "unitValue" TYPE NUMERIC USING "unitValue"::numeric; EXCEPTION WHEN OTHERS THEN NULL; END $$;
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

-- 5. Índices de performance
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users("tenantId");
CREATE INDEX IF NOT EXISTS idx_items_tenant ON items("tenantId");
CREATE INDEX IF NOT EXISTS idx_history_tenant ON history("tenantId");
CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders(status);
CREATE INDEX IF NOT EXISTS idx_service_orders_os_number ON service_orders("osNumber");
CREATE INDEX IF NOT EXISTS idx_service_orders_customer_name ON service_orders("customerName");
CREATE INDEX IF NOT EXISTS idx_service_orders_tenant ON service_orders("tenantId");
CREATE INDEX IF NOT EXISTS idx_vehicle_sections_tenant ON vehicle_sections("tenantId");
CREATE INDEX IF NOT EXISTS idx_labor_templates_tenant ON labor_templates("tenantId");
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients("tenantId");
CREATE INDEX IF NOT EXISTS idx_clients_username ON clients(username);
CREATE INDEX IF NOT EXISTS idx_utv_passports_tenant ON utv_passports("tenantId");
CREATE INDEX IF NOT EXISTS idx_client_mirror_logs_client ON client_mirror_access_logs("clientId");

-- 6. Segurança de Senha + RPCs de Autenticação (Equipe e Espelho do Cliente)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
REVOKE SELECT (password) ON users FROM anon, authenticated;
GRANT SELECT (id, username, name, role, email, "avatarUrl", "tenantId"), INSERT, UPDATE, DELETE ON users TO anon, authenticated;

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

-- 7. Habilitar RLS e Políticas de Acesso para todas as 11 tabelas
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

-- 8. Atualizar o cache do PostgREST imediatamente
NOTIFY pgrst, 'reload schema';
`;
  },

  // --- TENANTS (MULTI-TENANCY CORE) ---
  async getTenants(): Promise<Tenant[]> {
    if (missingTables.has('tenants')) return [];
    try {
      const { data, error } = await getClient().from('tenants').select('*');
      if (isTableMissingError(error)) {
        missingTables.add('tenants');
        console.warn("[Supabase] Tabela 'tenants' ainda não criada no schema cache.");
        return [];
      }
      if (!error && Array.isArray(data) && data.length > 0) {
        return data as Tenant[];
      }
      if (error) {
        console.warn("[Supabase] Aviso ao consultar 'tenants':", error.message);
      }
    } catch (e) {
      console.warn("[Supabase] Exceção ao buscar 'tenants':", e);
    }
    return [];
  },
  async saveTenant(tenant: Tenant | Tenant[]) {
    if (missingTables.has('tenants')) return;
    try {
      await resilientUpsert('tenants', tenant);
    } catch (err: any) {
      if (isTableMissingError(err)) {
        missingTables.add('tenants');
        console.warn("[Supabase] Tabela 'tenants' ausente. Ignorado no Supabase e preservado localmente.");
        return;
      }
      throw err;
    }
  },
  async deleteTenant(id: string) {
    if (missingTables.has('tenants')) return;
    try {
      const { error } = await getClient().from('tenants').delete().eq('id', id);
      if (error && !isTableMissingError(error)) throw error;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        missingTables.add('tenants');
        return;
      }
      throw err;
    }
  },

  // --- USERS ---
  async getUsers(tenantId?: string): Promise<User[]> {
    const client = getClient();

    const mapRowToUser = (u: any): User => {
      const roleRaw = (u.role || u.funcao || u.cargo || u.perfil || u.tipo || u.tipo_acesso || u.nivel || '').toString().toUpperCase();
      const isStockistOrAdmin = roleRaw.includes('STOCK') || roleRaw.includes('ADMIN') || roleRaw.includes('ESTOQ') || roleRaw.includes('GERENTE') || roleRaw.includes('MASTER');

      const idVal = String(u.id || u.username || u.login || u.cpf || u.matricula || u.email || Math.random().toString(36).substring(2, 9));
      const usernameVal = String(u.username || u.login || u.email || u.cpf || u.matricula || u.name || u.nome || idVal);
      const nameVal = String(u.name || u.nome || u.full_name || u.nome_completo || u.razao_social || usernameVal || 'Funcionário');

      return {
        id: idVal,
        username: usernameVal,
        name: nameVal,
        role: isStockistOrAdmin ? UserRole.STOCKIST : UserRole.MECHANIC,
        email: u.email || u.contato || undefined,
        avatarUrl: u.avatarUrl || u.avatar_url || u.foto || undefined,
        password: u.password || u.senha || undefined,
        tenantId: u.tenantId || u.tenant_id || undefined
      };
    };

    // 1. Selecionar colunas seguras explicitamente (compatível com REVOKE SELECT (password) ON users)
    const safeColumns = 'id, username, name, role, email, "avatarUrl", "tenantId"';
    try {
      let query = client.from('users').select(safeColumns);
      if (tenantId) {
        query = query.eq('tenantId', tenantId);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map(mapRowToUser);
      }
      // Fallback sem filtro tenantId (se a coluna não existir no banco legado)
      if (error && (error.message?.includes('tenantId') || error.code === '42703' || error.code === 'PGRST204')) {
        const { data: legacySafe, error: legacySafeErr } = await client.from('users').select('id, username, name, role, email, "avatarUrl"');
        if (!legacySafeErr && Array.isArray(legacySafe) && legacySafe.length > 0) {
          return legacySafe.map(mapRowToUser);
        }
        const { data: noTenantData, error: noTenantErr } = await client.from('users').select('*');
        if (!noTenantErr && Array.isArray(noTenantData) && noTenantData.length > 0) {
          return noTenantData.map(mapRowToUser);
        }
      }
    } catch (e) {
      console.warn("[Supabase] Exceção ao consultar 'users':", e);
    }

    // 2. Se a tabela 'users' não retornou, buscar tabelas alternativas comuns
    const candidateTables = ['funcionarios', 'employees', 'profiles', 'equipe', 'usuarios', 'colaboradores'];
    for (const tbl of candidateTables) {
      try {
        const { data, error } = await client.from(tbl).select('*');
        if (!error && Array.isArray(data) && data.length > 0) {
          return data.map(mapRowToUser);
        }
      } catch {}
    }

    return [];
  },
  async login(username: string, password: string): Promise<User | null> {
    try {
      const { data, error } = await getClient()
        .rpc('login_user', { p_username: username, p_password: password });
      
      if (error) {
        console.error("Erro RPC Supabase (login_user):", error.message, error.details, error.hint);
        throw error;
      }
      
      if (data && data.length > 0) {
        return data[0] as User;
      }
      return null;
    } catch (e: any) {
      console.error("Falha na conexão ou execução do login no Supabase:", e);
      throw e;
    }
  },
  async saveUser(user: User | User[]) {
    await resilientUpsert('users', user);
  },
  async deleteUser(id: string) {
    const { error } = await getClient().from('users').delete().eq('id', id);
    if (error) throw error;
  },

  // --- ITEMS ---
  async getItems(tenantId?: string) {
    return await fetchScoped<InventoryItem>('items', tenantId);
  },
  async saveItem(item: InventoryItem | InventoryItem[]) {
    await resilientUpsert('items', item);
  },
  async deleteItem(id: string) {
    const { error } = await getClient().from('items').delete().eq('id', id);
    if (error) throw error;
  },

  // --- HISTORY ---
  async getHistory(tenantId?: string) {
    return await fetchScoped<Transaction>('history', tenantId, { column: 'date', ascending: false });
  },
  async saveTransaction(tx: Transaction | Transaction[]) {
    await resilientUpsert('history', tx);
  },

  // --- SERVICE ORDERS ---
  async getServiceOrders(tenantId?: string) {
    return await fetchScoped<ServiceOrder>('service_orders', tenantId, { column: 'createdAt', ascending: false });
  },
  async saveServiceOrder(os: ServiceOrder | ServiceOrder[]) {
    await resilientUpsert('service_orders', os);
  },
  async deleteServiceOrder(id: string) {
    const { error } = await getClient().from('service_orders').delete().eq('id', id);
    if (error) throw error;
  },

  // --- VEHICLE SECTIONS ---
  async getVehicleSections(tenantId?: string) {
    return await fetchScoped<VehicleSection>('vehicle_sections', tenantId);
  },
  async saveVehicleSection(section: VehicleSection | VehicleSection[]) {
    await resilientUpsert('vehicle_sections', section);
  },
  async deleteVehicleSection(id: string) {
    const { error } = await getClient().from('vehicle_sections').delete().eq('id', id);
    if (error) throw error;
  },

  // --- LABOR TEMPLATES ---
  async getLaborTemplates(tenantId?: string) {
    return await fetchScoped<LaborTemplate>('labor_templates', tenantId);
  },
  async saveLaborTemplate(template: LaborTemplate | LaborTemplate[]) {
    await resilientUpsert('labor_templates', template);
  },
  async deleteLaborTemplate(id: string) {
    const { error } = await getClient().from('labor_templates').delete().eq('id', id);
    if (error) throw error;
  },

  // --- CLIENTS ---
  async getClients(tenantId?: string) {
    return await fetchScoped<Client>('clients', tenantId);
  },
  async authenticateClient(username: string, password: string): Promise<Client | null> {
    if (!supabase || missingTables.has('clients')) return null;
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();
    if (!cleanUser || !cleanPass) return null;

    // 1. Tentar via RPC (se já criado no banco)
    try {
      const { data: rpcData, error: rpcErr } = await getClient().rpc('authenticate_client_mirror', {
        p_username: cleanUser,
        p_password: cleanPass
      });
      if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
        return rpcData[0] as Client;
      }
    } catch {}

    // 2. Fallback para consulta direta na tabela 'clients'
    try {
      const { data, error } = await getClient()
        .from('clients')
        .select('*');
      if (!error && Array.isArray(data)) {
        const matched = (data as Client[]).find(
          c => c.username && c.username.trim().toLowerCase() === cleanUser && c.password === cleanPass
        );
        return matched || null;
      }
    } catch (e) {
      console.warn('[Supabase] Erro ao autenticar cliente no banco:', e);
    }
    return null;
  },
  async logClientMirrorAccess(logEntry: { id: string; clientId: string; clientName: string; passportId?: string; accessedAt: string; tenantId?: string }) {
    if (!supabase || missingTables.has('client_mirror_access_logs')) return;
    try {
      await getClient().from('client_mirror_access_logs').insert(logEntry);
    } catch {}
  },
  async saveClient(client: Client | Client[]) {
    await resilientUpsert('clients', client);
  },
  async deleteClient(id: string) {
    const { error } = await getClient().from('clients').delete().eq('id', id);
    if (error) throw error;
  },

  // --- UTV PASSPORTS ---
  async getUTVPassports(tenantId?: string): Promise<UTVPassport[]> {
    return await fetchScoped<UTVPassport>('utv_passports', tenantId, { column: 'updatedAt', ascending: false });
  },
  async getUTVPassportById(idOrQr: string): Promise<UTVPassport | null> {
    if (!supabase || missingTables.has('utv_passports')) return null;
    try {
      const { data, error } = await getClient()
        .from('utv_passports')
        .select('*')
        .or(`id.eq.${idOrQr},qrCode.eq.${idOrQr}`)
        .maybeSingle();
      if (!error && data) {
        return data as UTVPassport;
      }
    } catch (e) {
      console.warn('[Supabase] Erro ao consultar passaporte UTV por ID/QR:', e);
    }
    return null;
  },
  async saveUTVPassport(passport: UTVPassport | UTVPassport[]) {
    await resilientUpsert('utv_passports', passport);
  },
  async deleteUTVPassport(id: string) {
    if (missingTables.has('utv_passports')) return;
    const { error } = await getClient().from('utv_passports').delete().eq('id', id);
    if (error && !isTableMissingError(error)) throw error;
  },

  // --- MIGRAÇÃO COMPLETA / BACKUP RESTORE ---
  async importFullTenantBackup(
    tenantId: string,
    payload: {
      tenant?: Tenant;
      users?: User[];
      items?: InventoryItem[];
      history?: Transaction[];
      serviceOrders?: ServiceOrder[];
      vehicleSections?: VehicleSection[];
      laborTemplates?: LaborTemplate[];
      clients?: Client[];
      utvPassports?: UTVPassport[];
    },
    cleanReplace = true
  ): Promise<{
    success: boolean;
    counts: Record<string, number>;
    errors: Record<string, string>;
    missingTables: string[];
  }> {
    const client = getClient();
    missingTables.clear();
    tableErrors.clear();

    const chunkArray = <T,>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const upsertChunked = async (tableName: string, rows: any[], chunkSize = 25) => {
      if (!rows || rows.length === 0) return;
      for (const batch of chunkArray(rows, chunkSize)) {
        await resilientUpsert(tableName, batch);
      }
    };

    // 1. Se "Substituição Limpa" estiver ativada, remove dados antigos desta oficina antes de subir o backup
    if (cleanReplace) {
      const tablesToClear = [
        'history',
        'service_orders',
        'utv_passports',
        'items',
        'labor_templates',
        'vehicle_sections',
        'clients'
      ];

      for (const tbl of tablesToClear) {
        try {
          const { error } = await client.from(tbl).delete().eq('tenantId', tenantId);
          if (error) {
            if (isTableMissingError(error)) {
              missingTables.add(tbl);
              tableErrors.set(tbl, 'Tabela não encontrada no Supabase');
              continue;
            }
            if (isRlsError(error)) {
              tableErrors.set(tbl, 'Bloqueado por política RLS (execute o script SQL no Supabase)');
              continue;
            }
            console.warn(`[Supabase] Aviso ao limpar tabela '${tbl}':`, error.message);
          }

          // Para a matriz padrão, remove também registros legados sem tenantId (evita reaparecerem no F5)
          if (tenantId === 'tenant_matriz_hps') {
            await client.from(tbl).delete().is('tenantId', null);
          }
        } catch (e: any) {
          console.warn(`[Supabase] Exceção ao limpar tabela '${tbl}':`, e?.message || e);
        }
      }
    }

    // 2. Garantir tenantId em todos os registros e enviar em lotes seguros
    const scopedUsers = (payload.users || []).map(u => ({ ...u, tenantId }));
    const scopedItems = (payload.items || []).map(i => ({ ...i, tenantId }));
    const scopedHistory = (payload.history || []).map(h => ({ ...h, tenantId }));
    const scopedOrders = (payload.serviceOrders || []).map(o => ({ ...o, tenantId }));
    const scopedSections = (payload.vehicleSections || []).map(s => ({ ...s, tenantId }));
    const scopedTemplates = (payload.laborTemplates || []).map(l => ({ ...l, tenantId }));
    const scopedClients = (payload.clients || []).map(c => ({ ...c, tenantId }));
    const scopedPassports = (payload.utvPassports || []).map(p => ({ ...p, tenantId }));

    if (payload.tenant) {
      await resilientUpsert('tenants', { ...payload.tenant, id: tenantId });
    }
    await upsertChunked('users', scopedUsers, 50);
    await upsertChunked('vehicle_sections', scopedSections, 50);
    await upsertChunked('labor_templates', scopedTemplates, 50);
    await upsertChunked('clients', scopedClients, 50);
    await upsertChunked('items', scopedItems, 20);
    await upsertChunked('utv_passports', scopedPassports, 15);
    await upsertChunked('service_orders', scopedOrders, 20);
    await upsertChunked('history', scopedHistory, 50);

    const errorsObj: Record<string, string> = {};
    tableErrors.forEach((v, k) => { errorsObj[k] = v; });

    return {
      success: Object.keys(errorsObj).length === 0 && missingTables.size === 0,
      counts: {
        items: scopedItems.length,
        serviceOrders: scopedOrders.length,
        clients: scopedClients.length,
        utvPassports: scopedPassports.length,
        laborTemplates: scopedTemplates.length,
        vehicleSections: scopedSections.length,
        history: scopedHistory.length,
        users: scopedUsers.length
      },
      errors: errorsObj,
      missingTables: Array.from(missingTables)
    };
  }
};




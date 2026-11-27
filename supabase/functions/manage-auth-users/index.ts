// Supabase Edge Function: manage-auth-users
// Deploy no Supabase: supabase functions deploy manage-auth-users
// Secrets necessarios no Supabase Dashboard (Edge Functions -> Secrets):
// - SUPABASE_URL (injetado automaticamente)
// - SUPABASE_SERVICE_ROLE_KEY (injetado automaticamente)
// - ALLOWED_ORIGINS (ex: https://hpscontol.netlify.app,http://localhost:3000)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const ADMIN_ROLE_REGEX = /(STOCK|ADMIN|ESTOQ|GERENTE|MASTER|OWNER)/i;

const DEFAULT_ALLOWED_ORIGINS = [
  'https://hpscontol.netlify.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const parseAllowedOrigins = (): Set<string> => {
  const configured = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
};

const buildCorsHeaders = (req: Request): Record<string, string> => {
  const origin = (req.headers.get('origin') || '').trim().replace(/\/+$/, '');
  const allowedOrigins = parseAllowedOrigins();
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin'
  };
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
};

const jsonResponse = (req: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...buildCorsHeaders(req)
    }
  });

const normalizeStaffRole = (raw: unknown): 'STOCKIST' | 'MECHANIC' => {
  const val = String(raw || '').toUpperCase();
  return ADMIN_ROLE_REGEX.test(val) ? 'STOCKIST' : 'MECHANIC';
};

const sanitizeUsernameSlug = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_');

const makeStaffAuthEmail = (username: string): string =>
  `${sanitizeUsernameSlug(username)}@staff.hps.local`;

const makeClientAuthEmail = (username: string): string =>
  `${sanitizeUsernameSlug(username)}@client.hps.local`;

const escapeLikePattern = (val: string): string =>
  val.replace(/[\\%_]/g, (ch) => `\\${ch}`);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    const origin = (req.headers.get('origin') || '').trim().replace(/\/+$/, '');
    const allowedOrigins = parseAllowedOrigins();
    if (origin && !allowedOrigins.has(origin)) {
      return new Response('Forbidden origin', { status: 403 });
    }
    return new Response('ok', { headers: buildCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, 405, { error: 'Method not allowed' });
  }

  const origin = (req.headers.get('origin') || '').trim().replace(/\/+$/, '');
  const allowedOrigins = parseAllowedOrigins();
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse(req, 403, { error: 'Origem não autorizada no CORS (adicione em ALLOWED_ORIGINS).' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, 500, { error: 'Configuração interna do Supabase ausente na Edge Function.' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(req, 400, { error: 'Payload JSON inválido.' });
  }

  const action = String(payload.action || '').trim();

  // =========================================================================
  // 1. AUTO-MIGRAÇÃO SEGURA NO PRIMEIRO LOGIN (usuário legado -> auth.users)
  // Só funciona quando authUserId ainda é NULL e a senha atual confere no servidor.
  // =========================================================================
  if (action === 'migrate_on_login') {
    const identifier = String(payload.identifier || '').trim().toLowerCase();
    const password = String(payload.password || '');

    if (!identifier || !password || identifier.length > 160 || password.length > 200) {
      return jsonResponse(req, 400, { error: 'Credenciais inválidas.' });
    }

    // 1A. Verificar equipe (users) via consultas parametrizadas separadas
    const safeIdentifier = escapeLikePattern(identifier);
    let staff: any = null;
    const { data: staffByUsername } = await supabaseAdmin
      .from('users')
      .select('id, username, name, role, email, "tenantId", "authUserId", "authEmail"')
      .ilike('username', safeIdentifier)
      .limit(1);
    if (Array.isArray(staffByUsername) && staffByUsername.length > 0) {
      staff = staffByUsername[0];
    } else if (identifier.includes('@')) {
      const { data: staffByEmail } = await supabaseAdmin
        .from('users')
        .select('id, username, name, role, email, "tenantId", "authUserId", "authEmail"')
        .ilike('email', safeIdentifier)
        .limit(1);
      if (Array.isArray(staffByEmail) && staffByEmail.length > 0) {
        staff = staffByEmail[0];
      }
    }
    if (staff) {
      if (staff.authUserId) {
        return jsonResponse(req, 401, { error: 'Usuário já migrado; utilize a senha cadastrada no Auth.' });
      }

      const { data: rpcUsers, error: rpcErr } = await supabaseAdmin.rpc('login_user', {
        p_username: staff.username,
        p_password: password
      });

      if (rpcErr || !Array.isArray(rpcUsers) || rpcUsers.length === 0) {
        return jsonResponse(req, 401, { error: 'Usuário ou senha incorretos.' });
      }

      const authEmail = staff.authEmail || makeStaffAuthEmail(staff.username);
      const normalizedRole = normalizeStaffRole(staff.role);
      const tenantId = staff.tenantId || 'tenant_matriz_hps';

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        app_metadata: {
          accountType: 'STAFF',
          role: normalizedRole,
          tenantId,
          appUserId: staff.id
        },
        user_metadata: {
          name: staff.name,
          username: staff.username
        }
      });

      if (createErr || !created?.user?.id) {
        return jsonResponse(req, 500, { error: createErr?.message || 'Falha ao provisionar usuário no Supabase Auth.' });
      }

      await supabaseAdmin
        .from('users')
        .update({
          authUserId: created.user.id,
          authEmail,
          role: normalizedRole,
          password: null
        })
        .eq('id', staff.id);

      return jsonResponse(req, 200, {
        migrated: true,
        accountType: 'STAFF',
        authEmail
      });
    }

    // 1B. Verificar cliente ativo (clients)
    const { data: clientRows } = await supabaseAdmin
      .from('clients')
      .select('id, name, username, email, "tenantId", "isAccessActive", "authUserId", "authEmail"')
      .ilike('username', safeIdentifier)
      .limit(1);

    const clientRow = Array.isArray(clientRows) && clientRows.length > 0 ? clientRows[0] : null;
    if (clientRow) {
      if (clientRow.isAccessActive === false) {
        return jsonResponse(req, 403, { error: 'Acesso do cliente bloqueado pela oficina.' });
      }
      if (clientRow.authUserId) {
        return jsonResponse(req, 401, { error: 'Cliente já migrado; utilize a senha cadastrada.' });
      }

      const { data: rpcClients, error: rpcClientErr } = await supabaseAdmin.rpc('authenticate_client_mirror', {
        p_username: clientRow.username,
        p_password: password.trim()
      });

      if (rpcClientErr || !Array.isArray(rpcClients) || rpcClients.length === 0) {
        return jsonResponse(req, 401, { error: 'Login ou senha de cliente incorretos.' });
      }

      const authEmail = clientRow.authEmail || makeClientAuthEmail(clientRow.username);
      const tenantId = clientRow.tenantId || 'tenant_matriz_hps';

      const { data: createdClient, error: createClientErr } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password: password.trim(),
        email_confirm: true,
        app_metadata: {
          accountType: 'CLIENT',
          role: 'CLIENT',
          tenantId,
          clientId: clientRow.id
        },
        user_metadata: {
          name: clientRow.name,
          username: clientRow.username
        }
      });

      if (createClientErr || !createdClient?.user?.id) {
        return jsonResponse(req, 500, { error: createClientErr?.message || 'Falha ao provisionar cliente no Supabase Auth.' });
      }

      await supabaseAdmin
        .from('clients')
        .update({
          authUserId: createdClient.user.id,
          authEmail
        })
        .eq('id', clientRow.id);

      return jsonResponse(req, 200, {
        migrated: true,
        accountType: 'CLIENT',
        authEmail
      });
    }

    return jsonResponse(req, 401, { error: 'Usuário ou senha incorretos.' });
  }

  // =========================================================================
  // 2. TODAS AS DEMAIS AÇÕES EXIGEM SESSÃO AUTENTICADA NO SUPABASE AUTH
  // =========================================================================
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return jsonResponse(req, 401, { error: 'Token de autenticação ausente.' });
  }

  const { data: callerAuth, error: callerErr } = await supabaseAdmin.auth.getUser(token);
  if (callerErr || !callerAuth?.user?.id) {
    return jsonResponse(req, 401, { error: 'Sessão inválida ou expirada.' });
  }

  const { data: callerStaffRows } = await supabaseAdmin
    .from('users')
    .select('id, role, "tenantId"')
    .eq('authUserId', callerAuth.user.id)
    .limit(1);

  const callerStaff = Array.isArray(callerStaffRows) && callerStaffRows.length > 0 ? callerStaffRows[0] : null;
  if (!callerStaff) {
    return jsonResponse(req, 403, { error: 'Acesso restrito à equipe cadastrada.' });
  }

  const callerIsAdmin = normalizeStaffRole(callerStaff.role) === 'STOCKIST';
  const callerTenantId = callerStaff.tenantId || 'tenant_matriz_hps';

  if (action === 'health_check') {
    return jsonResponse(req, 200, {
      ok: true,
      isAdmin: callerIsAdmin,
      authUserId: callerAuth.user.id,
      tenantId: callerTenantId
    });
  }

  // -------------------------------------------------------------------------
  // Ações de Gestão de Clientes (Admin ou Mecânico da mesma oficina)
  // -------------------------------------------------------------------------
  if (action === 'sync_client_auth') {
    const clientData = (payload.client || {}) as Record<string, unknown>;
    const clientId = String(clientData.id || '').trim();
    const clientName = String(clientData.name || '').trim();
    const clientUsername = String(clientData.username || '').trim().toLowerCase();
    const clientPassword = String(clientData.password || '').trim();
    const isAccessActive = clientData.isAccessActive !== false;
    const tenantId = String(clientData.tenantId || callerTenantId);

    if (!clientId || !clientName) {
      return jsonResponse(req, 400, { error: 'Dados do cliente inválidos.' });
    }
    if (!callerIsAdmin && tenantId !== callerTenantId) {
      return jsonResponse(req, 403, { error: 'Sem permissão para outra oficina.' });
    }

    const { data: existingRows } = await supabaseAdmin
      .from('clients')
      .select('id, "authUserId", "authEmail"')
      .eq('id', clientId)
      .limit(1);

    const existing = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;
    let authUserId: string | null = existing?.authUserId || null;
    let authEmail: string | null = existing?.authEmail || null;

    if (clientUsername) {
      authEmail = authEmail || makeClientAuthEmail(clientUsername);
      if (authUserId) {
        const updateAttrs: Record<string, unknown> = {
          email: authEmail,
          ban_duration: isAccessActive ? 'none' : '876000h',
          app_metadata: {
            accountType: 'CLIENT',
            role: 'CLIENT',
            tenantId,
            clientId
          },
          user_metadata: {
            name: clientName,
            username: clientUsername
          }
        };
        if (clientPassword.length >= 4) {
          updateAttrs.password = clientPassword;
        }
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, updateAttrs);
        if (updErr) {
          return jsonResponse(req, 500, { error: updErr.message });
        }
      } else if (clientPassword.length >= 4) {
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: authEmail,
          password: clientPassword,
          email_confirm: true,
          app_metadata: {
            accountType: 'CLIENT',
            role: 'CLIENT',
            tenantId,
            clientId
          },
          user_metadata: {
            name: clientName,
            username: clientUsername
          }
        });
        if (createErr || !created?.user?.id) {
          return jsonResponse(req, 500, { error: createErr?.message || 'Erro ao criar conta Auth do cliente.' });
        }
        authUserId = created.user.id;
        if (!isAccessActive) {
          await supabaseAdmin.auth.admin.updateUserById(authUserId, { ban_duration: '876000h' });
        }
      }
    }

    const { error: upsertErr } = await supabaseAdmin.from('clients').upsert({
      id: clientId,
      name: clientName,
      cpf: clientData.cpf ? String(clientData.cpf).trim() : null,
      phone: clientData.phone ? String(clientData.phone).trim() : null,
      email: clientData.email ? String(clientData.email).trim() : null,
      username: clientUsername || null,
      password: clientPassword || null,
      isAccessActive,
      vehicles: Array.isArray(clientData.vehicles) ? clientData.vehicles : [],
      createdAt: clientData.createdAt ? String(clientData.createdAt) : new Date().toISOString(),
      tenantId,
      authUserId,
      authEmail
    });

    if (upsertErr) {
      return jsonResponse(req, 500, { error: upsertErr.message });
    }
    return jsonResponse(req, 200, { ok: true, authUserId, authEmail });
  }

  // -------------------------------------------------------------------------
  // Ações Exclusivas do Administrador (STOCKIST)
  // -------------------------------------------------------------------------
  if (!callerIsAdmin) {
    return jsonResponse(req, 403, { error: 'Apenas administradores podem gerenciar acessos e exclusões.' });
  }

  if (action === 'delete_client_auth') {
    const clientId = String(payload.clientId || '').trim();
    if (!clientId) return jsonResponse(req, 400, { error: 'clientId obrigatório.' });

    const { data: existingRows } = await supabaseAdmin
      .from('clients')
      .select('id, "authUserId"')
      .eq('id', clientId)
      .limit(1);

    const existing = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;
    await supabaseAdmin.from('clients').delete().eq('id', clientId);
    if (existing?.authUserId) {
      await supabaseAdmin.auth.admin.deleteUser(existing.authUserId);
    }
    return jsonResponse(req, 200, { ok: true });
  }

  if (action === 'create_staff') {
    const userData = (payload.user || {}) as Record<string, unknown>;
    const id = String(userData.id || '').trim();
    const name = String(userData.name || '').trim();
    const username = String(userData.username || '').trim().toLowerCase();
    const password = String(userData.password || '').trim();
    const role = normalizeStaffRole(userData.role);
    const email = userData.email ? String(userData.email).trim() : null;
    const tenantId = String(userData.tenantId || callerTenantId);

    if (!id || !name || !username || password.length < 4) {
      return jsonResponse(req, 400, { error: 'Nome, usuário e senha (mín. 4 caracteres) são obrigatórios.' });
    }

    const authEmail = makeStaffAuthEmail(username);
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      app_metadata: {
        accountType: 'STAFF',
        role,
        tenantId,
        appUserId: id
      },
      user_metadata: {
        name,
        username
      }
    });

    if (createErr || !created?.user?.id) {
      return jsonResponse(req, 500, { error: createErr?.message || 'Erro ao criar funcionário no Supabase Auth.' });
    }

    const { error: dbErr } = await supabaseAdmin.from('users').upsert({
      id,
      name,
      username,
      role,
      email,
      password: null,
      tenantId,
      authUserId: created.user.id,
      authEmail
    });

    if (dbErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return jsonResponse(req, 500, { error: dbErr.message });
    }

    return jsonResponse(req, 200, { ok: true, authUserId: created.user.id, authEmail });
  }

  if (action === 'reset_staff_password') {
    const userId = String(payload.userId || '').trim();
    const newPassword = String(payload.newPassword || '').trim();
    if (!userId || newPassword.length < 4) {
      return jsonResponse(req, 400, { error: 'ID do usuário e nova senha (mín. 4 caracteres) são obrigatórios.' });
    }

    const { data: userRows } = await supabaseAdmin
      .from('users')
      .select('id, username, name, role, "tenantId", "authUserId", "authEmail"')
      .eq('id', userId)
      .limit(1);

    const target = Array.isArray(userRows) && userRows.length > 0 ? userRows[0] : null;
    if (!target) {
      return jsonResponse(req, 404, { error: 'Funcionário não encontrado.' });
    }

    const authEmail = target.authEmail || makeStaffAuthEmail(target.username);
    let authUserId = target.authUserId as string | null;

    if (authUserId) {
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: newPassword
      });
      if (updErr) {
        return jsonResponse(req, 500, { error: updErr.message });
      }
    } else {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password: newPassword,
        email_confirm: true,
        app_metadata: {
          accountType: 'STAFF',
          role: normalizeStaffRole(target.role),
          tenantId: target.tenantId || callerTenantId,
          appUserId: target.id
        },
        user_metadata: {
          name: target.name,
          username: target.username
        }
      });
      if (createErr || !created?.user?.id) {
        return jsonResponse(req, 500, { error: createErr?.message || 'Erro ao vincular conta no Auth.' });
      }
      authUserId = created.user.id;
    }

    await supabaseAdmin
      .from('users')
      .update({
        password: null,
        authUserId,
        authEmail
      })
      .eq('id', userId);

    return jsonResponse(req, 200, { ok: true, authUserId, authEmail });
  }

  if (action === 'delete_staff') {
    const userId = String(payload.userId || '').trim();
    if (!userId) return jsonResponse(req, 400, { error: 'userId obrigatório.' });
    if (userId === callerStaff.id) {
      return jsonResponse(req, 400, { error: 'Você não pode excluir o próprio usuário conectado.' });
    }

    const { data: targetRows } = await supabaseAdmin
      .from('users')
      .select('id, "authUserId"')
      .eq('id', userId)
      .limit(1);

    const target = Array.isArray(targetRows) && targetRows.length > 0 ? targetRows[0] : null;
    await supabaseAdmin.from('users').delete().eq('id', userId);
    if (target?.authUserId) {
      await supabaseAdmin.auth.admin.deleteUser(target.authUserId);
    }
    return jsonResponse(req, 200, { ok: true });
  }

  return jsonResponse(req, 400, { error: 'Ação desconhecida.' });
});

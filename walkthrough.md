# Security Summary

**Arquivos Revisados:** `/App.tsx`, `/services/supabaseService.ts`, `/services/geminiService.ts`, `/components/UTVPassportModule.tsx`, `/components/OSPrintDocument.tsx`, `/supabase_schema.sql`, `/vite.config.ts`, `/package.json`.

## Problemas Resolvidos

| Categoria | Severidade | Arquivo(s) | Status | Correção Aplicada |
| :--- | :--- | :--- | :--- | :--- |
| Atalhos de Teste & Senhas Padrão no Login | Crítica | `/App.tsx`, `/supabase_schema.sql`, `/services/supabaseService.ts` | Resolvido | Removido o bloco "Acesso Rápido para Iniciar Testes" (`admin/admin`, `carlos/123`, `guilherme/123`), removidas senhas de fallback (`123`/`admin`) e usuários seed hardcoded quando conectado ao Supabase; adicionado backfill automático com `crypt(..., gen_salt('bf', 8))` para converter eventuais senhas antigas em texto puro no Supabase. |
| Carregamento de Dados Antes do Login & Isolamento do Cliente | Crítica | `/App.tsx`, `/services/supabaseService.ts` | Resolvido | Bloqueado o carregamento de usuários, clientes, ordens de serviço, histórico e estoque antes da autenticação quando o Supabase está ativo; contas `CLIENT` agora carregam apenas passaportes filtrados e itens, sem persistir dados sensíveis em cache local (`IndexedDB`/`localStorage`) nem exibir `SELECT * FROM clients` no navegador. |
| Controle de Acesso (RBAC) & Divergência de Perfis | Alta | `/App.tsx`, `/services/supabaseService.ts`, `/components/UTVPassportModule.tsx` | Resolvido | Normalização unificada de papéis administrativos (`ADMIN`, `OWNER`, `GERENTE`, `MASTER`, `STOCK` -> `STOCKIST`) em `getUsers` e `login`; abas `Equipe` e `Configurações`, troca/criação de oficinas, diagnóstico/SQL, backup/restore, exclusão de O.S./usuários/peças e edição de peças/redefinição de senha agora exigem perfil administrativo (`isAdmin`), além de remover o bypass por `username === 'admin'`. |
| Injeção de Filtro PostgREST no Link Público | Alta | `/services/supabaseService.ts` | Resolvido | Substituída a interpolação em `.or(\`id.eq.${idOrQr},qrCode.eq.${idOrQr}\`)` em `getUTVPassportById` por consultas parametrizadas separadas com `.eq('id', ...)` e `.eq('qrCode', ...)`. |
| Injeção de HTML (XSS) na Impressão de Etiquetas e O.S. | Média | `/App.tsx`, `/components/OSPrintDocument.tsx` | Resolvido | Escapamento completo de `&`, `<`, `>`, `"` e `'` em `buildLabelsPrintHtml` (incluindo nome da peça, Part Number, categoria, gaveta e texto do QR Code) e no título do documento em `OSPrintDocument`. |
| Exposição de Chave Gemini no Bundle do Navegador | Crítica | `/vite.config.ts`, `/services/geminiService.ts`, `/App.tsx` | Resolvido | Removida a injeção de `process.env.API_KEY` / `GEMINI_API_KEY` no build do cliente Vite e removidas chamadas diretas da SDK no navegador (`geminiService.ts` e `fetchBRPData`). |
| Divergência de Esquema & Backup / UX de Senha | Baixa | `/supabase_schema.sql`, `/services/supabaseService.ts`, `/App.tsx` | Resolvido | Sincronizadas as conversões `NUMERIC` das colunas de desconto em `history` entre `supabase_schema.sql` e `getTenantMigrationSql()`; unificado backup multi-tenant/completo; corrigido o botão `+ Nova O.S.` do cabeçalho (`passportId: ''` e `setOsInitialPartsList([])`); substituído `prompt()` por modal próprio com campo `type="password"`. |
| Políticas RLS Abertas no Banco (`USING (true)`) & Senha de Cliente | Necessita Acompanhamento | `/supabase_schema.sql`, `/services/supabaseService.ts` | Necessita Acompanhamento | Como o sistema roda hoje como SPA estática no Netlify usando `VITE_SUPABASE_ANON_KEY` e autenticação customizada nas tabelas `users`/`clients`, qualquer usuário técnico com a chave pública `anon` consegue consultar a API REST do Supabase fora da interface se as políticas continuarem `USING (true)` e `clients.password` permanecer legível para envio via WhatsApp. |
| Dependências Transitivas (`ws` / `@google/genai`) | Necessita Acompanhamento | `/package.json` | Necessita Acompanhamento | `@supabase/supabase-js` puxa versão transitiva de `ws` com aviso de DoS em servidor; `@google/genai` não é mais importado no bundle de cliente e pode ser removido de `package.json` se não houver backend proxy futuro. |

## Verificações de Salvaguardas Ativas

| Salvaguarda | Como Foi Verificada |
| :--- | :--- |
| Autenticação de Funcionários via RPC com `pgcrypto` | Verificado em `supabase_schema.sql` (`login_user` usando `crypt(p_password, u.password)`) e em `services/supabaseService.ts` (sem fallback para leitura direta da tabela `users` ou comparação em texto puro no cliente). |
| Autenticação do Espelho do Cliente via RPC | Verificado em `services/supabaseService.ts` (`authenticateClient` chama exclusivamente `authenticate_client_mirror`, sem fallback `SELECT * FROM clients`). |
| Escapamento HTML na Impressão | Verificado em `/App.tsx` (`buildLabelsPrintHtml`) e `/components/OSPrintDocument.tsx` (`escapeHtml`). |
| Build & Lint sem Erros | Verificado por execução conjunta de build de produção Vite e verificação de tipos/lint TypeScript. |

---

## PoC Verification

### Cenário 1: Bloqueio de Atalhos Rápidos e Senhas Padrão em Produção
- **Comportamento Anterior:** A tela de login exibia 3 botões de acesso rápido com credenciais expostas (`admin / admin`, `carlos / 123`, `guilherme / 123`), e `handleLogin` aceitava usuários seed hardcoded e senha `123`/`admin` quando `!u.password`.
- **Teste / Trace Passo a Passo:**
  1. Abrir a URL de produção (`/`) sem sessão autenticada.
  2. Verificar que a seção *"Acesso Rápido para Iniciar Testes"* não existe no DOM.
  3. Tentar enviar `admin` / `admin` ou usuário inexistente sem RPC configurada (`login_user`).
  4. Verificar que `handleLogin` em `/App.tsx` não possui mais lista hardcoded de usuários, não aceita senha em branco/padrão (`123`/`admin`), e retorna erro claro quando a RPC falha ou credenciais são inválidas.
- **Resultado Esperado:** Nenhuma credencial padrão ou atalho de teste aparece na interface, e o login depende estritamente de credenciais válidas no banco.

### Cenário 2: Isolamento Pré-Login e Controle de Acesso para Mecânicos (`MECHANIC`)
- **Comportamento Anterior:** No mount inicial (`useEffect`), o app baixava `users`, `items`, `history`, `serviceOrders`, `clients`, etc. para o estado local antes mesmo de o usuário logar; além disso, mecânicos viam as abas `Equipe` (`users`) e `Configurações` (`config`), conseguiam excluir O.S., editar preços de peças e acessar backup/troca de oficinas.
- **Teste / Trace Passo a Passo:**
  1. Com `supabaseService.isAvailable()` verdadeiro e `isLoggedIn === false`, `loadInitialBootstrap()` carrega apenas o passaporte público específico se houver `?utv_passport=...` na URL, mantendo `users`, `clients`, `serviceOrders`, `items` e `history` vazios.
  2. Autenticar com um usuário `MECHANIC` (ex.: login de mecânico).
  3. Confirmar que `isAdmin` é `false` (apenas `UserRole.STOCKIST` recebe `true`), que as abas `Equipe` e `Configurações` não são renderizadas nos menus desktop/mobile, e que um `useEffect` redireciona imediatamente para `dashboard` caso `activeTab` aponte para `users` ou `config`.
  4. Verificar que tentativas programáticas em `deleteOS`, `deleteUser`, `resetPassword`, `handleStartEditItem`, `handleSaveEditedItem`, `handleSwitchTenant`, `handleExportFullBackupJson` e `handleImportFullBackupJson` são bloqueadas com mensagem `"Acesso Negado"`.
- **Resultado Esperado:** Mecânicos operam apenas O.S., consulta de estoque, clientes e etiquetas sem acesso administrativo, exclusões destrutivas ou gerenciamento de equipe/oficinas.

### Cenário 3: Prevenção de Injeção de Filtro PostgREST no Link Público (`?utv_passport=`)
- **Comportamento Anterior:** `getUTVPassportById(idOrQr)` interpolava diretamente `idOrQr` dentro de `.or(\`id.eq.${idOrQr},qrCode.eq.${idOrQr}\`)`, permitindo que vírgulas ou operadores PostgREST manipulassem a expressão de filtro.
- **Teste / Trace Passo a Passo:**
  1. Acessar `/?utv_passport=x,id.neq.null`.
  2. `getUTVPassportById` normaliza a string e executa `.from('utv_passports').select('*').eq('id', cleanVal).maybeSingle()` seguido (se nulo) de `.eq('qrCode', cleanVal).maybeSingle()`.
  3. O cliente Supabase envia o valor URL-encoded como literal da coluna `id` ou `qrCode`, nunca como cláusula `OR` extra.
- **Resultado Esperado:** Nenhuma manipulação de filtro PostgREST é interpretada; apenas correspondência exata de `id` ou `qrCode` é retornada.

### Cenário 4: Prevenção de XSS na Impressão de Etiquetas QR e O.S.
- **Comportamento Anterior:** `buildLabelsPrintHtml` concatenava `item.name`, `item.partNumber`, `item.boxNumber` e `qrValue` diretamente em HTML bruto usado em impressão, permitindo execução de markup injetado se um cadastro contivesse `<img src=x onerror=...>`.
- **Teste / Trace Passo a Passo:**
  1. Cadastrar ou simular um item com nome `<img src=x onerror=alert(1)>` e Part Number `"TEST&<1>"`.
  2. Acionar `buildLabelsPrintHtml([item])` para gerar o HTML de impressão.
  3. Verificar que todos os campos interpolados passam por `escapeHtml`, convertendo `<` em `&lt;`, `>` em `&gt;`, `&` em `&amp;`, `"` em `&quot;` e `'` em `&#39;`.
- **Resultado Esperado:** O HTML gerado renderiza o texto literalmente sem executar scripts ou quebrar atributos.

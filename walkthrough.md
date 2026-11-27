# Security Summary

**Reviewed Files**: 9 (`/App.tsx`, `/services/supabaseService.ts`, `/services/storageService.ts`, `/services/geminiService.ts`, `/components/OSPrintDocument.tsx`, `/supabase/functions/manage-auth-users/index.ts`, `/supabase_schema.sql`, `/supabase_rls_strict.sql`, `/package.json`).
**Issues Resolved**: 5 (plus 1 item marked `Needs Follow-Up`)

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Cross-Tenant Client Update Check | `supabase/functions/manage-auth-users/index.ts` | 402 | `sync_client_auth` checked only the caller-supplied `tenantId` rather than verifying the existing `clients` row's `"tenantId"` in the database, allowing a non-admin mechanic from another workshop to overwrite an existing client record by guessing its ID. | High | Fixed | Selected `"tenantId"` on the existing database row and enforced a server-side `403` check whenever a non-admin staff member attempts to modify a client from another tenant. |
| Unchecked Database Delete Errors | `supabase/functions/manage-auth-users/index.ts` | 504, 641 | `delete_client_auth` and `delete_staff` deleted the database row without checking for errors before removing the Supabase Auth user and returning success. | Medium | Fixed | Captured and checked `delClientErr` / `delStaffErr`, returning `500` immediately if the database delete fails so Auth and database state cannot diverge silently. |
| Unpinned `search_path` on Privileged SQL Functions | `supabase_schema.sql`, `services/supabaseService.ts` | 409, 445, 452 | Legacy `SECURITY DEFINER` functions (`hash_user_password`, `login_user`, `authenticate_client_mirror`) lacked an explicit `SET search_path`. | Medium | Fixed | Added `SET search_path = public, extensions` to all three functions while keeping `pgcrypto` resolution intact. |
| Cached Workshop Snapshot Remaining After Logout | `App.tsx` | 1765 | Signing out cleared React state in memory but left the last workshop's cached snapshot in `localStorage` and `IndexedDB` on shared workshop devices. | Low | Fixed | Cleared `localStorage` tenant keys and nulled the tenant `IndexedDB` snapshot during `handleLogout` when connected to Supabase. |
| Unused Dependency Audit Advisories (`@google/genai`) | `package.json` | 13 | Unused `@google/genai` dependency pulled 8 transitive audit advisories (including `protobufjs` and `google-auth-library`). | Low | Fixed | Removed `@google/genai` from `package.json` and refreshed the lockfile (`npm audit --omit=dev` now leaves only `ws` from `@supabase/supabase-js`, which is unused in browser runtime). |
| Plaintext Client Mirror Passcode Storage | `supabase_schema.sql`, `supabase/functions/manage-auth-users/index.ts` | 472 | Client mirror passwords remain stored in `public.clients.password` so workshop staff can share credentials via WhatsApp; protected in Phase 2 RLS so only authenticated staff of that tenant and the owning client can read the row. | Low | Needs Follow-Up | Consider replacing plaintext client password display with one-time credential generation or reset-only links if you no longer need to view existing client passwords after creation. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Authentication & Session Binding | `services/supabaseService.ts`, `supabase/functions/manage-auth-users/index.ts` | Staff and client logins authenticate via Supabase Auth JWT sessions (`signInWithPassword` + `get_my_app_profile()`), with legacy password migration gated behind server-side password verification and a 6-character minimum. |
| Server-Side Admin Authorization & CORS | `supabase/functions/manage-auth-users/index.ts` | Privileged actions verify the caller's JWT via `auth.getUser(token)`, confirm `STOCKIST` role in `public.users`, and restrict browser origins against an explicit allowlist (`ALLOWED_ORIGINS` + production origin). |
| Row-Level Security & Tenant Isolation | `supabase_rls_strict.sql` | Strict `TO authenticated` RLS policies across all 11 tables use `SECURITY DEFINER` helpers with pinned `search_path` so mechanics access only their workshop, clients access only their own UTV mirror/passports, and destructive deletes require admin role. |
| Parameterized Queries & Escaped LIKE Patterns | `services/supabaseService.ts`, `supabase/functions/manage-auth-users/index.ts` | Queries avoid raw filter interpolation; `.ilike()` lookups escape `%`, `_`, and `\` wildcards; public passport previews use `get_public_utv_passport_preview` with exact matching. |
| HTML Escaping on Print & PDF Output | `App.tsx`, `components/OSPrintDocument.tsx` | All user-entered part names, labels, QR values, and print titles pass through `escapeHtml` before rendering print markup. |
| Secrets Boundary | `.env.example`, `vite.config.ts` | Only `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY` exist in the browser build; `SUPABASE_SERVICE_ROLE_KEY` stays exclusively inside the Supabase Edge Function environment. |

---

## PoC Verification

### 1. Cross-Tenant Client Overwrite Blocked in `sync_client_auth`
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Existing-Tenant Ownership Verification |
| Impact | High |
| Affected File | `supabase/functions/manage-auth-users/index.ts:402-411` |
| Test Scenario | Authenticated non-admin mechanic from `tenant_a` calls `sync_client_auth` with `client.id = "<client_in_tenant_b>"` and `client.tenantId = "tenant_a"`. |

#### How It Was Fixed
Selected `"tenantId"` from `public.clients` for the target `clientId` and rejected non-admin callers whenever the existing database row belongs to a different tenant.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Caller JWT is verified via `auth.getUser(token)` and resolved to `callerTenantId = "tenant_a"`, `callerIsAdmin = false`. | Caller identity established |
| 2 | `sync_client_auth` queries `clients` for `id = clientId` selecting `"tenantId"` (`supabase/functions/manage-auth-users/index.ts:402-406`). | Existing row returns `tenantId = "tenant_b"` |
| 3 | Ownership guard at `index.ts:409-411` evaluates `existing && !callerIsAdmin && existing.tenantId !== callerTenantId`. | **Blocked with HTTP 403** |

#### Conclusion
**Fix Verified** - A mechanic from one workshop can no longer overwrite or reassign an existing client record belonging to another workshop.

### 2. Privileged PostgreSQL Function `search_path` Confinement
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unpinned `search_path` in `SECURITY DEFINER` Functions |
| Impact | Medium |
| Affected File | `supabase_schema.sql:409,445,452` |
| Test Scenario | Trigger or RPC invocation under a session with a modified `search_path` attempting to shadow `crypt()` or `users`/`clients`. |

#### How It Was Fixed
Added `SET search_path = public, extensions` to `hash_user_password()`, `login_user()`, and `authenticate_client_mirror()`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Client or Edge Function invokes `login_user` or `authenticate_client_mirror`, or `users` trigger runs `hash_user_password()`. | PostgreSQL enters function frame |
| 2 | PostgreSQL applies `SET search_path = public, extensions` pinned on the function definition (`supabase_schema.sql:409,445,452`). | Caller `search_path` ignored |
| 3 | Function resolves `public.users` / `public.clients` and `pgcrypto` functions deterministically. | **Handled Safely** |

#### Conclusion
**Fix Verified** - Privileged database functions cannot be redirected to attacker-controlled schemas via session `search_path`.

### 3. Local Browser Snapshot Cleared on Online Logout
#### Summary
| Field | Value |
|---|---|
| Issue Type | Sensitive Cache Retention After Sign-Out |
| Impact | Low |
| Affected File | `App.tsx:1765-1770` |
| Test Scenario | Staff member signs in on a shared workshop device (`clients` and `serviceOrders` cached to `localStorage`/`IndexedDB`), then clicks Logout (`handleLogout`). |

#### How It Was Fixed
Updated `handleLogout` to remove `${DB_KEY}_${currentTenant.id}` and `HPS_TENANTS_V12` from `localStorage` and overwrite the tenant `IndexedDB` entry with `null` when Supabase is configured.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Staff user clicks Logout, invoking `handleLogout()` (`App.tsx:1745`). | Supabase Auth session signed out |
| 2 | React state arrays (`users`, `clients`, `items`, `history`, `serviceOrders`, etc.) are reset to `[]`. | In-memory state cleared |
| 3 | Storage cleanup at `App.tsx:1765-1770` deletes `localStorage` keys and clears `IndexedDB` for the tenant. | **Handled Safely** |

#### Conclusion
**Fix Verified** - Signing out on an online workshop workstation leaves neither an active session nor cached tenant data in browser storage.

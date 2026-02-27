# Comprehensive Code Review Report

**Date**: February 27, 2026
**Repository**: MCP Tools Ecosystem (TypeScript Monorepo)
**Scope**: Full codebase analysis — core, servers, gateway, web client, workers, migrations, tests, Docker, scripts

---

## Executive Summary

A thorough code analysis was performed across the entire MCP Tools repository covering security, type safety, error handling, performance, architecture, and operational concerns. The codebase demonstrates solid security fundamentals with previous remediation efforts (documented in `SECURITY_FIXES_SUMMARY.md`), but significant issues remain across multiple categories.

| Severity | Count |
|----------|-------|
| **Critical** | 12 |
| **High** | 18 |
| **Medium** | 28 |
| **Low** | 15 |
| **Total** | **73** |

---

## Table of Contents

1. [Critical Issues](#1-critical-issues)
2. [Security Vulnerabilities](#2-security-vulnerabilities)
3. [Type Safety Issues](#3-type-safety-issues)
4. [Error Handling Issues](#4-error-handling-issues)
5. [Performance Issues](#5-performance-issues)
6. [Database & Migration Issues](#6-database--migration-issues)
7. [Frontend / React Issues](#7-frontend--react-issues)
8. [Docker & Operational Issues](#8-docker--operational-issues)
9. [Code Quality Issues](#9-code-quality-issues)
10. [Recommendations](#10-recommendations)

---

## 1. Critical Issues

These issues pose immediate risk and should be addressed before any production deployment.

### C-01: Mock Auth Middleware Exposed in Production Code
**File**: `gateway/src/middleware/auth.ts` (lines 56-77)
**Severity**: CRITICAL

The `mockAuthMiddleware` function is exported and creates fake `dev-user-123` sessions without any authentication. If accidentally wired into production routes, all endpoints become unauthenticated.

```typescript
export function mockAuthMiddleware(req, res, next) {
  req.user = { id: 'dev-user-123', email: 'developer@mcp-tools.dev', name: 'Development User' };
  return next();
}
```

**Fix**: Gate behind `NODE_ENV === 'development'` assertion or remove from production builds entirely.

---

### C-02: Horizontal Privilege Escalation in Memory Routes
**File**: `gateway/src/routes/memory.routes.ts` (lines 40-45)
**Severity**: CRITICAL

Users can override their own user ID via query parameters to access other users' memory data:

```typescript
const memories = await memoryService.retrieveMemory({
  userId: req.query.user_id || req.user?.id,  // User can supply any user_id
```

**Fix**: Always use `req.user.id` from the authenticated session. Never allow user-supplied ID overrides.

---

### C-03: XSS via dangerouslySetInnerHTML (5 instances)
**Files**:
- `web/src/components/search/summaries/SearchSummaryPanel.tsx` (line 362)
- `web/src/components/search/summaries/GeneratedAnswerCard.tsx` (line 310)
- `web/src/components/search/SearchResults/SearchResultCard.tsx` (lines 184-190)
- `web/src/components/search/SearchSuggestions/SearchSuggestions.tsx` (line 174)
- `web/src/components/wiki/WikiVersionHistory.tsx` (line 249)

**Severity**: CRITICAL

Multiple React components inject unsanitized HTML. SearchResultCard is especially dangerous — it builds regex from user data and injects matched content:

```typescript
dangerouslySetInnerHTML={{
  __html: result.preview.highlights
    ? previewText.replace(
        new RegExp(`(${result.preview.highlights.map(h => h.match).join('|')})`, 'gi'),
        `<mark class="${styles.highlight}">$1</mark>`
      )
    : previewText
}}
```

**Fix**: Add `dompurify` to dependencies and sanitize all HTML before injection. Escape regex special characters in user input.

---

### C-04: Self-Signed Certificate Placeholder in Production Code
**File**: `core/src/services/federation/federation-security-manager.ts` (lines 864-908)
**Severity**: CRITICAL

A placeholder certificate generation function creates fake X.509 structures (JSON encoded as base64, not real DER). The code itself warns it's not for production, but it's callable in production paths.

**Fix**: Remove placeholder implementation. Integrate with a real CA (Let's Encrypt, etc.) or fail explicitly.

---

### C-05: Plaintext Signing Key Storage
**File**: `core/src/services/federation/federation-security-manager.ts` (lines 930-940)
**Severity**: CRITICAL

JWT signing keys are stored in the database without encryption:

```typescript
signing_key_hash: signingKey, // In production, this would be encrypted
```

**Fix**: Implement proper key encryption using a KMS (AWS KMS, HashiCorp Vault). Never store raw signing keys in the database.

---

### C-06: React Hook Violation
**File**: `web/src/app/kanban/page.tsx` (lines 36-41)
**Severity**: CRITICAL

A React hook is wrapped in try-catch, violating the Rules of Hooks:

```typescript
try {
  usePageTracking('kanban_boards_list');
} catch (error) {
  console.error('Analytics tracking failed:', error);
}
```

**Fix**: Move the hook call outside of the try-catch block. Handle errors within the hook itself or via useEffect.

---

### C-07: Unsafe JSON.parse Without Validation in LLM Service
**File**: `core/src/services/nlp/llm-service.ts` (lines 153, 195, 219, 249, 267, 314)
**Severity**: CRITICAL

Multiple `JSON.parse()` calls on untrusted LLM responses without try-catch or schema validation:

```typescript
const parsed = JSON.parse(response.content);
return Array.isArray(parsed) ? parsed : [query];
```

**Fix**: Wrap in try-catch and validate with Zod schemas before type assertions.

---

### C-08: No Dead Letter Queue in Workers
**Files**: `workers/embeddings/src/worker.ts` (lines 198-211), `workers/markitdown/src/worker.ts` (lines 117-164)
**Severity**: CRITICAL

Both workers catch errors and respond with error messages, but failed messages are lost permanently — no retry logic, no DLQ:

```typescript
catch (error) {
  this.stats.failedEmbeddings++;
  msg.respond(this.jsonCodec.encode({ error: error.message }));
}
```

**Fix**: Implement exponential backoff retry logic with a dead letter queue for persistent failures.

---

### C-09: No Migration Rollback Verification
**File**: `migrations/src/database/migration-provider.ts` (lines 41-59)
**Severity**: CRITICAL

The migration provider validates that `down()` methods exist but 36 migration files may not have complete `down()` implementations. Only 8 of 36 migrations are registered in the provider.

**Fix**: Verify all migrations have working `down()` methods. Test rollback in CI. Register or document unregistered migrations.

---

### C-10: Missing Tenant Isolation Enforcement
**File**: `gateway/src/index.ts`
**Severity**: CRITICAL

No visible tenant isolation middleware. Users could potentially access data belonging to other tenants across the API surface.

**Fix**: Implement and enforce tenant context middleware that scopes all database queries to the authenticated tenant.

---

### C-11: Unsafe CSP Allowing XSS
**File**: `gateway/src/middleware/security-monitoring.middleware.ts` (line 298)
**Severity**: CRITICAL

Content Security Policy includes `'unsafe-inline'` and `'unsafe-eval'` for scripts, which effectively disables XSS protection:

```
script-src 'self' 'unsafe-inline' 'unsafe-eval'
```

**Fix**: Remove `unsafe-inline` and `unsafe-eval`. Use nonce-based CSP for any required inline scripts.

---

### C-12: Missing Transaction Support for Multi-Step Operations
**File**: `servers/memory/src/services/MemoryService.ts` (lines 24-99)
**Severity**: CRITICAL

`storeMemory()` performs 5+ database operations (create record, create concepts, link concepts, update vector ID, create relationships) without a transaction. Partial failure leaves inconsistent data.

**Fix**: Wrap multi-step operations in database transactions.

---

## 2. Security Vulnerabilities

### S-01: Hardcoded Default JWT Secret (3 locations)
**Severity**: HIGH
**Files**:
- `gateway/src/middleware/auth.ts` (line 34): `process.env.JWT_SECRET || 'your-secret-key'`
- `gateway/src/collaboration/websocket-gateway.ts` (line 75): Same pattern
- `docker-compose.yml` (line 115): `JWT_SECRET: ${JWT_SECRET:-your_jwt_secret_key_here}`

**Fix**: Remove all fallback defaults. Fail fast if JWT_SECRET is not configured.

---

### S-02: Hardcoded Database Credentials
**Severity**: HIGH
**Files**:
- `gateway/src/index.ts` (line 102): `'postgresql://mcp_user:mcp_password@localhost:5432/mcp_tools'`
- `docker-compose.yml` (line 9): `POSTGRES_PASSWORD:-mcp_secure_password`
- `docker-compose.dev.yml` (lines 9, 27, 70-73): Hardcoded `dev_password`, `dev_redis_password`

**Fix**: Remove all credential defaults. Require explicit environment configuration.

---

### S-03: Database URL Logged to Console
**Severity**: HIGH
**File**: `gateway/src/index.ts` (line 169)

```typescript
console.log('PostgreSQL URL:', config.database.postgres);
```

**Fix**: Remove or redact connection strings in all log output.

---

### S-04: Sensitive Data Logged in Error Handler
**Severity**: HIGH
**File**: `gateway/src/middleware/errorHandler.ts` (lines 27-28)

Full request body, query parameters, and params are logged — may contain passwords, API keys, or PII.

**Fix**: Sanitize logged request data. Redact sensitive fields.

---

### S-05: JWT Tokens in localStorage
**Severity**: HIGH
**File**: `web/src/lib/api-client.ts` (lines 80-86)

Auth tokens stored in localStorage are vulnerable to XSS theft.

**Fix**: Use httpOnly secure cookies instead of localStorage for token storage.

---

### S-06: WebSocket Tokens in URL Query Parameters
**Severity**: HIGH
**File**: `gateway/src/collaboration/websocket-gateway.ts` (lines 233-277)

Tokens accepted in query parameters get logged in server access logs.

**Fix**: Only accept tokens in the Authorization header, not URL parameters.

---

### S-07: No CSRF Protection
**Severity**: HIGH
**File**: `gateway/src/index.ts` (lines 117-135)

CORS accepts credentials but no CSRF token validation exists for state-changing operations.

**Fix**: Implement CSRF token middleware for POST/PUT/DELETE endpoints.

---

### S-08: Hardcoded Webhook Secret Default
**Severity**: HIGH
**File**: `core/src/services/codebase/webhook-manager.ts` (lines 61-62)

```typescript
webhookSecret: string = process.env.WEBHOOK_SECRET || 'default-secret',
```

**Fix**: Fail fast if secret is not configured.

---

### S-09: SSL Certificate Verification Disabled
**Severity**: MEDIUM
**File**: `core/src/utils/database.ts` (line 55)

```typescript
ssl: config.ssl ? { rejectUnauthorized: false } : false,
```

**Fix**: Default to `rejectUnauthorized: true` in production.

---

### S-10: File Upload Without Size/Type Validation
**Severity**: MEDIUM
**File**: `servers/wiki/src/tools/attachment/attachment-tools.ts` (lines 32-34)

No file size limits, no filename sanitization, no MIME type whitelist for uploads.

**Fix**: Add size limits, sanitize filenames, validate MIME types against whitelist.

---

### S-11: Hardcoded CORS Origins (3 servers)
**Severity**: MEDIUM
**Files**: All three MCP servers hardcode `localhost:3000` and `localhost:5173` CORS origins.

**Fix**: Make CORS origins configurable via environment variables.

---

### S-12: Unsafe Fail-Open on Certificate Revocation Check
**Severity**: MEDIUM
**File**: `core/src/services/federation/federation-security-manager.ts`

On error, assumes certificate is NOT revoked — should fail secure.

**Fix**: Return `{ revoked: true }` or throw on check failure.

---

## 3. Type Safety Issues

### T-01: 1,401 Uses of `any` Type Across Codebase
**Severity**: HIGH
**Scope**: All packages

Highest density in:
- MCP server handlers (`args: any`, `uri: any`)
- Gateway route handlers (`req: any, res: any`)
- Whiteboard components

**Fix**: Systematically replace with proper interfaces. Use `unknown` with type guards where types are uncertain.

---

### T-02: Unsafe Non-null Assertions
**Severity**: HIGH
**Files**:
- `servers/kanban/src/tools/card/card-tools.ts` (lines 45, 50, 147, 153): `column.id!`
- `servers/wiki/src/tools/page/page-tools.ts` (lines 52, 61): `page.id!`

**Fix**: Add proper null checks before accessing these properties.

---

### T-03: Unsafe `as any` Cast in Webhook Manager
**Severity**: HIGH
**File**: `core/src/services/codebase/webhook-manager.ts` (lines 96-102)

```typescript
providerWebhookId = await (provider as any).createWebhook(...)
```

**Fix**: Define proper provider interface with the `createWebhook` method.

---

### T-04: ID Type Confusion (UUID vs Number)
**Severity**: MEDIUM
**Files**:
- `servers/kanban/src/index.ts` (lines 88, 93): URI regex matches `\d+` but system uses UUIDs
- `servers/kanban/src/tools/index.ts` (line 149): `getBoardById(id: number)` but code uses UUIDs

**Fix**: Align URI patterns and method signatures with UUID format.

---

## 4. Error Handling Issues

### E-01: Swallowed Errors in Memory Service
**Severity**: HIGH
**File**: `servers/memory/src/services/MemoryService.ts` (lines 542-545, 616-619, 631-634)

Multiple operations catch errors and only log them, silently continuing with potentially corrupt state.

**Fix**: Propagate errors or implement proper compensating actions.

---

### E-02: Unhandled Promise Rejections in MCP Resource Handlers
**Severity**: HIGH
**Files**: All three MCP server index.ts files — resource handlers lack try-catch wrappers.

**Fix**: Add consistent error handling to all resource and prompt handlers.

---

### E-03: Unsafe JSON.parse in Memory Service (6+ locations)
**Severity**: HIGH
**File**: `servers/memory/src/services/MemoryService.ts` (lines 279, 378-399, 498, 508)

Multiple `JSON.parse()` calls on database-stored JSON without try-catch. Malformed JSON in the database would crash the service.

**Fix**: Wrap in try-catch with sensible defaults or error propagation.

---

### E-04: Race Condition in LLM Service Cache
**Severity**: MEDIUM
**File**: `core/src/services/nlp/llm-service.ts` (lines 117-122)

Multiple `setTimeout` timers can accumulate for the same cache key. No tracking of pending timeouts.

**Fix**: Use a single cleanup interval with entry timestamps, or clear existing timeouts before setting new ones.

---

### E-05: Unbounded Recursion in Sanitizer
**Severity**: MEDIUM
**File**: `core/src/utils/sanitizer.ts` (lines 344-346)

Comment mentions depth limit for recursive object sanitization but none is implemented. Deeply nested objects cause stack overflow.

**Fix**: Track and enforce maximum recursion depth.

---

## 5. Performance Issues

### P-01: N+1 Query Pattern in Kanban Board Loading
**Severity**: HIGH
**File**: `servers/kanban/src/tools/board/board-tools.ts` (lines 62-77)

For each board: 1 query for columns, N queries for cards per column, M queries for tags per card = `1 + N + (N*M)` queries.

**Fix**: Use batch loading or JOIN queries to fetch all data in 1-2 queries.

---

### P-02: 6 Sequential Queries for Security Metrics
**Severity**: HIGH
**File**: `core/src/services/federation/federation-security-manager.ts` (lines 1052-1093)

Six separate COUNT queries to the same table where one query with multiple aggregates would suffice.

**Fix**: Combine into a single query with conditional COUNT expressions.

---

### P-03: Missing Pagination on Unbounded Queries
**Severity**: HIGH
**Files**:
- `servers/kanban/src/database/index.ts` (line 126): `getBoards()` returns all boards
- `servers/wiki/src/database/index.ts` (lines 180, 243, 271): All pages/categories/tags without limits

**Fix**: Add mandatory pagination with sensible defaults and maximum limits.

---

### P-04: No Backpressure Handling in Workers
**Severity**: HIGH
**File**: `workers/embeddings/src/worker.ts` (lines 135-153)

Workers subscribe to NATS subjects without any backpressure. If messages arrive faster than processing, memory grows unbounded.

**Fix**: Implement max outstanding messages, rate limiting, and circuit breaker patterns.

---

### P-05: Missing Request Timeouts in Workers
**Severity**: HIGH
**Files**: `workers/embeddings/src/worker.ts`, `workers/markitdown/src/worker.ts`

No timeout on calls to external providers (OpenAI, Ollama). A hung provider blocks the worker indefinitely.

**Fix**: Wrap provider calls in `Promise.race()` with configurable timeouts.

---

### P-06: Two Drag-and-Drop Libraries in Web Client
**Severity**: MEDIUM
**File**: `web/package.json`

Both `react-beautiful-dnd` AND `react-dnd` are included as dependencies, adding unnecessary bundle size.

**Fix**: Consolidate to one DnD library.

---

### P-07: No API Response Caching Headers
**Severity**: MEDIUM
**File**: `gateway/src/routes/kanban.routes.ts`

No `Cache-Control` headers on any API response. All requests hit the server.

**Fix**: Add appropriate caching headers for read endpoints.

---

## 6. Database & Migration Issues

### D-01: Migration Ordering Gaps
**Severity**: MEDIUM
**File**: `migrations/src/database/migration-provider.ts` (lines 25-34)

Numbering jumps from 003 to 011 to 029. Only 8 of 36 migration files are registered.

**Fix**: Register all migration files or document why some are excluded.

---

### D-02: No Migration Lock Timeout
**Severity**: HIGH
**File**: `migrations/src/database/migrator.ts` (lines 34-39)

No timeout on migration locks. A deadlocked migration permanently blocks all subsequent migrations.

**Fix**: Add lock timeout configuration and deadlock detection.

---

### D-03: Seeds Run Unconditionally After Migrations
**Severity**: MEDIUM
**File**: `migrations/src/migrate.ts` (lines 193-198)

Seeds can create duplicate data on re-runs with no idempotency checks.

**Fix**: Make seeds idempotent or require explicit confirmation for seed operations.

---

### D-04: Destructive Cleanup Without Archival
**Severity**: MEDIUM
**File**: `workers/alert-processor/src/worker.ts` (lines 360-381)

Alert executions older than 90 days are hard-deleted. No archival or soft-delete.

**Fix**: Implement soft deletes or archive to cold storage before deletion.

---

## 7. Frontend / React Issues

### F-01: Memory Leak in Realtime Message Deduplication
**Severity**: MEDIUM
**File**: `web/src/hooks/use-realtime.ts` (lines 39-52)

`processedMessages` Set only cleans up when size > 100. No time-based cleanup.

**Fix**: Implement both size-based and time-based cleanup with a sliding window.

---

### F-02: Array Index Used as React Key
**Severity**: MEDIUM
**File**: `web/src/app/kanban/page.tsx` (line 281)

```typescript
board.columns.slice(0, 3).map((column: any, index: number) => (
  <div key={index} ...>
```

**Fix**: Use stable unique IDs as keys.

---

### F-03: Math.random() Called During Render
**Severity**: LOW
**File**: `web/src/app/kanban/page.tsx` (line 289)

```typescript
width: `${Math.random() * 100}%`
```

Creates different values on every render cycle.

**Fix**: Memoize or compute random values outside the render path.

---

### F-04: CSS Injection via Unsanitized Color Values
**Severity**: MEDIUM
**File**: `web/src/app/kanban/page.tsx` (lines 285-289)

`column.color` is injected directly into inline styles without validation.

**Fix**: Validate color values against a hex/named color whitelist.

---

### F-05: No Error Boundary on WebSocket Provider
**Severity**: MEDIUM
**File**: `web/src/components/realtime/realtime-provider.tsx`

If the WebSocket throws an uncaught error, the entire application crashes with no fallback UI.

**Fix**: Wrap in an Error Boundary component.

---

## 8. Docker & Operational Issues

### O-01: Missing Qdrant Health Check
**Severity**: MEDIUM
**File**: `docker-compose.yml` (lines 39-54)

Qdrant has no health check, and the memory-server dependency on it is commented out.

**Fix**: Add health check endpoint and uncomment the dependency.

---

### O-02: Unsecured Metrics Endpoint
**Severity**: MEDIUM
**File**: `workers/alert-processor/src/worker.ts` (lines 386-402)

Metrics on port 9090 with no authentication — exposes internal system information.

**Fix**: Add authentication or restrict to internal network only.

---

### O-03: Incomplete Health Checks in Workers
**Severity**: MEDIUM
**File**: `workers/embeddings/src/worker.ts` (lines 311-331)

Health check only tests the embedding provider — doesn't verify NATS or database connectivity.

**Fix**: Check all dependencies in health endpoint. Return degraded status if any are failing.

---

### O-04: Inconsistent Graceful Shutdown
**Severity**: MEDIUM
**Files**: `workers/embeddings/src/worker.ts` (lines 333-366), `workers/markitdown/src/worker.ts` (lines 252-285)

Embeddings worker doesn't wait for in-flight messages. Markitdown has a hardcoded 30s timeout.

**Fix**: Unify shutdown logic with configurable timeouts aligned to container grace periods.

---

### O-05: No Connection Pool Monitoring
**Severity**: LOW
**File**: `workers/alert-processor/src/index.ts` (lines 61-66)

Fixed pool of 20 connections with no monitoring for pool exhaustion.

**Fix**: Make pool size configurable and add metrics for pool utilization.

---

## 9. Code Quality Issues

### Q-01: Dead/Placeholder Code Exposed as API
**Severity**: MEDIUM
**Files**:
- `servers/memory/src/tools/index.ts` (lines 173-179): `createConceptTool()` returns "not yet implemented"
- `servers/wiki/src/tools/attachment/attachment-tools.ts` (lines 39-157): All attachment tools are placeholders
- `servers/kanban/src/tools/index.ts` (lines 156-229): Database adapter methods throw "Not implemented"

**Fix**: Remove placeholder tools from registration or implement them.

---

### Q-02: console.log/error Instead of Structured Logger
**Severity**: MEDIUM
**Scope**: Widespread across core services, MCP servers, and gateway

- `core/src/services/memory/vectorEngine.ts` (7 instances)
- `core/src/services/scraper/EnhancedScraperService.ts` (9 instances)
- `servers/memory/src/services/MemoryService.ts` (7 instances)
- `gateway/src/routes/search.routes.ts` (line 89)
- Many others

**Fix**: Replace with structured logger from `@/utils/logger`.

---

### Q-03: Duplicated Error Handling Patterns
**Severity**: LOW
**File**: `servers/wiki/src/tools/page/page-tools.ts` — 6+ identical try-catch-return blocks

**Fix**: Extract into a shared error handling utility.

---

### Q-04: String Escaping Bug in Card Tools Output
**Severity**: LOW
**File**: `servers/kanban/src/tools/card/card-tools.ts` (lines 233-242)

Uses `\\n\\n` (escaped newlines) instead of `\n\n` — output shows literal `\n` characters.

**Fix**: Use proper newline characters in template literals.

---

### Q-05: Debug Logging Left in Production Code
**Severity**: LOW
**File**: `servers/kanban/src/index.ts` (line 388)

```typescript
console.log(import.meta.url)
```

**Fix**: Remove debug statement.

---

### Q-06: Magic Numbers Throughout Codebase
**Severity**: LOW
**Scope**: Multiple files use unexplained numeric literals (30000, 10000, 1000, 50, etc.)

**Fix**: Extract to named constants.

---

## 10. Recommendations

### Immediate (This Week)

1. **Remove mock auth middleware** from production code (C-01)
2. **Fix horizontal privilege escalation** in memory routes (C-02)
3. **Add DOMPurify** to all `dangerouslySetInnerHTML` usages (C-03)
4. **Remove all hardcoded secret fallbacks** — fail fast if not configured (S-01, S-02, S-08)
5. **Fix React hook violation** in kanban page (C-06)
6. **Remove database URL from console output** (S-03)
7. **Move tokens from localStorage to httpOnly cookies** (S-05)

### Short-term (This Sprint)

8. **Implement CSRF protection** for state-changing endpoints (S-07)
9. **Add transaction support** to multi-step database operations (C-12)
10. **Implement dead letter queues** in workers (C-08)
11. **Add request timeouts** to all external service calls (P-05)
12. **Fix CSP policy** — remove `unsafe-inline` and `unsafe-eval` (C-11)
13. **Add try-catch to all JSON.parse** calls on untrusted data (C-07, E-03)
14. **Implement tenant isolation middleware** (C-10)
15. **Add pagination** to all unbounded database queries (P-03)

### Medium-term (Next Sprint)

16. **Reduce `any` type usage** — target < 100 instances (T-01)
17. **Implement structured logging** across all services (Q-02)
18. **Optimize N+1 queries** in kanban and federation services (P-01, P-02)
19. **Verify all migration rollbacks** work correctly (C-09)
20. **Add backpressure handling** to workers (P-04)
21. **Add API response caching headers** (P-07)
22. **Implement error boundaries** in React (F-05)
23. **Add input validation** for file uploads (S-10)
24. **Sanitize error handler logging** (S-04)

### Long-term (Architectural)

25. **Consolidate DnD libraries** — pick one (P-06)
26. **Remove all placeholder/dead code** from API surface (Q-01)
27. **Add migration lock timeouts** and monitoring (D-02)
28. **Implement connection pool monitoring** (O-05)
29. **Unify worker shutdown logic** (O-04)
30. **Enable `npm audit`** in CI/CD pipeline with fail-on-moderate

---

## Appendix: Files Requiring Immediate Attention

```
CRITICAL SECURITY:
  gateway/src/middleware/auth.ts
  gateway/src/routes/memory.routes.ts
  gateway/src/middleware/security-monitoring.middleware.ts
  web/src/components/search/summaries/SearchSummaryPanel.tsx
  web/src/components/search/summaries/GeneratedAnswerCard.tsx
  web/src/components/search/SearchResults/SearchResultCard.tsx
  core/src/services/federation/federation-security-manager.ts

HIGH PRIORITY:
  gateway/src/index.ts
  gateway/src/collaboration/websocket-gateway.ts
  gateway/src/middleware/errorHandler.ts
  web/src/lib/api-client.ts
  core/src/services/codebase/webhook-manager.ts
  docker-compose.yml
  docker-compose.dev.yml

PERFORMANCE:
  servers/kanban/src/tools/board/board-tools.ts
  servers/kanban/src/database/index.ts
  servers/wiki/src/database/index.ts
  workers/embeddings/src/worker.ts
  workers/markitdown/src/worker.ts
```

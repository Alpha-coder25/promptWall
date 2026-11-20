# PromptWall Console

The PromptWall security-operations frontend. It is a separate application from the Python
gateway in this repository and does not change it.

The console is built to be deployed on its own (Vercel) and wired to a PromptWall gateway later.
Until `VITE_API_BASE_URL` is set, it runs in **fixture mode**: a deterministic, clearly labelled
synthetic dataset. No fixture number is a measured security result.

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
npm run preview    # serve dist locally
```

Requires Node 18+ (developed on Node 24).

## Deploy on Vercel

The Vite app lives in `frontend/`. Either:

1. **Dashboard:** import the repository, set **Root Directory** to `frontend`, framework
   preset Vite. `frontend/vercel.json` supplies the SPA rewrite and security headers.
2. **CLI:**

```bash
cd frontend
npx vercel login
npx vercel --prod
```

Set `VITE_API_BASE_URL` in the Vercel project environment when a gateway exists. Without it,
the deployed console is a UI demo in fixture mode.

## Screens

| Route | Screen | State |
|---|---|---|
| `/overview` | Security posture, activity, decisions, recent events, high-risk sessions, health | fixture |
| `/events` | Filterable event explorer with CSV export | fixture |
| `/events/:id` | Investigation view: decision explanation, evidence spans, message inspection, pipeline, related activity | fixture |
| `/sessions`, `/sessions/:id` | Session risk, timeline, channel distribution, related tool calls | fixture |
| `/approvals` | Tool approval queue with exact arguments, hash binding and reviewer confirmation | fixture |
| `/policies` | Mode, thresholds, fail behavior, response text, YAML, version history | fixture |
| `/projects` | Project cards, creation, scope selection | fixture |
| `/keys` | Key generation (shown once), revocation, integration snippets | fixture |
| `/evaluation` | Benchmark run view, per-category recall, run history | fixture, explicitly illustrative |
| `/alerts` | Notification center | fixture |
| `/settings` | Connection, notifications, appearance, about | fixture |
| `/demo` | Secure Document Assistant (protected vs unprotected) | local simulation |

## Architecture

```
frontend/
  src/
    main.tsx              providers (QueryClient, Router)
    App.tsx               routes, lazy page loading
    index.css             Tailwind layers, panel/table/button primitives
    types.ts              frontend data model
    context/workspace.tsx selected project + time range (localStorage)
    lib/
      api.ts              data-access seam; every screen calls this module
      mock.ts             deterministic fixture dataset
      demoAssistant.ts    Secure Document Assistant simulation
      utils.ts            formatting helpers
    components/
      layout.tsx          sidebar, top bar, project selector, notifications
      ui.tsx              Button, Panel, badges, risk bar, modal, drawer, toasts, states
      charts.tsx          Recharts wrappers with the shared palette
    pages/                one file per route
```

- **Server state** is TanStack Query, keyed by project and filters.
- **UI state** is local `useState`; the only global state is the selected project + time range.
- **No client state library** beyond that.
- All rendering of prompts, documents and tool arguments is plain text (`pre`, `code`), never
  `dangerouslySetInnerHTML`.
- API keys are never persisted; the one-time secret lives only in component state.

Design tokens (Tailwind): base `#070B12`, surface `#0C121C`, raised `#111A28`, line `#1B2637`,
accent `#22D3EE`, success `#34D399`, warning `#FBBF24`, danger `#FB7185`. Inter for UI,
JetBrains Mono for identifiers and scores.

## Backend integration

`src/lib/api.ts` is the only place that needs to change. Implement the same function signatures
with `fetch` against `VITE_API_BASE_URL`.

### Endpoints the Week 1 gateway already has

| Endpoint | Used for | Notes |
|---|---|---|
| `GET /healthz` | sidebar + overview health | returns `{status, db}`; no version field yet |
| `GET /admin/events?project_id&decision&start&end&limit` | events, overview | no pagination; limit max 500; no category/channel/severity/search/detail |
| `GET /admin/projects` | project picker | **does not exist yet**; only `POST /admin/projects` exists |
| `POST /admin/projects` | create project | returns `{project, api_key, policy_version}` |
| `POST /admin/projects/{id}/keys` | key generation | returns `{id, api_key, label}` |
| `DELETE /admin/keys/{id}` | revoke | returns `{revoked, id}`; no list endpoint |
| `PUT /admin/projects/{id}/policy` | save policy | YAML only; no `GET` policy endpoint |
| `POST /v1/chat/completions` | demo proxy path | not called by this console |

Admin authentication is `Authorization: Bearer <ADMIN_TOKEN>`. **Do not ship that token in a
Vite bundle or localStorage.** Live integration needs one of:

1. a same-origin serverless proxy that injects the admin token server-side, or
2. a real session/login flow with httpOnly cookies on the backend.

### Proposed contracts (not implemented by the gateway)

These are drafts for the backend work needed by this UI. Field names follow the existing models.

```jsonc
// GET /admin/projects -> 200
{ "projects": [ { "id": "uuid", "name": "Support Copilot", "mode": "balanced",
  "fail_mode": "closed", "store_raw_text": false, "retention_days": 30,
  "created_at": "iso", "active_policy_version": 4 } ] }

// GET /admin/events?project_id&decision&category&channel&severity&from&to&q&page&page_size
{ "total": 240, "page": 1, "page_size": 25,
  "events": [ { "id": "uuid", "request_id": "uuid", "session_id": "uuid",
    "project_id": "uuid", "decision": "block", "final_score": 0.83,
    "inspection_status": "inspected", "latency_ms": 7, "policy_version": 4,
    "content_hash": "sha256", "created_at": "iso",
    "detections": [ { "category": "INSTRUCTION_OVERRIDE", "layer": "heuristic",
      "score": 0.9, "evidence_span": { "start": 12, "end": 41,
      "preview": "██████ ███ ████████ ████████████" } } ],
    "messages": [ { "position": 2, "role": "user", "channel": "retrieved_document",
      "trust_level": "untrusted", "label_source": "application",
      "normalization_flags": ["ZERO_WIDTH_REMOVED"],
      "redacted_text": "…", "sanitized_text": "…" } ],
    "explanation": { "summary": "…", "signals": ["…"],
      "policy_applied": "balanced mode · policy v4", "session_influence": null } } ] }

// GET /admin/events/{id} -> a single event with messages + detections
// GET /admin/sessions?project_id&from&to&status&q -> { sessions: [...] }
// GET /admin/sessions/{id} -> { session, events, tool_calls }
// GET /admin/approvals?project_id&status -> { approvals: [...] }
// POST /admin/approvals/{id}/decision
//   body { "decision": "approve" | "reject", "args_hash": "…", "comment": "…" }
//   server must reject a hash mismatch with 409 and must be the enforcement point.
// GET /admin/keys?project_id -> { keys: [{ id, label, created_at, last_used_at, revoked_at }] }
// GET /admin/projects/{id}/policy -> { version, mode, thresholds, refusal_text, yaml, history }
// GET /admin/alerts -> { alerts: [...] }
// POST /eval/runs, GET /eval/runs/{id} -> evaluation harness (not built)
```

### Field mismatches to resolve

- `GET /admin/events` returns flat request rows without detections or messages. The event
  explorer needs either a detail endpoint or an expanded list payload.
- Sessions exist in the schema but are not populated or aggregated; `/admin/sessions` is absent.
- Tool calls, approvals and alerts have no tables or endpoints in Week 1.
- The decision engine reads `projects.mode`; `mode` inside policy YAML is stored but does not
  change enforcement. The console warns about this on the Policies screen.
- `admin_users` exists but no endpoint authenticates against it, so there is no RBAC.

## Fixture mode

`src/lib/mock.ts` generates the dataset with a seeded PRNG so screens are stable across reloads.
It also labels the app in the sidebar, top bar and Overview banner. Demo actions append real
entries to the in-memory arrays so the event, session and approval screens update during a
presentation.

The evaluation screen is doubly labelled: fixture plus "do not cite". A benchmark is evidence
for one dataset and configuration, not a protection guarantee.

## Secure Document Assistant

`/demo` runs entirely in the browser. The protected path uses a local regex scan to illustrate
inspection, span removal and a gated tool call. It is not the gateway detector, and no approval
is enforced by a backend. The UI states this in the page, the tool panel and every approval note.

## Known gaps

- No real authentication UI. The admin token is a shared secret and is not stored in the browser.
- Fixture data only; live adapters are not written yet because the gateway is not deployed.
- No approval endpoint, so approvals cannot survive a refresh.
- Alerts, sessions and evaluations are read-only or local-only.
- No automated tests yet; `npm run typecheck` and the Vite build are the current checks.

# Known limitations (Week 1)

PromptWall Week 1 is a working detection core and audit trail, not a finished security
product. This file lists what is missing and where the implementation is weaker than
the PRD/TRD. Do not describe any item here as protected.

## Not built this week

- **Classifier** (Week 2): detection is heuristic only. No ONNX model, no trained
  encoder, no measured recall.
- **LLM judge** (Week 2): uncertain decisions are resolved by the policy mode, not by
  a second opinion.
- **Calibration** (Week 2): every weight and threshold in
  `src/promptwall/core/scoring.py` is marked PROVISIONAL and was chosen by hand. No
  benchmark number in this repository is a measured protection rate.
- **Tool-call enforcement** (Week 3): no interceptor, policy gate, signed
  authorizations, approvals or `SecureToolExecutor`. A model can still ask for a tool
  call and the application can still run it unchecked.
- **Output inspection** (Week 3): responses are passed through; no canary, secret,
  PII or URL checks on model output.
- **Streaming** (P1): `stream: true` returns HTTP 400 `unsupported_feature`.
- **Dashboard, Python SDK, evaluation harness, other providers, sessions, playbooks,
  adaptive red-team agent, rate limiting, metrics endpoint** (Weeks 2–4 / P2).

## Detection gaps

- **Answer manipulation is not detected.** Content that only changes the substance of
  an answer (inserting an advertisement, biasing a summary, changing a number) usually
  contains no injection pattern and is outside heuristics.
- **Heuristics are keyword and pattern based.** Paraphrase, novel wording and
  multi-turn setup can pass. The evasion suite covers character-level obfuscation
  (zero-width, tags, homoglyphs, base64, hex, NFKC fullwidth, case, spacing), not
  semantic paraphrase.
- **Mixed-script folding is a fixed table.** Only Cyrillic and Greek lookalikes in the
  table are folded; other scripts and unusual confusables are not.
- **Base64/hex decoding uses heuristics.** A payload shorter than 8 decoded characters,
  or one containing non-printable bytes, produces no view.
- **Patterns are English-only.** Non-English injections are not covered.
- **Assistant-role text is scored like user text.** The brief only fixes system, user
  and external trust; a compromised assistant message in history has the same weight as
  a user message.

## Decision and enforcement gaps

- **Sanitization is best-effort span removal.** It replaces detected spans with
  `[REMOVED BY PROMPTWALL]`. Text the detector missed stays in the forwarded prompt.
- **An external message with no sanitizable span is replaced wholesale.** The brief says
  "sanitize when spans exist, otherwise block" and also says an external message must
  never block the whole request. Week 1 resolves this by isolating the message
  (replacing its content) and continuing. A real isolation/quarantine store is Week 3.
- **The gateway cannot stop an app from acting on a response.** No enforcement layer
  exists yet, so a blocked or sanitized prompt is the whole of the protection.
- **Policy YAML supports only `mode`, `refusal_text`, `sanitize_placeholder` and a
  threshold override.** Tool policy and richer rules are later weeks.
- **`mode` in a policy document is stored but the project's mode column is what the
  decision engine uses.** Changing only `mode` in a policy version has no effect.
- **System messages are never rewritten and never block a request.** A mismatch with the
  pinned hash is recorded as `SYSTEM_PROMPT_MISMATCH` and logged, but there is no alert
  channel yet.
- **Labels are trusted if they come from the authenticated app.** The rules prevent
  trust *raising*, but a compromised application can still downgrade any message, and
  the gateway has no independent view of provenance.

## Audit and operational gaps

- **One transaction, but no outbox.** If the process dies between commit and the
  upstream call, the record exists; if the commit fails, the configured fail mode
  applies. There is no message queue.
- **Fail-open is marked but still forwards.** With `fail_mode=open` and an audit commit
  failure the request is forwarded with `X-PromptWall-Inspected: uninspected`. That is
  visible, but it is still an uninspected pass-through.
- **No retention job.** `retention_days` is stored and never enforced.
- **No rate limiting or per-project quotas.** Request flooding is bounded only by
  `max_request_bytes` and `max_messages`.
- **No metrics endpoint or alerting.** `inspection_status` is in the database and the
  headers; nothing watches the uninspected rate.
- **Admin API is a single shared token.** `admin_users` exists with roles but no
  authentication path uses it. Any holder of `ADMIN_TOKEN` can create projects, issue
  keys and rewrite policies.
- **Admin events are capped at 500 rows and are not paginated.**
- **Evidence previews mask all non-whitespace characters.** They show shape and offsets,
  not readable text, so operators cannot see the exact triggering phrase. Raw text is
  stored only when `store_raw_text` is enabled for the project.
- **No key rotation grace period.** Revocation is immediate and there is no overlap
  window.
- **SQLite is supported for demo and tests only.** PostgreSQL is the intended
  deployment. SQLite was used for the smoke demo and test suite; concurrency behavior
  there is not representative.

## Security of the gateway itself

- **No SSRF surface yet** because no URL is ever fetched; URL checks are text-only. If
  fetching is added, private ranges and cloud metadata addresses must be blocked.
- **No log-injection test harness beyond structured logging.** Message content is never
  passed to log calls, but there is no test that fuzzes log fields.
- **Upstream credentials are process-wide** (`UPSTREAM_API_KEY`), not per project.
- **`X-PromptWall-*` headers are not stripped from upstream responses.** A provider
  response that already contains those headers is passed through unchanged; the
  gateway's values are set on the outgoing response object, so in practice the gateway
  values win, but this is not tested against a hostile upstream.

## Deviations from the Week 1 brief

1. **Extra `NormalizedContent` field.** `decoded_view_spans` was added (parallel to
   `decoded_views`) so a detection inside a decoded view can be sanitized in the
   original text. The fields listed in the brief are unchanged.
2. **External no-span block is isolation, not whole-request block.** See "Decision and
   enforcement gaps" above for the conflicting rules and the chosen resolution.
3. **`admin_users` is created but unused.** The brief lists the table but only
   `ADMIN_TOKEN` authentication, so no admin user endpoints exist.
4. **Text-only content parts are flattened to a string.** A list of text parts is joined
   with newlines and forwarded as a string, because span sanitization works on a single
   original string.
5. **Extra `core/context.py` and `core/policy.py` modules.** Both are small: the
   authenticated project context passed between auth and pipeline, and policy YAML
   parsing.
6. **`greenlet` is pinned** because SQLAlchemy's asyncio bridge requires it; it is an
   implicit dependency that was not in the brief's list.
7. **`GET /admin/events` accepts an optional `project_id`.** With no filter it returns a
   global admin view. Tenant-facing code always passes `project_id` and repository
   queries filter on it.

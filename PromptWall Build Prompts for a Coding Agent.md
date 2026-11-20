# PromptWall: Build Prompts for a Coding Agent

Nov 20, 2026 · @Alphred

Paste Prompt 1 into Claude Code (or any agentic coding tool) in an empty repository to build Week 1 of PromptWall. Send Prompts 2 to 5 one at a time, only after you have checked the previous step.

## How to use these prompts

| Step | Paste | Check before moving on |
| --- | --- | --- |
| 1 | Prompt 1 | All tests pass; the smoke script shows allow, sanitize and block; the agent lists what it deferred |
| 2 | Prompt 2 | The benchmark report shows counts and confidence intervals, and hard-negative results |
| 3 | Prompt 3 | Security tests for bypass, replay and argument change pass |
| 4 | Prompt 4 | Docker Compose starts everything; the demo scenario runs end to end |
| 5 | Prompt 5 | Review findings are fixed or written into docs/limitations.md |

Keep the PromptWall PRD/TRD document open and compare the agent's choices against its trust rules. Do not accept any benchmark number you cannot reproduce with one command. Do not paste several prompts at once: scope control is the point.

## Prompt 1: Project brief and Week 1 build

### Role and goal

You are a senior Python backend and application-security engineer. Build PromptWall, a self-hosted LLM application security gateway. It is an OpenAI Chat Completions compatible proxy that detects prompt injection, will enforce agent permissions in later weeks, and records measurable security evidence. This session builds Week 1 only: a working gateway with reversible normalization, heuristic detection, a decision engine and a transactional audit log. Do not build anything listed under Out of scope.

### Non-negotiable principles

1. Detection and enforcement are separate modules. Detection scores content. Enforcement decides what is permitted.
2. Never overwrite original text. Normalization produces extra views plus an offset map.
3. Every message is untrusted unless its role is system. A label can lower a message's trust, never raise it. Unknown or trust-raising labels are ignored and flagged.
4. Commit the request, message provenance, detections and decision in ONE database transaction before forwarding upstream or refusing.
5. Failures are explicit. Every request has inspection\_status: inspected, degraded or uninspected. A fail-open pass-through is never silent: set the X-PromptWall-Inspected response header and the database field.
6. Reject unsupported features with HTTP 400 and code unsupported\_feature. Never skip them silently.
7. Never store or log raw message content by default. Store SHA-256 hashes, redacted evidence and offsets. Raw storage is a per-project opt-in.
8. Never fetch URLs found in content. Inspect them as text only.
9. Never claim a protection rate you have not measured. No invented benchmark numbers in code, docs or comments.
10. Build defensive tooling only. Attack strings in tests are inert test data.

### Stack

Python 3.11+, FastAPI, uvicorn, Pydantic v2, SQLAlchemy 2.x, Alembic, PostgreSQL 16 through Docker Compose (SQLite only for fast unit tests), httpx, structlog for JSON logs, pytest, pytest-asyncio, respx, ruff and mypy. Pin all dependency versions. Add no other dependency without a one-line reason in the README. ONNX Runtime is not needed this week.

### Repository layout

```
promptwall/
├── README.md, pyproject.toml, docker-compose.yml, Dockerfile, .env.example
├── configs/
│   ├── default_policy.yaml
│   └── taxonomy/atlas_owasp_nist_map.yaml
├── src/promptwall/
│   ├── main.py
│   ├── api/        routes_proxy.py, routes_admin.py, auth.py, schemas.py
│   ├── core/       config.py, pipeline.py, scoring.py, decision.py, channels.py
│   ├── detection/  base.py, normalize.py, heuristics.py, sanitizer.py, taxonomy.py
│   ├── providers/  base.py, openai_compat.py
│   ├── storage/    db.py, models.py, repositories.py, migrations/
│   └── telemetry/  logging.py
├── demo/week1_smoke.py
├── tests/          unit/, integration/, evasion/, compatibility/, security/
└── docs/           limitations.md
```

### Out of scope this session

Classifier, LLM judge, streaming, dashboard, SDK, tool-call gate and approvals, output inspection, session risk, playbooks, evaluation harness and other providers. Write no placeholder code for them.

### Specification: configuration and Docker

- docker-compose.yml runs api and postgres with a health check. .env.example lists DATABASE\_URL, UPSTREAM\_BASE\_URL, UPSTREAM\_API\_KEY, ADMIN\_TOKEN, LOG\_LEVEL.
- Settings load through Pydantic settings. Missing required settings stop startup with a clear message. Secrets are never logged.
- GET /healthz returns status and database connectivity.

### Specification: database

Use SQLAlchemy 2.x models as the single source of truth, with an Alembic initial migration. Tables this week:

| Table | Fields | Constraints |
| --- | --- | --- |
| projects | id uuid, name, mode, fail\_mode, pinned\_system\_prompt\_hash, store\_raw\_text, retention\_days, archived\_at | mode in (strict, balanced, lenient); fail\_mode in (open, closed) |
| api\_keys | id, project\_id, key\_hash, label, last\_used\_at, revoked\_at | key\_hash unique |
| admin\_users | id, email, role | email unique; role in (viewer, admin) |
| policies | id, project\_id, version, policy\_yaml, active, created\_by, created\_at | unique (project\_id, version); one active policy per project (partial unique index) |
| sessions | id, project\_id, external\_user\_id, risk\_score, status | status in (normal, watched, quarantined) |
| requests | id, project\_id, session\_id nullable, decision, inspection\_status, final\_score, policy\_version, detector\_versions json, latency\_ms, content\_hash, redacted\_text nullable, created\_at | decision in (allow, sanitize, block); inspection\_status in (inspected, degraded, uninspected) |
| request\_messages | id, request\_id, project\_id, position, role, channel, trust\_level, label\_source, source\_id, content\_hash, normalization\_flags json | unique (request\_id, position); channel in (system, user, assistant, retrieved\_document, tool\_output) |
| detections | id, request\_id, message\_id, layer, category, score, evidence\_span json, detector\_version | layer in (heuristic, classifier, judge); category references taxonomy\_map |
| taxonomy\_map | category primary key, atlas\_id, owasp\_id, nist\_function | seeded from YAML at startup |

Children of a request are deleted with it. Projects are archived, not deleted. Add indexes: sessions(project\_id), requests(session\_id), requests(project\_id, created\_at), request\_messages(request\_id), detections(request\_id). Every repository query that touches tenant data must filter by project\_id.

### Specification: authentication

- Project keys look like pw\_live\_ followed by 32 random URL-safe bytes. Store only the SHA-256 hash. Show the key once at creation.
- Proxy routes require a project key as a bearer token. Admin routes require ADMIN\_TOKEN as a bearer token. These are separate scopes. Compare tokens in constant time.
- Endpoints: POST /admin/projects (returns the key once), POST /admin/projects/{id}/keys, DELETE /admin/keys/{id} (revokes), PUT /admin/projects/{id}/policy (creates a new active version), GET /admin/events (filter by project\_id, decision, time range).
- Update last\_used\_at on use. Revoked, missing and invalid keys return 401 with no detail about which case applied.

### Specification: proxy

- POST /v1/chat/completions, non-streaming. Validate with Pydantic. Pass through model, temperature, max\_tokens, response\_format, tools and tool\_choice.
- Return 400 unsupported\_feature for stream=true and for image or audio content parts. Return 400 for oversized requests (configurable maximum bytes and messages).
- Forward to the upstream with httpx: connect timeout 5 s, read timeout 60 s, connection pooling, and a simple circuit breaker that opens after repeated failures. Upstream errors return a clear error body, never a stack trace.
- Add response headers X-PromptWall-Request-Id, X-PromptWall-Decision and X-PromptWall-Inspected.
- A blocked request returns HTTP 200 with a normal chat completion whose assistant message is the policy refusal text and whose finish\_reason is content\_filter. Add the decision header. Nothing is sent upstream.
- Strip the x\_promptwall field from messages before forwarding.

### Specification: messages and provenance

- Default channels: role system becomes system, user becomes user, assistant becomes assistant, tool becomes tool\_output.
- A message may carry x\_promptwall: {channel, source\_id}. Trust order from highest to lowest: system, user, retrieved\_document and tool\_output (equal and lowest). A label is accepted only if it does not raise trust above the role default. A rejected label is ignored, flagged PROVENANCE\_RAISE\_ATTEMPT, and recorded.
- If the project has pinned\_system\_prompt\_hash, flag SYSTEM\_PROMPT\_MISMATCH when the system message hash differs. System messages are inspected for integrity and never rewritten.
- Record each message in request\_messages with channel, trust\_level and label\_source (default or app).

### Specification: normalization (detection/normalize.py)

```python
@dataclass
class NormalizedContent:
    original_text: str
    canonical_text: str
    flags: list[str]                    # ZERO_WIDTH, UNICODE_TAGS, VARIATION_SELECTOR, MIXED_SCRIPT, ENCODED_VIEW
    offset_map: list[tuple[int, int]]   # canonical index -> (start, end) span in original_text
    decoded_views: list[str]            # extra views, never substituted for the original
```

- Build canonical\_text with Unicode NFKC and remove zero-width characters, Unicode tag characters and variation selectors, keeping the offset map correct for every removal.
- Fold homoglyphs only inside mixed-script tokens. Leave fully non-Latin text, math symbols and legitimate combining marks unchanged.
- Decode base64 and hex candidates into decoded\_views only when the result is valid printable text above a minimum length. Random-looking bytes produce no view. Decode Unicode tag characters into a decoded view as well.
- Every detector scores the original-derived canonical text and each decoded view and takes the maximum.
- Required unit tests: zero-width characters inside the word ignore are flagged and the canonical text is ignore; tag characters spelling an instruction produce UNICODE\_TAGS and a decoded view; a Cyrillic letter inside a Latin word is flagged and folded; a fully Cyrillic sentence is unchanged; base64 of an instruction produces a decoded view while original\_text is untouched; base64 of random bytes produces no view; math symbols survive; the offset map round-trips so a span in canonical\_text maps to the correct characters in original\_text.

### Specification: heuristic detectors (detection/heuristics.py)

All detectors implement one interface returning a DetectionResult with detector, category, score from 0 to 1, evidence (redacted snippet) and span offsets in the ORIGINAL text.

- Categories and signals: INSTRUCTION\_OVERRIDE (ignore, disregard or forget previous, above or prior instructions or rules), ROLE\_INJECTION (you are now, act as, fake system: lines, chat-template tokens such as im\_start markers), PROMPT\_LEAKAGE (reveal, print or repeat your system prompt or instructions), DELIMITER\_ABUSE (fake closing tags or fences followed by instructions), DATA\_EXFILTRATION (send or post data to a URL or address; markdown images whose URL query carries data), ENCODED\_PAYLOAD (decoded views that contain instructions).
- Each pattern has a weight from 0.3 to 0.9. Combine matches with noisy-or. Keep patterns in a data structure, not scattered in code.
- Required: a hard-negative test set of at least 15 benign sentences containing trigger words (for example how to ignore errors in Python, ignore whitespace in this regex, what a system prompt is, a manual saying to disregard step 4). Each must score below 0.3.
- Required: at least 25 positive test cases across all categories, including obfuscated variants.

### Specification: decision engine (core/scoring.py, core/decision.py)

- Implement risk(H, C, N, S, channel) with C and S fixed at 0 this week. Mark weights and thresholds PROVISIONAL in comments, to be replaced by calibration in Week 2.
- Provisional thresholds (low, high): strict 0.3 and 0.6; balanced 0.4 and 0.7; lenient 0.5 and 0.85. For retrieved\_document and tool\_output subtract 0.1 from both.
- Below low: allow. At or above high: block for the user channel, sanitize for external channels when spans exist, otherwise block. In between: strict blocks, balanced sanitizes if spans exist else allows with a flag, lenient allows with a flag.
- Sanitize replaces the offending spans in the ORIGINAL text, using offsets, with the text \[REMOVED BY PROMPTWALL\], and forwards the sanitized messages.
- A high-risk external message never blocks the whole request on its own: it is sanitized or isolated and the request continues.
- The decision records final\_score, per-detector results, flags and the policy version.

### Specification: audit, logging and taxonomy

- Write requests, request\_messages and detections in one transaction before forwarding or refusing. If the commit fails, apply the project fail\_mode, emit an emergency structured log line, and set inspection\_status accordingly.
- Use structlog JSON logs with request\_id and project\_id. Never put message content in log messages.
- configs/taxonomy/atlas\_owasp\_nist\_map.yaml maps categories to identifiers, seeded into taxonomy\_map. Starting values, to be verified against the official MITRE ATLAS and OWASP LLM Top 10 pages: direct injection AML.T0051.000, indirect injection AML.T0051.001, jailbreak AML.T0054, prompt leakage AML.T0056, data exfiltration AML.T0057, obfuscation AML.T0068; OWASP 2025 LLM01 for injection and jailbreak, LLM02 for sensitive information disclosure, LLM07 for system prompt leakage; plus a NIST AI RMF function per category.

### Tests and acceptance criteria

- Unit tests for normalization, heuristics, scoring, decision and sanitizer. Evasion tests in tests/evasion.
- Compatibility test: use the official OpenAI Python SDK against the gateway with a fake upstream (respx or a local test server). A normal request must pass through unchanged.
- Security tests: invalid, revoked and missing keys; unsupported\_feature responses; a project cannot read another project's events; the transaction rolls back cleanly on a simulated database failure; the x\_promptwall field is stripped before forwarding; a trust-raising label is ignored and flagged.
- demo/week1\_smoke.py starts from a fresh database and shows one allowed, one sanitized and one blocked request, printing the response headers and the stored decision.
- ruff and mypy pass, and all tests pass.

### Working method

1. First reply with a short plan and any blocking questions (at most three). Then build.
2. Build in small steps, write tests with the code, and run them after each step. Make small, clear commits.
3. Keep functions small and typed. Do not add features outside this scope.
4. Write a README quickstart (docker compose up, create a project, point the OpenAI SDK at the gateway) and start docs/limitations.md with the known gaps.
5. Finish with a report: what is done, what is deferred, test output, known gaps, and any place you deviated from this brief and why. Do not invent results.

## Prompt 2: Detection intelligence and evaluation (Week 2)

Context: Week 1 is merged and passing. Follow the same principles as Prompt 1. Build:

- **Datasets:** loaders with a license column for each source (LLMail-Inject, Gandalf, deepset prompt-injections, jailbreak-classification). Check each license before use and exclude any without one from redistribution. Deduplicate at text and near-duplicate level. Split into train, validation and test by source and template family, so variants of one attack never straddle splits. Lock the test split: only the final report reads it.
- **Hard negatives:** write at least 200 benign samples containing trigger words across code, security education, customer support and legal language, plus multilingual samples.
- **Classifier:** train a small encoder (about 22M parameters, license permitting) as binary and as six-label (BENIGN, DIRECT\_INJECTION, INDIRECT\_INJECTION, JAILBREAK, PROMPT\_LEAKAGE, DATA\_EXFILTRATION), with the channel as an input feature. Compare both on validation by recall at 1% false positives. Export the winner to ONNX and run on CPU. Keep model files out of git; provide a download or build script.
- **Calibration:** fit the scoring weights and per-channel bias with logistic regression on the validation split. Choose thresholds per channel and mode: the high threshold at the mode's validation false-positive target (strict 2%, balanced 1%, lenient 0.5%), and the low threshold so at most 10% of benign validation traffic falls in the uncertain band. Replace every PROVISIONAL value.
- **Judge:** a pluggable provider interface. Fixed, versioned instruction that treats inspected text as data; the text goes in a separate delimited field; strict JSON schema; malformed or empty output counts as uncertain, never safe; hard timeout; no tools; per-project calls-per-minute budget. A safe verdict cannot clear a case whose heuristic score or normalization flags exceed their own high marks. The judge never authorizes a tool call.
- **Harness:** a CLI (promptwall eval run) producing JSON and Markdown reports: recall at 1% false positives, hard-negative false-positive rate, per-category recall, precision, confusion matrix, p50 and p95 latency, share sent to the judge. Every rate shows sample counts and a 95% Wilson interval. Add suites for obfuscation (zero-width, homoglyph, tags, base64, hex, leetspeak, paraphrase) and a basic adaptive-mutation runner whose variants are generated after the training freeze.

Acceptance: one command reproduces the full report from a clean checkout; no test-set number appears before the final run; report the intervals and the sample sizes. Finish with a report of limits, including the answer-manipulation gap that detectors mostly miss.

## Prompt 3: Enforcement and provenance (Week 3)

Context: Weeks 1 and 2 are merged. Follow the Prompt 1 principles. The goal is that no tool runs without a valid, bound authorization. Build:

- **Provenance:** a Python SDK package (sdk/python/promptwall\_sdk) with helpers such as retrieved\_document(text, source\_id) and tool\_output(text, source\_id) that set x\_promptwall labels. Keep downgrade-only rules and tests.
- **Tables:** tool\_calls, tool\_authorizations and approvals with the constraints from the design (nonce unique; approval tool\_call\_id unique; consumed\_at set once; project\_id on every tenant row).
- **Interceptor:** parse tool\_calls in the provider response, canonicalize arguments (sorted-key JSON, then SHA-256), and evaluate a YAML tool policy (allow, deny, require\_approval, argument rules such as allowed email domains, sensitivity: external\_effect).
- **Context rule:** if untrusted external content entered this turn, tools marked sensitive or external\_effect are denied or require approval.
- **Authorizations:** for allowed calls, attach a signed token (HMAC-SHA256 with a per-project key and key ID) to the response under x\_promptwall.tool\_authorizations. Claims: project, request, tool\_call, tool name, argument hash, nonce, expiry (60 seconds by default). Denied calls are removed from the response and replaced with a refusal message.
- **Approvals:** admin endpoints to list and decide pending approvals. The approver sees the exact tool and arguments. Approval issues an authorization bound to the same argument hash, valid for 10 minutes, single-use.
- **Consume endpoint:** POST /v1/tools/consume marks the nonce consumed atomically (a single UPDATE where consumed\_at is null and expires\_at is in the future, returning the row). Replays, expired tokens and changed arguments are refused.
- **SecureToolExecutor:** in the SDK. Tools are registered with it. execute(tool\_name, args, authorization) recomputes the argument hash, verifies signature and expiry, calls consume, and only then runs the registered function.
- **Output inspection:** canary tokens for system-prompt leakage, secret and PII patterns, and URL checks that never fetch.
- **RAG demo:** a small RAG app with a poisoned document, and an agent with search\_documents (allow), send\_email (require approval) and delete\_record (deny).

Security tests required: malicious retrieved document, tool-call manipulation, unauthorized execution, approval bypass attempt, argument modification after approval, replayed authorization, expired authorization, cross-project authorization use. Document honestly that an app which never calls the executor is not protected.

## Prompt 4: Dashboard and demonstration (Week 4)

Context: Weeks 1 to 3 are merged. Build a React and Vite dashboard over the admin API, and package the demo. Pages: Overview (total, allowed, sanitized and blocked counts, attack categories, recent events, inspection\_status mix), Events and event detail (decision, channel, risk score, per-detector evidence, ATLAS and OWASP tags, redacted content only), Approvals (pending tool calls with exact arguments, approve and deny wired to the real enforcement), Policies (view and edit with versioning), Evaluation (latest report with intervals, per-category recall, latency), and a Bypass view (authorizations issued but never consumed).

Also deliver: docker compose up starts gateway, database and dashboard; README with a quickstart; docs/limitations.md; attack scripts; a script that replays the same attack scenarios against an unprotected app and the protected app and writes a measured before and after report (successful attacks, dangerous tool executions, false positives on benign inputs, latency). Do not fabricate figures. Only after everything else works, and only if time remains, add buffered streaming: hold the stream until a window is inspected, buffer tool-call deltas until complete, and apply the fail mode if inspection cannot finish.

## Prompt 5: Security review pass

Context: the MVP is complete. Act as an independent application-security reviewer of this repository. For each threat below, find the code that mitigates it, write or run a test, and report pass, partial or missing: API key theft, replay of tool authorizations, approval manipulation, signing-key compromise, request flooding, judge abuse, SSRF, log injection, policy tampering, cross-project leakage, upstream credential exposure. Also verify that no message content appears in logs or error bodies, that all tenant queries filter by project\_id, that dependencies are pinned, and that unsupported features fail loudly. Fix what you can, and write every remaining gap into docs/limitations.md in plain language. Do not mark an item as passing without a test that shows it.

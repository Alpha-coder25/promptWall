# PromptWall: PRD, TRD, Architecture and Data Model

Draft v0.2 (revised after red-team review) for approval · November 20, 2026 · Working name: PromptWall (rename freely)

## 1. What changed in v0.2

This version fixes the 14 weaknesses from the red-team review, the largest being tool-call enforcement, forgeable provenance, an oversized MVP and a benchmark that could mislead.

| # | Weakness | Severity | Change in this version | Section |
| --- | --- | --- | --- | --- |
| 1 | Tool-call gate cannot stop an app from running a returned tool call | Critical | Signed, single-use authorizations plus a SecureToolExecutor SDK | 4 |
| 2 | Channel labels can be forged | Critical | Labels accepted only from the authenticated app; they can lower trust, never raise it | 4 |
| 3 | Streaming leaks output before inspection | High | Streaming moved to P1 with buffered inspection | 7 |
| 4 | Gateway is a single point of failure | High | Timeouts, circuit breaker, explicit uninspected flag | 7 |
| 5 | Normalization can destroy meaning | High | Reversible: original, canonical text, offset map, decoded views | 6 |
| 6 | Binary classifier is easy to overestimate | High | Multi-class labels, compared with binary on one held-out set | 6, 9 |
| 7 | The LLM judge can itself be attacked | High | Data/instruction separation, schema validation, advisory only | 6 |
| 8 | Thresholds and scoring undefined | High | Defined scoring formula and decision procedure | 6 |
| 9 | ER diagram and data model disagree | High | SQLAlchemy models are the single source; ER diagram is generated | 10 |
| 10 | Missing database constraints | High | Unique keys, foreign keys, checks, indexes specified | 10 |
| 11 | Async audit can lose security decisions | High | Decision and event committed in one transaction | 8 |
| 12 | MVP scope too large | Critical | Three build layers; session risk, playbooks, red-team agent, SDK extras deferred | 3, 11 |
| 13 | One-line integration is overstated | High | Written compatibility contract; renamed Chat Completions compatible (MVP) | 7 |
| 14 | Benchmark can mislead | Critical | Train, validation and test splits; confidence intervals; obfuscation, adaptive and indirect suites | 9 |

Also added: a threat table for the gateway itself (section 8), PostgreSQL as the default database, and a stronger positioning (section 2).

One limit remains by design: an app that never calls the executor can still run a tool call unchecked. Section 4 states exactly what is and is not guaranteed.

## 2. Summary and positioning

PromptWall is a self-hosted LLM application security gateway that detects prompt injection, enforces agent permissions, and produces measurable security evidence. It sits between an application and its LLM provider (OpenAI Chat Completions compatible, MVP subset).

Positioning changed from "a prompt injection firewall" to a gateway with three parts that work together:

1. **Detection:** normalization, heuristics, a small classifier and an advisory LLM judge, scored per channel.
2. **Enforcement:** provenance-aware decisions, a tool-call policy gate, and signed single-use authorizations that a SecureToolExecutor verifies before any tool runs.
3. **Assurance:** an audit trail mapped to MITRE ATLAS, OWASP LLM Top 10 and NIST AI RMF, and a reproducible benchmark that reports counts and confidence intervals.

Detection says something looks suspicious. Enforcement decides what is permitted. They are separate responsibilities and are built and tested separately.

**Honest limits:** classifier-based guards can be bypassed by adaptive attackers, so PromptWall never claims complete protection. It limits damage through enforcement, and it publishes its measured limits.

## 3. Product requirements (PRD)

The MVP delivers five demonstrable capabilities in three build layers, and defers everything else. Prompt injection is the top-ranked OWASP LLM risk, yet small teams shipping chatbots, RAG assistants and agents on hosted LLM APIs lack an affordable, self-hosted, measurable defense.

### 3.1 Goals

- G1: Block or sanitize prompt injection and jailbreak attempts before the primary model, with a measured and published false-positive rate.
- G2: Handle indirect injection from retrieved documents, emails and tool outputs by sanitizing or isolating the content, not rejecting the whole request.
- G3: Make dangerous tool calls impossible to run without a valid, bound authorization.
- G4: Integrate in under 10 minutes for the supported API subset.
- G5: Produce audit records mapped to ATLAS, OWASP and NIST AI RMF.
- G6: Ship a reproducible evaluation harness with an adaptive-attack mode.

### 3.2 Non-goals (MVP)

- Multimodal inspection, model-file scanning, bias or drift monitoring, training a foundation model.
- Guaranteeing complete protection.
- Full OpenAI API compatibility (see the contract in section 7).
- Distributed high availability.

### 3.3 User stories

1. As a developer, I change my base\_url and my supported calls keep working.
2. As a developer, I wrap retrieved documents with provenance helpers so they are scored as untrusted.
3. As a security engineer, I write a tool policy (allow, deny, require approval) and the executor enforces it.
4. As a security engineer, I see why each request was blocked or sanitized, with the detector evidence and taxonomy tags.
5. As a developer, I run one command that reports recall at a fixed false-positive rate on held-out data.
6. As a CISO, I export events mapped to ATLAS technique IDs and OWASP categories.

### 3.4 Build layers

| Layer | Purpose | Contents |
| --- | --- | --- |
| 1. Security core | Must work first | Proxy, authentication, normalization, heuristics, classifier, decision engine, transactional audit log |
| 2. Enforcement | The differentiator | Provenance, indirect-injection handling, tool-call interceptor and policy, signed authorizations, SecureToolExecutor, human approval, output inspection |
| 3. Intelligence | Shows maturity | Evaluation harness, dashboard, benchmark comparison |

### 3.5 Functional requirements

| ID | Requirement | Priority | Week |
| --- | --- | --- | --- |
| FR-1 | Chat Completions proxy, non-streaming, with tool-call response parsing | P0 | 1 |
| FR-2 | Project authentication: hashed keys, rotation, revocation | P0 | 1 |
| FR-3 | Reversible normalization with offset mapping and transformation flags | P0 | 1 |
| FR-4 | Heuristic detectors behind a common interface | P0 | 1 |
| FR-5 | Decision engine: defined scoring, allow, sanitize, block, policy modes | P0 | 1 |
| FR-6 | Transactional audit logging with ATLAS, OWASP and NIST tags | P0 | 1 |
| FR-7 | Small classifier, ONNX, CPU inference | P0 | 2 |
| FR-8 | Evaluation harness with confidence intervals | P0 | 2 |
| FR-9 | LLM judge, advisory only, hardened | P1 | 2 |
| FR-10 | Channel provenance with downgrade-only labels | P0 | 3 |
| FR-11 | Indirect-injection handling: sanitize or isolate untrusted content | P0 | 3 |
| FR-12 | Tool-call interceptor and YAML policy engine | P0 | 3 |
| FR-13 | Signed single-use authorizations and SecureToolExecutor (Python) | P0 | 3 |
| FR-14 | Human approval workflow bound to exact arguments | P1 | 3 |
| FR-15 | Output inspection: canary tokens, secrets, PII, URL checks without fetching | P1 | 3 |
| FR-16 | Dashboard: events, decisions, approvals, evaluation | P1 | 4 |
| FR-17 | Streaming with buffered inspection | P1 | after FR-1 works |
| FR-18 | Session risk scoring | P2 | after MVP |
| FR-19 | Response playbooks and webhook alerts | P2 | after MVP |
| FR-20 | Adaptive red-team agent | P2 | after MVP |
| FR-21 | JavaScript SDK, Anthropic adapter | P2 | after MVP |

### 3.6 Success metrics

Targets are hypotheses to validate, not promises. Every rate is reported with its sample counts and a 95% confidence interval.

| Metric | Target |
| --- | --- |
| False-positive rate on the benign test set | at or below 1%, with sample size reported |
| Recall at 1% FPR on the held-out test set | measured and published against open baselines |
| Hard-negative false-positive rate | measured on text containing trigger words |
| Dangerous tool executions in the demo, protected vs unprotected | 0 for denied tools, measured for both |
| Added latency p95, no-judge path | under 50 ms on CPU |
| Added latency p95, judge path | under 500 ms |
| Share of requests reaching the judge | under 10% |
| Normalization evasion suite | all known character-smuggling cases flagged |

### 3.7 Risks

| Risk | Mitigation |
| --- | --- |
| Adaptive attackers bypass the classifier | Enforcement layer, adaptive-attack evaluation, published limits |
| False positives annoy users | Sanitize instead of block, per-project thresholds, log-only mode |
| Scope creep | Three layers, P2 items frozen until the MVP demo works |
| Dataset leakage and license issues | Separate splits, license column, deduplication across splits |
| Sensitive prompts in logs | Hashes and redacted spans by default |
| Apps bypass the executor | Documented limit; managed tool execution listed as future work |

## 4. Trust model and enforcement

A proxy cannot control what an application does after it receives a response, so PromptWall enforces decisions through signed authorizations that a SecureToolExecutor must verify before any tool runs. This section is designed before the detection pipeline because detection is useless if its decisions cannot be enforced.

### 4.1 Provenance rules

The gateway authenticates the application with its project key, not the end user. The application builds the request, so the risk is an app forwarding user-controlled labels. These rules apply:

1. **Default trust:** every non-system message is untrusted. A message cannot raise its own trust.
2. **Labels from the app only:** channel labels (user, retrieved\_document, tool\_output) are accepted only on requests authenticated with a project key and only from the project's allowed label set.
3. **Downgrade-only:** a label may lower trust below the role default, never raise it. User text claiming to be a system message or a trusted document stays in the user channel.
4. **Pinned system prompt:** a project may register a hash of its system prompt. A mismatch is flagged. System messages are inspected for integrity but never rewritten.
5. **Provenance is recorded:** each message gets a record (source, source\_id, trust level, who set the label) in request\_messages, and any change is logged.
6. **Helpers set labels:** the SDK provides wrappers such as retrieved\_document(text, source\_id) so developers do not hand-write metadata.

| Channel | Trust | Inspection | Action on high risk |
| --- | --- | --- | --- |
| system | Trusted if hash is pinned | Integrity check only | Flag and alert |
| user | Untrusted | Full cascade | Sanitize or block |
| retrieved\_document | Untrusted external | Full cascade, lower thresholds | Sanitize the span or isolate the document; the request continues |
| tool\_output | Untrusted external | Full cascade, lower thresholds | Sanitize or isolate; later tool calls face stricter policy |

### 4.2 Tool-call enforcement flow

1. **Intercept:** the gateway parses tool\_calls in the provider response and canonicalizes the arguments (sorted-key JSON, then SHA-256).
2. **Evaluate:** the tool policy returns allow, deny or require\_approval, using the tool name, arguments and whether untrusted external content entered this turn.
3. **Authorize:** for allowed calls the gateway attaches a signed authorization to the response. It binds project, request, tool call, tool name, argument hash, a nonce and an expiry (60 seconds by default).
4. **Deny:** denied calls are removed from the response and replaced with a refusal message. The event is logged.
5. **Approve:** for require\_approval, an approval record is created. A human sees the exact tool and arguments. Approval issues an authorization bound to the same argument hash, valid for a longer window (10 minutes by default) and single-use.
6. **Execute:** the SecureToolExecutor recomputes the argument hash, verifies the signature and expiry, and asks the gateway to consume the nonce before it runs the tool. Replays, changed arguments and expired tokens are refused.
7. **Context rule:** if untrusted external content entered the context this turn, tools marked sensitive or external\_effect are denied or require approval, whatever their default. This blocks the combination of private data, untrusted input and external communication.

```yaml
version: 1
tools:
  - name: search_documents
    action: allow
  - name: send_email
    action: require_approval
    sensitivity: external_effect
    arg_rules:
      to: { allowed_domains: ['company.com'] }
  - name: delete_record
    action: deny
```

### 4.3 What is and is not guaranteed

| Guaranteed | Not guaranteed |
| --- | --- |
| If the app runs tools only through the SecureToolExecutor, no tool runs without a valid, unexpired, unused authorization bound to the exact arguments | An app that calls its tools directly bypasses enforcement; the gateway cannot see app code |
| Replays and post-approval argument changes are rejected | The classifier's detections remain probabilistic |

Bypass is partly detectable: the dashboard tracks authorizations that were issued but never consumed and tool executions the executor reports. Managed tool execution, where the gateway hosts the tools, is future work that would remove the bypass.

## 5. Architecture and request lifecycle

PromptWall is a stateless FastAPI service with four stages: message processing, detection, decision, and enforcement. Detection and enforcement are separate modules with separate tests. The updated architecture diagram is shown in the chat.

### 5.1 Request lifecycle

1. **Authenticate:** the API gateway layer resolves the project from its key, applies rate and size limits, and loads the active policy.
2. **Process messages:** each message receives a channel and trust level under the provenance rules (section 4.1). Original text is preserved.
3. **Normalize:** produce canonical text, transformation flags, an offset map and extra decoded views (section 6.1).
4. **Detect:** heuristics and the classifier score each message view. Obfuscation signals are features.
5. **Decide:** the decision engine combines scores, channel, flags, session state and policy (section 6.3). Uncertain cases go to the judge as one advisory signal.
6. **Act:** allow, sanitize (redact original-text spans by offset), or block. A blocked request returns a policy-defined refusal in the standard response shape.
7. **Commit the decision:** the request, per-message provenance, detections and decision are written in one database transaction before the request is forwarded or refused (section 8.2).
8. **Forward:** the provider adapter sends the request upstream, with timeouts and a circuit breaker.
9. **Inspect the response:** canary, secret, PII and URL checks run on the output (URLs are inspected, never fetched).
10. **Enforce tool calls:** the interceptor evaluates proposed tool calls and attaches signed authorizations (section 4.2).
11. **Return and log:** the response carries X-PromptWall-\* headers, including whether the request was inspected. Analytics are written asynchronously.

### 5.2 Components

| Component | Responsibility |
| --- | --- |
| API gateway layer | Authentication, project resolution, rate limiting, request validation |
| Message processor | Channel and provenance assignment, normalization |
| Detection engine | Heuristics, classifier, obfuscation analysis, optional judge |
| Decision engine | Risk scoring, policy evaluation, sanitize and block actions |
| Provider adapter | Upstream calls, timeouts, circuit breaker |
| Response inspector | Canary tokens, secrets, PII, URL checks |
| Tool interceptor and policy gate | Tool-call evaluation, signed authorizations, approvals |
| SecureToolExecutor (SDK) | Verifies authorizations and consumes nonces before running tools |
| Audit and telemetry | Transactional decision records, async analytics, metrics |
| Evaluation harness | Benchmarks, suites, confidence-interval reports |
| Dashboard | Read-only analytics and the approval interface |

### 5.3 Technology

| Layer | Choice | Note |
| --- | --- | --- |
| Language and web | Python 3.11+, FastAPI | Async, streaming-capable |
| Database | PostgreSQL (SQLite allowed for a single-instance demo) | Realistic concurrency for sessions, approvals and events |
| ORM and migrations | SQLAlchemy, Alembic | Schema is the source of truth |
| Classifier runtime | Hugging Face for training, ONNX Runtime on CPU | No GPU required |
| Judge | Pluggable: hosted small model or local | Advisory only |
| Frontend | React with Vite | Tailwind optional |
| Testing | Pytest, HTTPX | Includes an evasion suite |
| Packaging | Docker Compose | One-command setup |
| Later | Redis, Prometheus | Not in the MVP |

## 6. Detection design

Detection runs as a cascade whose every stage returns the same result shape, and whose scoring and thresholds are calibrated on validation data rather than chosen by hand.

### 6.1 Reversible normalization

Normalization never replaces the original text. It produces a structure that keeps both views and the mapping between them:

```python
@dataclass
class NormalizedContent:
    original_text: str
    canonical_text: str            # NFKC, hidden characters removed
    flags: list[str]               # ZERO_WIDTH, UNICODE_TAGS, VARIATION_SELECTOR, MIXED_SCRIPT, ENCODED_VIEW
    offset_map: list[tuple[int, int]]   # canonical index -> original span
    decoded_views: list[str]       # extra views, never substituted
```

- Hidden characters (zero-width, Unicode tags, variation selectors) are removed from the canonical view only. Their presence is a feature.
- Homoglyph folding applies only to mixed-script tokens, so legitimate non-Latin text and math symbols are left alone.
- Base64 and hex candidates are decoded into extra views only when the result is printable text above a minimum length. The detectors score every view and take the maximum.
- The sanitizer redacts spans in the original text by using the offset map, so redaction hits the right characters.

### 6.2 Classifier

The classifier is a small encoder model exported to ONNX and run on CPU. Labels:

| Label | Meaning |
| --- | --- |
| BENIGN | Ordinary input |
| DIRECT\_INJECTION | Explicit instruction override by the user |
| INDIRECT\_INJECTION | Instructions hidden in external content |
| JAILBREAK | Attempt to bypass model restrictions |
| PROMPT\_LEAKAGE | Attempt to expose system instructions |
| DATA\_EXFILTRATION | Attempt to extract or send out sensitive data |

- The channel is an input feature, because instructions inside a retrieved document are suspicious in a way the same words in a user message are not.
- A multi-class model is not assumed to beat a binary one. Both are trained and compared on the same held-out test set, and the one with better recall at 1% false positives ships. The multi-class head also supplies taxonomy tags.
- Training includes a hard-negative set: benign text that contains words like ignore, override, system, secret and password.

### 6.3 Scoring and decision

Each message view gets a heuristic score H, a classifier score C, a normalization anomaly score N and a session score S. S is fixed at 0 in the MVP, because session risk is deferred, but the field is kept so the schema does not change later.

```latex
R = \sigma\left(w_h H + w_c C + w_n N + w_s S + b_{channel}\right)
```

The weights and per-channel bias are fitted by logistic regression on the validation set, not set by hand. Thresholds are then chosen per channel and mode:

| Threshold | How it is chosen |
| --- | --- |
| High | The score at which validation false positives reach the mode target: strict 2%, balanced 1%, lenient 0.5% |
| Low | The score below which at most 10% of benign validation traffic falls into the uncertain band, which bounds judge load |

```python
r = risk(H, C, N, S, channel)
if r < low[channel]:
    decision = "allow"
elif r >= high[channel]:
    decision = "sanitize" if channel in EXTERNAL and spans else "block"
else:
    verdict = judge(content)          # advisory signal only
    decision = combine(r, verdict, policy.mode)
```

Rules that sit on top of the score:

- A high-risk retrieved document or tool output is sanitized or isolated. It does not cause the whole user request to be blocked.
- A judge verdict of safe cannot clear a case whose heuristic score or normalization flags are above their own high marks.
- The judge can move a case within the uncertain band but never authorizes a tool call.

### 6.4 Hardened LLM judge

The judge is an LLM and can be attacked, so it is treated as one weak signal:

- A fixed, versioned instruction tells it the inspected text is data and never instructions. The text is passed in a separate delimited field.
- Output must match a strict JSON schema. A malformed, empty or off-schema reply counts as uncertain, never as safe.
- It has no tools, never sees secrets, and runs under a hard timeout.
- Each project has a judge call budget per minute so attackers cannot force excessive calls.
- The judge itself is benchmarked on adversarial inputs, including inputs written to attack the judge.

## 7. Reliability, streaming and compatibility

PromptWall states exactly which API features it supports, rejects the rest loudly, and never lets a failure turn into a silent security bypass.

### 7.1 Compatibility contract

The product is called an OpenAI Chat Completions compatible proxy (MVP subset). Changing base\_url is enough only for the features below.

| Feature | Support | Priority |
| --- | --- | --- |
| POST /v1/chat/completions, non-streaming | Supported | Must |
| Tool-call response parsing | Supported | Must |
| Streaming | Supported with buffered inspection | Should, after non-streaming works |
| JSON response format | Passed through, output inspected | Should |
| Usage metadata | Passed through | Should |
| Provider-specific extensions | Not supported | Later |
| Image and audio inputs | Not supported | Later |

An unsupported feature returns HTTP 400 with the code unsupported\_feature. It is never skipped silently, because skipping would mean uninspected content. An automated compatibility suite using the official OpenAI SDK runs in CI.

### 7.2 Streaming

Blocking a stream midway does not undo what the user has already seen, so sensitive-output checks use buffering.

- **Buffered mode (default):** the gateway holds the provider stream until a window (a configurable number of tokens or a sentence boundary) has been inspected, then releases safe chunks. This adds latency and gives the strongest protection.
- **Tool-call deltas:** buffered until the call is complete, then passed to the interceptor. Partial tool calls are never forwarded.
- **Incremental mode (after the MVP):** a rolling window that can stop the stream. It cannot recall text already released, so it is not used for system-prompt leakage, secret or PII checks.
- If an inspection cannot complete, the project's fail mode decides.

### 7.3 Failure behavior

| Failure | Fail-open | Fail-closed |
| --- | --- | --- |
| Gateway cannot inspect a request | Forwarded, marked uninspected, alert raised | Refused with 503 |
| Classifier unavailable | Heuristics only, marked degraded | Refused |
| Judge unavailable or times out | Uncertain band decided by the classifier with a stricter bias, marked degraded | Uncertain band blocked |
| Provider unavailable | Circuit breaker opens, clear error returned | Same |

- Every request has an inspection\_status: inspected, degraded or uninspected. It appears in the X-PromptWall-Inspected response header, the database and the metrics.
- A fail-open pass-through is never silent. The uninspected rate is a monitored metric with an alert threshold.
- Controls in the MVP: health checks, per-layer timeouts, provider connection pooling, circuit breakers and graceful error bodies. Distributed high availability is out of scope.

### 7.4 API surface

| Endpoint | Purpose |
| --- | --- |
| POST /v1/chat/completions | Proxy, adds X-PromptWall-\* headers and signed tool authorizations |
| POST /v1/scan | Scan text with a channel label and return the verdict |
| POST /v1/tools/consume | Executor consumes a single-use authorization nonce |
| GET /admin/events | Filterable events |
| GET /admin/sessions/{id} | Session timeline |
| PUT /admin/projects/{id}/policy | Update policy (new version) |
| GET /admin/approvals | Pending tool-call approvals |
| POST /admin/approvals/{id}/decision | Approve or deny, bound to exact arguments |
| POST /eval/runs and GET /eval/runs/{id} | Start and read evaluation runs |
| GET /healthz and GET /metrics | Health and Prometheus metrics |

The admin and eval endpoints use a separate authentication scope from project keys.

## 8. Gateway security and audit durability

A security product is an attack target itself, so the gateway has its own threat table and records every security decision durably before acting on it.

### 8.1 Threats to the gateway

| Threat | Problem | Mitigation |
| --- | --- | --- |
| API key theft | Stolen project credentials | Keys hashed at rest, shown once, rotation, revocation, last-used tracking |
| Replay of tool authorizations | An approved action runs again | Single-use nonces, short expiry, binding to request and argument hash |
| Approval manipulation | Arguments changed after approval | Approval binds an immutable argument hash; the executor recomputes it |
| Signing key compromise | Forged authorizations | Per-project signing keys with key IDs, rotation, short expiry |
| Request flooding | Detection pipeline overloaded | Per-project rate limits, request size and token caps |
| Judge abuse | Attackers force many LLM calls | Per-minute judge budget, bounded uncertain band |
| SSRF | URL analysis reaches internal services | URLs are inspected, never fetched; if fetching is added, block private ranges, link-local and cloud metadata addresses |
| Log injection | Malicious content corrupts logs | Structured JSON logs; content never placed in log message strings |
| Policy tampering | Unauthorized rule changes | Separate admin scope, role checks, versioned policies with author recorded |
| Cross-project leakage | One project sees another's events | project\_id on every tenant row, enforced in the repository layer and tested |
| Upstream credential exposure | Provider keys leaked | Secrets from environment or a secret manager, never logged, per-project provider keys |

### 8.2 Durable audit trail

An asynchronous log can lose a security decision if the process crashes after the decision but before the write. The MVP therefore splits records by importance:

- **Transactional:** the request record, per-message provenance, detections and the decision are committed in one database transaction before the request is forwarded or refused.
- **Asynchronous:** metrics, aggregates and dashboard analytics. These can be rebuilt from the transactional records.
- **Idempotency:** every event has a gateway-generated ID so retries do not duplicate rows.
- **Commit failure:** the project's fail mode applies, and an emergency structured log line is written. A transactional outbox with a message queue is the production upgrade.

**What is stored by default:** content hash, redacted evidence, category, decision, timestamp, policy version and detector versions. Raw prompt storage is off by default, configurable per project, and subject to a retention limit.

## 9. Evaluation methodology

Every published number comes from a held-out test set the model never saw, comes with its sample counts and a confidence interval, and is paired with results against attacks written after training.

### 9.1 Data splits

| Split | Purpose | Rules |
| --- | --- | --- |
| Training | Fit the classifier | Deduplicated against validation and test |
| Validation | Tune scoring weights, thresholds and model choice | Never used for the final report |
| Test | Final independent evaluation | Used once per release; split by source and template family so variants of one attack never straddle splits |

Each dataset is recorded with its source, license, label, category, channel and split. Datasets without a clear license are excluded from anything redistributed.

### 9.2 Test suites

| Suite | What it tests |
| --- | --- |
| Benign hard negatives | Harmless text containing ignore, override, system, instruction, secret, password |
| Obfuscation | Zero-width insertion, homoglyphs, Unicode tags, base64, hex, leetspeak, paraphrase |
| Adaptive attacks | Variants generated by mutating attacks against the live pipeline after the training freeze; reports attack success rate over rounds |
| Indirect injection | Malicious instructions embedded in documents, emails, retrieved knowledge and tool outputs |
| Judge adversarial | Inputs written to manipulate the LLM judge |
| Agent scenarios | Tool-call manipulation, unauthorized execution, approval bypass, argument modification, replayed approvals |

A known gap is documented: attacks that only change the content of an answer, such as inserting an advertisement, are mostly outside current detectors.

### 9.3 Reporting

- **Detection:** recall at 1% false positives, hard-negative false-positive rate, per-category recall, precision and a confusion matrix.
- **Operations:** p50 and p95 latency, share of requests sent to the judge, uninspected and degraded rates.
- **End to end:** the same attack scenarios replayed against an unprotected app and a protected app. Report successful attacks and dangerous tool executions for both. Results are shown as measured, never estimated.
- **Counts with intervals:** always report the number of samples, the number of errors and a 95% Wilson interval. Accuracy alone is never reported.

Illustrative arithmetic, not a result: 35 false positives in 5,000 benign samples is a 0.70% false-positive rate, with a 95% interval of about 0.50% to 0.97%.

## 10. Data model

The schema is defined once in SQLAlchemy models and Alembic migrations, and the ER diagram is generated from them, so the diagram and this section cannot drift apart. The model now has 17 entities: v0.1's 14 plus request\_messages, tool\_authorizations and admin\_users.

### 10.1 Entities, key fields and constraints

| Entity | Key fields | Constraints |
| --- | --- | --- |
| projects | id, name, mode, fail\_mode, pinned\_system\_prompt\_hash, store\_raw\_text, retention\_days, archived\_at | mode in (strict, balanced, lenient); fail\_mode in (open, closed) |
| api\_keys | id, project\_id, key\_hash, label, last\_used\_at, revoked\_at | key\_hash unique; project\_id foreign key |
| admin\_users | id, email, role, created\_at | email unique; role in (viewer, admin) |
| policies | id, project\_id, version, policy\_yaml, active, created\_by, created\_at | unique (project\_id, version); at most one active policy per project |
| sessions | id, project\_id, external\_user\_id, risk\_score, status, started\_at | status in (normal, watched, quarantined) |
| requests | id, project\_id, session\_id, decision, inspection\_status, final\_score, policy\_version, detector\_versions, latency\_ms, content\_hash, redacted\_text, created\_at | decision in (allow, sanitize, block); inspection\_status in (inspected, degraded, uninspected) |
| request\_messages | id, request\_id, project\_id, position, role, channel, trust\_level, label\_source, source\_id, content\_hash, normalization\_flags | unique (request\_id, position); channel in (system, user, retrieved\_document, tool\_output) |
| detections | id, request\_id, message\_id, layer, category, score, evidence\_span, detector\_version | layer in (heuristic, classifier, judge); category references taxonomy\_map |
| tool\_calls | id, request\_id, project\_id, tool\_name, args\_hash, gate\_decision, reason, untrusted\_context | gate\_decision in (allow, deny, require\_approval) |
| tool\_authorizations | id, tool\_call\_id, nonce, args\_hash, source, issued\_at, expires\_at, consumed\_at | nonce unique; consumed\_at set once |
| approvals | id, tool\_call\_id, status, decided\_by, decided\_at, expires\_at | tool\_call\_id unique; status in (pending, approved, denied, expired) |
| alerts | id, project\_id, session\_id, request\_id, type, severity, created\_at, delivered\_at | severity in (low, medium, high) |
| taxonomy\_map | category, atlas\_id, owasp\_id, nist\_function | category primary key |
| eval\_datasets | id, name, source, license, size | name unique |
| eval\_cases | id, dataset\_id, text\_hash, text, label, category, channel, split, family\_id | unique (dataset\_id, text\_hash); split in (train, val, test) |
| eval\_runs | id, config\_snapshot, model\_version, recall\_at\_1fpr, recall\_ci\_low, recall\_ci\_high, hard\_neg\_fpr, p50\_ms, p95\_ms, created\_at | none beyond primary key |
| eval\_results | id, run\_id, case\_id, predicted, score, layer\_decided | unique (run\_id, case\_id) |

### 10.2 Relationships and deletion

A project has many api\_keys, policies, sessions and requests. A session has many requests and alerts. A request has many request\_messages, detections and tool\_calls. A tool\_call has many tool\_authorizations and at most one approval. Detections reference taxonomy\_map by category. An eval\_dataset has many eval\_cases, and an eval\_run has many eval\_results, each pointing to one eval\_case, so a case belongs to exactly one dataset.

- Children of a request (messages, detections, tool\_calls) are deleted with it. Projects are archived, not deleted, while they hold requests.
- project\_id is repeated on request\_messages, tool\_calls and alerts so tenant isolation can be enforced and tested in one place.

### 10.3 Indexes

```sql
CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_requests_session ON requests(session_id);
CREATE INDEX idx_requests_project_created ON requests(project_id, created_at);
CREATE INDEX idx_messages_request ON request_messages(request_id);
CREATE INDEX idx_detections_request ON detections(request_id);
CREATE INDEX idx_tool_calls_decision ON tool_calls(gate_decision);
CREATE UNIQUE INDEX uq_active_policy ON policies(project_id) WHERE active;
CREATE INDEX idx_auth_unconsumed ON tool_authorizations(expires_at) WHERE consumed_at IS NULL;
```

The last index supports the bypass signal: authorizations that were issued but never consumed.

## 11. Folder structure, plan and decisions

The four-week plan builds the working gateway first, then detection intelligence, then enforcement, then the dashboard and demo, with enforcement and provenance designed before any detector is written.

### 11.1 Folder structure

```
promptwall/
├── README.md, pyproject.toml, docker-compose.yml, Dockerfile, .env.example
├── configs/
│   ├── default_policy.yaml
│   ├── tool_policy.example.yaml
│   └── taxonomy/atlas_owasp_nist_map.yaml
├── src/promptwall/
│   ├── main.py
│   ├── api/            routes_proxy, routes_scan, routes_tools, routes_admin, routes_eval, auth, schemas
│   ├── core/           config, pipeline, scoring, decision, channels
│   ├── detection/      base, normalize (offset map), heuristics, classifier, judge, sanitizer, taxonomy
│   ├── enforcement/    provenance, tool_interceptor, tool_policy, authorizations, approvals
│   ├── output/         canary, secrets_pii, url_check
│   ├── providers/      base, openai_compat
│   ├── storage/        db, models (source of truth), repositories, migrations/
│   └── telemetry/      logging, metrics
├── sdk/python/promptwall_sdk/   executor (SecureToolExecutor), provenance helpers
├── dashboard/          React + Vite
├── eval/               datasets/ (loaders, LICENSES.md), suites/, harness, metrics, adaptive_attacks, reports/
├── training/           prepare_data, train_classifier, calibrate_scoring, export_onnx
├── demo/               vulnerable_rag_app/, agent_with_tools/, attack_scripts/
├── tests/              unit/, integration/, evasion/, compatibility/, security/
└── docs/               architecture, policy-reference, limitations
```

P2 modules (session risk, playbooks, red-team agent, JavaScript SDK, Anthropic adapter) are not created until the MVP demo works.

### 11.2 Four-week plan

| Week | Objective | Deliverables |
| --- | --- | --- |
| 1 | Working gateway | Repository, Docker, PostgreSQL, SQLAlchemy and Alembic; project and key management; non-streaming proxy; reversible normalization with offsets; heuristic detectors; decision engine; transactional logging; end-to-end tests |
| 2 | Measurable detection | Dataset loaders with deduplicated splits; hard-negative set; classifier training, binary vs multi-class; ONNX export; scoring calibration; hardened judge; first benchmark run with confidence intervals |
| 3 | Enforcement | Provenance rules and SDK helpers; RAG demo with indirect injection; tool interceptor and policy engine; signed authorizations; SecureToolExecutor; human approval; security tests for bypass, replay and argument change |
| 4 | Dashboard and demo | React dashboard (overview, events, approvals, policies, evaluation); end-to-end scenario run; README, API docs, limitations page, attack scripts, evaluation report |

### 11.3 Demo scenario

1. Normal request passes.
2. Direct injection, Unicode-obfuscated injection, jailbreak and prompt-leakage attempts are blocked or sanitized.
3. A RAG document carrying hidden instructions is sanitized and the user's request still completes.
4. An agent with three tools: search\_documents allowed, send\_email requires approval, delete\_record denied. A malicious document cannot authorize a dangerous action.
5. The same attacks are replayed against an unprotected app, and results are compared as measured.

### 11.4 Decisions to confirm

These are proposed defaults, not final. Reply with changes.

| Decision | Proposed default | Reason |
| --- | --- | --- |
| Compute | CPU-first, small ONNX classifier | Easy to deploy and reproduce |
| Judge | Pluggable, hosted or local | Fits available compute; advisory only |
| Prompt storage | Hashes and redacted spans by default | Privacy |
| Dashboard | React, built in week 4 | Strong demonstration |
| Streaming | Buffered, after non-streaming works | Avoid early complexity |
| Database | PostgreSQL | Realistic concurrency and constraints |
| Provenance | SDK helpers, downgrade-only labels from the authenticated app (section 4.1) | Prevents label forgery |
| Enforcement boundary | Signed single-use authorizations verified by the SecureToolExecutor (section 4.2) | Real enforcement, with the bypass limit documented |
| Name and license | Keep PromptWall; Apache 2.0 or MIT | Needs your choice |
| Team size and time | Plan assumes four weeks | Needs your confirmation; scope shrinks if the team is one person |

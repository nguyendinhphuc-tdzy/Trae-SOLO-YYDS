# AI-Driven Client Support Automation
## WhatsApp -> AI Decisioning -> Jira Execution (Showcase/Handover Version)

### 1) Executive Summary
This project is an AI-driven operations pipeline that converts unstructured client conversations into structured execution across internal systems. The current production-ready implementation is optimized for WhatsApp and Jira, with architecture patterns that can be extended to Gmail, Discord, X, Instagram, and LinkedIn.

Core outcomes:
- Detect and ingest new client requests from chat channels.
- Classify whether each request is actionable.
- Generate concise insights plus concrete next actions.
- Route work to the correct owner (PIC) with issue-level traceability.
- Synchronize operations with Jira, Calendar, and team notifications.

For interview/showcase context (20in20 Partners), this system demonstrates practical strengths in:
- workflow automation under noisy communication environments,
- reliable state management (idempotency),
- AI-assisted decisioning integrated into business operations.

---

### 2) Validated Scope and Current State
The workflow in `Beeper - n8n.json` is active architecture design but currently set as `active: false` in exported state. Runtime schedule is configured for every 30 minutes (`Schedule Trigger`).

Current production channel:
- WhatsApp (via middleware API + Assistro node for team notifications)

Target channels (design goal):
- WhatsApp, Gmail, Discord, X, Instagram, LinkedIn

Current LLM runtime:
- Google Gemini (`models/gemini-3-flash-preview`) connected to `Basic LLM Chain`

Primary system-of-record:
- Jira (master ticket + subtask/comment execution model)

---

### 3) End-to-End Data Flow (As Implemented)
1. **Ingestion**
   - `Schedule Trigger` runs every 30 minutes.
   - `Search Messages` pulls recent messages from middleware API.

2. **Client qualification and noise filtering**
   - `Gather Messages` excludes:
     - self-sent messages (`isSender === true`),
     - already-read messages (`isUnread === false`),
     - internal groups (e.g., containing `The REAL Danta`, `Danta Internal`).
   - Allows only VIP clients recognized by `(B)` in sender/group naming.

3. **Deduplication (idempotency gate)**
   - `Get row(s) in sheet` fetches previously processed `message_id`.
   - `Check if the Message is Processed or not1` keeps only unseen messages.

4. **Conversation normalization**
   - `HTTP Request1` fetches detailed message history by `chatID`.
   - `Format Chat`:
     - composes transcript (`Support Team` vs `Customer`),
     - generates `jiraLabel` using sanitized customer identifier,
     - prepares context for Jira retrieval.

5. **Context retrieval + AI reasoning**
   - `Get Open Task` queries Jira by label (`jiraLabel`) to load related open work.
   - `Prepare Context` summarizes issue context for LLM prompt.
   - `Basic LLM Chain` decides among `CREATE_SUBTASK`, `COMMENT`, `IGNORE`.
   - `AI Json Parse` enforces resilient JSON parsing + fallback extraction.

6. **Routing and execution**
   - `Check if Actionable` gates only actionable outcomes.
   - `Route: Parent vs Subtask.` checks if a master ticket exists.
   - Branching:
     - no master -> `Create an issue (Master Ticket)`,
     - existing master + task intent -> `Create Subtask`,
     - existing master + update intent -> `Add a comment`.

7. **Cross-platform sync + close loop**
   - Optional meeting scheduling via `Create an event` (Google Calendar) when `meeting_time` is valid.
   - Team alert via `Notify Team` (WhatsApp group).
   - `Merge` joins branches.
   - `Save Conversation ID - Prevent dupliacating tickets` appends processed message ID into Google Sheets.

---

### 4) Decisioning Logic and Assignment Rules
The prompt-driven LLM policy encodes business routing:
- **New topic not found in existing Jira context** -> `CREATE_SUBTASK`
- **Same topic follow-up** -> `COMMENT`
- **Non-actionable** -> `IGNORE`

Assignee mapping is deterministic in prompt:
- Dani: technical/dev/bug/migration scope
- Sam: meetings/scheduling/strategy/pricing/general scope
- Jay: internal operations tools

This ensures the LLM decides within constrained assignment IDs and avoids free-text owner drift.

---

### 5) What Is Strong in the Current Workflow
- **Good idempotency baseline:** message-level dedup gate before expensive AI and Jira operations.
- **RAG-style context injection:** Jira context is retrieved before AI decisioning.
- **Parent-child ticket strategy:** avoids issue fragmentation by preserving a per-client master container.
- **Operational resilience:** `AI Json Parse` has try/catch + regex fallback to survive malformed model outputs.
- **Human readability:** generated Jira descriptions/comments include insight and action hints.

---

### 6) Accuracy and Risk Review (Important)
The workflow is solid but still has several correctness and reliability risks to address before large-scale rollout:

1. **Secrets in exported JSON**
   - API bearer tokens and integration IDs are present in workflow export.
   - Action: rotate credentials immediately and move all secrets to environment-backed n8n credentials only.

2. **Google Sheets dedup key mismatch risk**
   - Dedup node compares against `msg.id`, while save node references fields from `Filter: Only Subtask.` and may not capture comment/master-only paths consistently.
   - Risk: missed writes or partial dedup coverage under non-subtask branches.
   - Action: standardize one immutable `event_id` persisted for all branches.

3. **Prompt-only anti-hallucination is not enough**
   - Assignee IDs are constrained in prompt but still model-generated.
   - Action: add post-LLM schema validation and allow-list checks for `decision`, `assignee_id`, `priority`, `meeting_time`.

4. **Channel coupling**
   - Current ingestion and notification are tightly tied to WhatsApp middleware/Assistro.
   - Action: introduce a normalized `incoming_event` schema and per-channel adapters.

5. **Polling interval trade-off**
   - 30-minute batch polling is simple but may be slow for urgent requests.
   - Action: add webhook/event-driven option for near-real-time handling.

---

### 7) Scalability Blueprint (Multi-Channel + Team Growth)
To scale from one channel to many while keeping logic stable:

1. **Adapter Layer**
   - Add channel-specific adapters (WhatsApp, Gmail, Discord, X, Instagram, LinkedIn) mapping into one canonical payload:
   - `event_id`, `channel`, `client_id`, `thread_id`, `message_text`, `timestamp`, `metadata`.

2. **Policy Layer (LLM-agnostic)**
   - Keep routing policy in a model-independent JSON schema contract.
   - Run strict parser/validator after model output.

3. **Execution Layer**
   - Keep Jira/Calendar/Notifier operations independent from channel source.
   - Use retry + DLQ (dead-letter queue) for failed executions.

4. **State Layer**
   - Replace Sheets with a transactional store (PostgreSQL/Firestore/Supabase) for:
     - dedup index,
     - model I/O logs,
     - audit trail,
     - replay support.

---

### 8) Model Replacement Strategy (Gemini <-> Claude)
You can switch from Gemini to Claude without changing business routing if you isolate model invocation behind a contract:

- Required output contract:
  - `decision`, `reason`, `summary`, `description`, `assignee_id`, `meeting_time`, `suggested_solution`.
- Add:
  - JSON schema validation,
  - fallback model policy (e.g., Gemini primary, Claude fallback or vice versa),
  - confidence tags and abstain handling (`decision = IGNORE` with reason).

Migration approach:
1. Keep prompt semantics, rewrite model-specific wrapper node.
2. Run shadow mode (Gemini and Claude in parallel) on sampled traffic.
3. Compare disagreement rate and ticket quality before cutover.

---

### 9) Replacing Google Sheets with NotebookLM (Reality Check)
NotebookLM is useful for knowledge synthesis, but not a transactional dedup database.

Recommended architecture:
- **Do not use NotebookLM as dedup source-of-truth.**
- Use a database for immutable event log + dedup index.
- Optionally use NotebookLM for:
  - summarizing historical client narratives,
  - generating richer context notes for human review.

If goal is "store conversation and avoid duplication":
- Store raw messages + hash keys in DB.
- Use NotebookLM only as a downstream analysis/summarization companion.

---

### 10) Duplication & Hallucination Prevention (Target Design)
Current mechanisms:
- Duplication: message ID lookup in Google Sheets.
- Hallucination control: constrained prompt and parsing fallback.

Recommended hardened controls:
1. **Dedup hardening**
   - canonical id: `source + channel + message_id + timestamp_hash`,
   - atomic upsert with unique constraint.

2. **LLM output hardening**
   - strict schema validator (reject invalid enum/IDs),
   - assignee allow-list,
   - date parser for `meeting_time`,
   - guardrail fallback route (`human_review_queue`) for invalid output.

3. **Context integrity**
   - cap transcript window + preserve chronological order,
   - add quoted evidence spans for each AI decision.

4. **Observability**
   - trace ID per execution,
   - decision logs, invalid-output rate, duplicate-drop rate.

---

### 11) Cost Estimate per Execution (Planning Assumptions)
Assumptions:
- One execution processes one new actionable client message.
- Gemini Flash token usage stays in low-to-medium range.
- Jira + Sheets + Calendar API calls are within free/standard operational quota.

Estimated variable cost (rough order of magnitude):
- **LLM inference:** ~USD 0.0005 to 0.01 / execution (depends on prompt+context size).
- **Infrastructure/API overhead:** near-zero to low marginal cost if within quota.
- **Operational blended estimate:** ~USD 0.001 to 0.02 / execution for current architecture.

At 10,000 executions/month:
- expected range ~USD 10 to 200/month (highly sensitive to token length and model tier).

Recommendation:
- Track exact token usage in logs for 2 weeks and build a real cost baseline before scaling commitments.

---

### 13) Handover-Ready Upgrade Roadmap
**Phase A (1-2 weeks): Reliability hardening**
- Secret cleanup, schema validation, unified event ID, full-branch dedup write fix.

**Phase B (2-4 weeks): Scalability**
- Adapter pattern for multi-channel ingestion, DB migration from Sheets, observability dashboard.

**Phase C (2-3 weeks): Model and governance**
- A/B model evaluation (Gemini vs Claude), human-review fallback lane, KPI calibration.

**Phase D (showcase + transfer)**
- Clean GitHub repo, architecture visuals, runbook, troubleshooting guide, KPI summary.

---


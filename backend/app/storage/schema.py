APP_SCHEMA_SQL = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS chat_conversations (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    engine_model TEXT NOT NULL,
    context_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_trace TEXT,
    sources TEXT,
    draft_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id)
);

CREATE TABLE IF NOT EXISTS ticket_drafts (
    draft_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    confirm_nonce TEXT NOT NULL,
    diagnosis_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_submissions (
    local_id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    ticket_id TEXT,
    submit_status TEXT NOT NULL,
    payload_snapshot TEXT NOT NULL,
    error_detail TEXT,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_created_once
ON ticket_submissions(vehicle_id, session_id)
WHERE submit_status = 'created' AND ticket_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_pair_inflight
ON ticket_submissions(vehicle_id, session_id)
WHERE submit_status IN ('sending', 'created', 'unknown');

-- New provider-neutral usage tables. Legacy Groq tables below are retained for
-- backwards compatibility and are migrated into these tables on startup.
CREATE TABLE IF NOT EXISTS llm_usage_steps (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE VIEW IF NOT EXISTS llm_usage_by_check AS
SELECT u.provider, c.vehicle_id, c.session_id, u.stage, COUNT(*) AS calls,
       SUM(u.prompt_tokens) AS prompt_tokens, SUM(u.completion_tokens) AS completion_tokens,
       SUM(u.total_tokens) AS total_tokens
FROM llm_usage_steps u JOIN chat_conversations c ON c.id = u.conversation_id
GROUP BY u.provider, c.vehicle_id, c.session_id, u.stage;

CREATE TABLE IF NOT EXISTS llm_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    stage TEXT NOT NULL,
    conversation_id TEXT,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

-- Historical Groq tables are not written by the current application.
CREATE TABLE IF NOT EXISTS groq_usage_steps (
    id INTEGER PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE VIEW IF NOT EXISTS groq_usage_by_check AS
SELECT c.vehicle_id, c.session_id, u.stage, COUNT(*) AS calls,
       SUM(u.prompt_tokens) AS prompt_tokens, SUM(u.completion_tokens) AS completion_tokens,
       SUM(u.total_tokens) AS total_tokens
FROM groq_usage_steps u JOIN chat_conversations c ON c.id = u.conversation_id
GROUP BY c.vehicle_id, c.session_id, u.stage;

CREATE TABLE IF NOT EXISTS groq_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chief_quarantine_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    active INTEGER NOT NULL,
    reason TEXT NOT NULL,
    chief_username TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chief_quarantine_vehicle
ON chief_quarantine_events(vehicle_id, session_id, id);
"""

-- Migration 003: Embedding hygiene tracking
CREATE TABLE IF NOT EXISTS embedding_hygiene_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_at TIMESTAMPTZ DEFAULT NOW(),
    total_users_processed INTEGER DEFAULT 0,
    total_embeddings_deleted INTEGER DEFAULT 0,
    details JSONB DEFAULT '{}'
);

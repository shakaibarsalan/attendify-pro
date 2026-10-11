import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional
import json
import logging

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self):
        pass

    def ensure_schema(self, engine):
        """Self-healing: add the subject_ref column used by the public Biometric API.
        The biometric DB only runs initdb migrations on first boot, so apply this
        idempotently on already-initialised databases (mirrors fingerprint.ensure_table)."""
        try:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE face_embeddings ADD COLUMN IF NOT EXISTS subject_ref TEXT"))
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_face_subject ON face_embeddings(institution_id, subject_ref) "
                    "WHERE subject_ref IS NOT NULL"
                ))
                # Fast monthly usage counts for the Biometric API quota (server reads
                # verification_logs via the biometric pool).
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_verif_inst_created "
                    "ON verification_logs(institution_id, created_at)"
                ))
        except Exception as e:
            logger.warning(f"Could not ensure biometric schema (subject_ref / verif index): {e}")

    def store_face_embedding(
        self, db: Session, user_id: str, institution_id: Optional[str],
        embedding: np.ndarray, quality_score: float, is_primary: bool = True,
        subject_ref: Optional[str] = None
    ) -> dict:
        embedding_str = "[" + ",".join(str(float(x)) for x in embedding.tolist()) + "]"
        if is_primary:
            db.execute(
                text("UPDATE face_embeddings SET is_primary = false WHERE user_id = :user_id"),
                {"user_id": user_id}
            )
            db.commit()

        result = db.execute(
            text("""INSERT INTO face_embeddings (user_id, institution_id, embedding, quality_score, is_primary, subject_ref)
                    VALUES (:user_id, :institution_id, CAST(:embedding AS vector), :quality, :is_primary, :subject_ref)
                    RETURNING id, user_id, quality_score, is_primary"""),
            {
                "user_id": user_id,
                "institution_id": institution_id,
                "embedding": embedding_str,
                "quality": quality_score,
                "is_primary": is_primary,
                "subject_ref": subject_ref,
            }
        )
        db.commit()
        row = result.fetchone()
        return {"id": str(row[0]), "user_id": str(row[1]), "quality_score": row[2], "is_primary": row[3]}

    # ── Public Biometric API: external subjects keyed by (institution_id, subject_ref) ──

    def get_subject_embeddings(self, db: Session, institution_id: str, subject_ref: str) -> list:
        """All stored embeddings for one external subject (for 1:1 verify)."""
        result = db.execute(
            text("SELECT embedding::text FROM face_embeddings "
                 "WHERE institution_id = CAST(:inst AS uuid) AND subject_ref = :sref"),
            {"inst": institution_id, "sref": subject_ref},
        )
        out = []
        for row in result.fetchall():
            if row[0]:
                v = np.array(json.loads(row[0]), dtype=np.float32)
                n = np.linalg.norm(v)
                out.append(v / n if n > 0 else v)
        return out

    def find_matching_subjects(
        self, db: Session, query_embedding: np.ndarray, institution_id: str,
        threshold: float = 0.5, max_results: int = 5
    ) -> list:
        """1:N identify across an institution's external subjects only
        (subject_ref IS NOT NULL) — kept separate from attendance students."""
        q = "[" + ",".join(str(float(x)) for x in query_embedding.tolist()) + "]"
        result = db.execute(
            text("""
                SELECT id, subject_ref, embedding::text, quality_score
                FROM face_embeddings
                WHERE is_primary = true AND subject_ref IS NOT NULL
                  AND institution_id = CAST(:inst AS uuid)
                ORDER BY embedding <=> CAST(:q AS vector)
                LIMIT :max_results
            """),
            {"inst": institution_id, "q": q, "max_results": max_results},
        )
        matches = []
        for row in result.fetchall():
            if row[2] is None:
                continue
            stored = np.array(json.loads(row[2]), dtype=np.float32)
            n = np.linalg.norm(stored)
            if n > 0:
                stored = stored / n
            sim = float(np.dot(query_embedding, stored))
            if sim >= threshold:
                matches.append({"id": str(row[0]), "subject_ref": row[1], "similarity": sim, "quality_score": row[3]})
        return sorted(matches, key=lambda x: x["similarity"], reverse=True)

    def count_subject(self, db: Session, institution_id: str, subject_ref: str) -> int:
        r = db.execute(
            text("SELECT COUNT(*) FROM face_embeddings "
                 "WHERE institution_id = CAST(:inst AS uuid) AND subject_ref = :sref"),
            {"inst": institution_id, "sref": subject_ref},
        )
        return int(r.fetchone()[0])

    def delete_subject(self, db: Session, institution_id: str, subject_ref: str) -> int:
        r = db.execute(
            text("DELETE FROM face_embeddings "
                 "WHERE institution_id = CAST(:inst AS uuid) AND subject_ref = :sref"),
            {"inst": institution_id, "sref": subject_ref},
        )
        db.commit()
        return r.rowcount or 0

    def get_face_embeddings(self, db: Session, user_id: str, is_primary: bool = True) -> list:
        result = db.execute(
            text("SELECT id, user_id, institution_id, embedding::text, quality_score FROM face_embeddings WHERE user_id = :user_id AND is_primary = :is_primary"),
            {"user_id": user_id, "is_primary": is_primary}
        )
        rows = result.fetchall()
        return [
            {
                "id": str(row[0]),
                "user_id": str(row[1]),
                "institution_id": str(row[2]) if row[2] else None,
                "embedding": np.array(json.loads(row[3]), dtype=np.float32) if row[3] else None,
                "quality_score": row[4],
                "is_primary": is_primary,
            }
            for row in rows
        ]

    def find_matching_faces(
        self, db: Session, query_embedding: np.ndarray, institution_id: Optional[str] = None,
        threshold: float = 0.5, max_results: int = 5
    ) -> list:
        query_embedding_str = "[" + ",".join(str(float(x)) for x in query_embedding.tolist()) + "]"
        query_sql = text("""
            SELECT id, user_id, institution_id, embedding, quality_score
            FROM face_embeddings
            WHERE is_primary = true
              AND (:institution_id IS NULL OR institution_id = CAST(:institution_id AS uuid))
            ORDER BY embedding <=> CAST(:query_embedding AS vector)
            LIMIT :max_results
        """)
        result = db.execute(
            query_sql,
            {
                "institution_id": institution_id,
                "query_embedding": query_embedding_str,
                "max_results": max_results,
            }
        )
        rows = result.fetchall()
        matches = []
        for row in rows:
            emb_str = row[3]
            if emb_str is not None:
                parsed = json.loads(emb_str) if isinstance(emb_str, str) else emb_str
                stored_embedding = np.array(parsed, dtype=np.float32)
                norm = np.linalg.norm(stored_embedding)
                if norm > 0:
                    stored_embedding = stored_embedding / norm
                similarity = float(np.dot(query_embedding, stored_embedding))
                if similarity >= threshold:
                    matches.append({
                        "id": str(row[0]),
                        "user_id": str(row[1]),
                        "institution_id": str(row[2]) if row[2] else None,
                        "similarity": similarity,
                        "quality_score": row[4],
                    })
        return sorted(matches, key=lambda x: x["similarity"], reverse=True)

    def log_verification(
        self, db: Session, user_id: Optional[str], institution_id: Optional[str],
        verification_type: str, session_id: Optional[str], result: str,
        confidence_score: float, liveness_score: float, processing_time_ms: int,
        best_match_user_id: Optional[str] = None, best_match_score: Optional[float] = None,
        ip_address: Optional[str] = None, device_info: Optional[str] = None,
        metadata: Optional[dict] = None,
    ):
        import re
        safe_session_id = session_id if session_id and re.match(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', session_id
        ) else None
        try:
            db.execute(
                text("""INSERT INTO verification_logs
                        (user_id, institution_id, verification_type, session_id, result,
                         confidence_score, liveness_score, processing_time_ms,
                         best_match_user_id, best_match_score, ip_address, device_info, metadata)
                        VALUES (:user_id, :institution_id, :verification_type, :session_id, :result,
                                :confidence_score, :liveness_score, :processing_time_ms,
                                :best_match_user_id, :best_match_score, :ip_address, :device_info, :metadata)"""),
                {
                    "user_id": user_id, "institution_id": institution_id,
                    "verification_type": verification_type, "session_id": safe_session_id,
                    "result": result, "confidence_score": confidence_score,
                    "liveness_score": liveness_score, "processing_time_ms": processing_time_ms,
                    "best_match_user_id": best_match_user_id, "best_match_score": best_match_score,
                    "ip_address": ip_address, "device_info": device_info,
                    "metadata": json.dumps(metadata) if metadata else None,
                }
            )
            db.commit()
        except Exception:
            db.rollback()


embedding_service = EmbeddingService()

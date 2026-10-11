from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.core.config import get_settings

settings = get_settings()

BIOMETRIC_DB_URL = (
    f"postgresql://{settings.biometric_db_user}:{settings.biometric_db_password}"
    f"@{settings.biometric_db_host}:{settings.biometric_db_port}/{settings.biometric_db_name}"
)

engine = create_engine(BIOMETRIC_DB_URL, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

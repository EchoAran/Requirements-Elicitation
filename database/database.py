import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine import Engine
import sqlite3
from .models import Base

# Database configuration
current_dir = os.path.dirname(os.path.abspath(__file__))
database_path = os.path.join(current_dir, 'database.db')
DATABASE_URL = f'sqlite:///{database_path}'

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Initialize the database by creating all tables."""
    Base.metadata.create_all(bind=engine)
    # Lightweight schema migration: ensure newly added columns exist
    try:
        with engine.connect() as conn:
            rows = conn.exec_driver_sql("PRAGMA table_info(slots)").fetchall()
            names = [r[1] for r in rows] if rows else []
            if "evidence_message_ids" not in names:
                conn.exec_driver_sql("ALTER TABLE slots ADD COLUMN evidence_message_ids TEXT")

            rows = conn.exec_driver_sql("PRAGMA table_info(projects)").fetchall()
            names = [r[1] for r in rows] if rows else []
            if "domain_ids" not in names:
                conn.exec_driver_sql("ALTER TABLE projects ADD COLUMN domain_ids TEXT")
            rows = conn.exec_driver_sql("PRAGMA table_info(projects)").fetchall()
            names = [r[1] for r in rows] if rows else []
            if "priority_sequence" not in names:
                conn.exec_driver_sql("ALTER TABLE projects ADD COLUMN priority_sequence TEXT")

            rows = conn.exec_driver_sql("PRAGMA table_info(topics)").fetchall()
            names = [r[1] for r in rows] if rows else []
            if "is_necessary" not in names:
                conn.exec_driver_sql("ALTER TABLE topics ADD COLUMN is_necessary BOOLEAN DEFAULT 1")
                # Ensure existing rows have True (1)
                conn.exec_driver_sql("UPDATE topics SET is_necessary=1 WHERE is_necessary IS NULL")
    except Exception:
        # Silently ignore to avoid startup failure; errors will surface in query if unresolved
        pass

def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

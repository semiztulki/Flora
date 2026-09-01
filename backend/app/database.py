import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def _default_sql(column: sqlalchemy.Column) -> str:
    """SQL for a simple constant column default, if there is one — SQLite's
    ADD COLUMN rejects non-constant defaults, so anything else (e.g. a
    callable like utcnow) is skipped and just leaves existing rows NULL."""
    default = column.default
    if default is None or not getattr(default, "is_scalar", False):
        return ""
    value = default.arg
    if isinstance(value, bool):
        return f" DEFAULT {1 if value else 0}"
    if isinstance(value, (int, float)):
        return f" DEFAULT {value}"
    if isinstance(value, str):
        return f" DEFAULT '{value}'"
    return ""


def _add_missing_columns(sync_conn) -> None:
    """There's no Alembic here — this is a small dev-project SQLite DB, not a
    production one — so instead of a real migration history, every startup
    diffs each model's columns against what the table actually has and
    ADD COLUMNs whatever's missing. Existing rows and data are untouched;
    this only ever adds columns, never renames or drops anything. Means a
    schema change (like adding visible_when_invisible) no longer requires
    deleting the whole dev DB and losing all test accounts/messages."""
    inspector = sqlalchemy.inspect(sync_conn)
    existing_tables = set(inspector.get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # brand new table — create_all() above already made it
        existing_columns = {col["name"] for col in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing_columns:
                continue
            ddl_type = column.type.compile(sync_conn.dialect)
            sync_conn.execute(
                sqlalchemy.text(
                    f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" '
                    f"{ddl_type}{_default_sql(column)}"
                )
            )


def _migrate_legacy_presence_values(sync_conn) -> None:
    """One-time data fixup for the PresenceStatus rename (online -> available,
    invisible folded into the new User.invisible boolean instead of being a
    status value). Only touches rows still carrying a pre-rename string —
    a no-op after the first run. Safe because `status` is a plain VARCHAR
    with no CHECK constraint (SQLAlchemy's Enum type doesn't add one for
    SQLite by default), so old values were never rejected, just stale."""
    inspector = sqlalchemy.inspect(sync_conn)
    if "users" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "invisible" not in columns:
        return  # ran before _add_missing_columns somehow — bail, next startup catches it
    sync_conn.execute(
        sqlalchemy.text(
            "UPDATE users SET invisible = 1, status = 'available' WHERE status = 'invisible'"
        )
    )
    sync_conn.execute(sqlalchemy.text("UPDATE users SET status = 'available' WHERE status = 'online'"))


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)
        await conn.run_sync(_migrate_legacy_presence_values)


async def get_db():
    async with async_session() as session:
        yield session

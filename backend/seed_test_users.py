"""One-off local script: creates a handful of test accounts for manual
testing (contacts, group chats, DMs between two "real" devices/sessions).
Safe to re-run — skips any username that already exists.

Usage (from backend/, with the venv active):
    python seed_test_users.py
"""

import asyncio

from sqlalchemy import select

from app.auth import hash_password
from app.config import settings
from app.database import async_session, init_db
from app.models import User

TEST_USERS = [
    ("test1", "Тестовый Один", "test1234"),
    ("test2", "Тестовый Два", "test1234"),
    ("test3", "Тестовый Три", "test1234"),
]


async def main() -> None:
    await init_db()
    async with async_session() as db:
        for username, display_name, password in TEST_USERS:
            existing = await db.execute(select(User).where(User.username == username))
            if existing.scalar_one_or_none() is not None:
                print(f"skip {username}: already exists")
                continue
            db.add(
                User(
                    username=username,
                    display_name=display_name,
                    hashed_password=hash_password(password),
                    is_admin=username in settings.admin_username_set,
                )
            )
            print(f"created {username} / {password}")
        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())

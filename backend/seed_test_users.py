"""One-off local script: creates a handful of test accounts for manual
testing (contacts, group chats, DMs between two "real" devices/sessions).
Safe to re-run — skips any display name that already exists (display names
aren't unique in the DB, but this script's own bookkeeping treats them as
one, since there's no username to key off anymore).

Usage (from backend/, with the venv active):
    python seed_test_users.py
"""

import asyncio

from sqlalchemy import select

from app.auth import assign_uin, hash_password
from app.database import async_session, init_db
from app.models import User
from app.reserved_uins import seed_reserved_uins

TEST_USERS = [
    ("Тестовый Один", "test1234"),
    ("Тестовый Два", "test1234"),
    ("Тестовый Три", "test1234"),
]


async def main() -> None:
    await init_db()
    async with async_session() as db:
        await seed_reserved_uins(db)
        for display_name, password in TEST_USERS:
            existing = await db.execute(select(User).where(User.display_name == display_name))
            if existing.scalar_one_or_none() is not None:
                print(f"skip {display_name}: already exists")
                continue
            uin = await assign_uin(db)
            db.add(
                User(
                    uin=uin,
                    display_name=display_name,
                    hashed_password=hash_password(password),
                )
            )
            print(f"created {display_name}: UIN {uin} / password {password}")
        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())

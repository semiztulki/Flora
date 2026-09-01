"""Generates the set of "pretty" 5-digit UINs held back from random
registration assignment — repdigits, round thousands, ascending/descending
runs, and palindromes. About 1% of the 10000-99999 space, which is plenty to
keep round/memorable numbers away from random luck without meaningfully
shrinking the pool everyone else draws from.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ReservedUin


def generate_pretty_uins() -> dict[int, str]:
    pretty: dict[int, str] = {}

    for d in range(1, 10):
        pretty[int(str(d) * 5)] = "repdigit"

    for d in range(1, 10):
        pretty[d * 10000] = "round"

    for start in range(1, 6):  # 12345, 23456, 34567, 45678, 56789
        digits = "".join(str(start + i) for i in range(5))
        pretty[int(digits)] = "ascending run"
    for start in range(5, 10):  # 54321, 65432, 76543, 87654, 98765
        digits = "".join(str(start - i) for i in range(5))
        pretty[int(digits)] = "descending run"

    for a in range(1, 10):
        for b in range(0, 10):
            for c in range(0, 10):
                pretty[int(f"{a}{b}{c}{b}{a}")] = "palindrome"

    return pretty


async def seed_reserved_uins(db: AsyncSession) -> None:
    existing = await db.execute(select(ReservedUin.number))
    already = {row[0] for row in existing.all()}
    for number, note in generate_pretty_uins().items():
        if number in already:
            continue
        db.add(ReservedUin(number=number, note=note))
    await db.commit()

"""Taxonomy mapping loaded from YAML and seeded into taxonomy_map."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from promptwall.storage.models import TaxonomyMap


@dataclass(frozen=True)
class TaxonomyEntry:
    category: str
    atlas_id: str
    owasp_id: str
    nist_function: str


def load_taxonomy(path: Path) -> dict[str, TaxonomyEntry]:
    with path.open("r", encoding="utf-8") as handle:
        raw: Any = yaml.safe_load(handle)
    if not isinstance(raw, dict) or not isinstance(raw.get("categories"), list):
        raise ValueError(f"invalid taxonomy file: {path}")
    entries: dict[str, TaxonomyEntry] = {}
    for item in raw["categories"]:
        if not isinstance(item, dict):
            raise ValueError(f"invalid taxonomy entry in {path}")
        entry = TaxonomyEntry(
            category=str(item["category"]),
            atlas_id=str(item["atlas_id"]),
            owasp_id=str(item["owasp_id"]),
            nist_function=str(item["nist_function"]),
        )
        entries[entry.category] = entry
    if not entries:
        raise ValueError(f"taxonomy file is empty: {path}")
    return entries


async def seed_taxonomy(session: AsyncSession, entries: dict[str, TaxonomyEntry]) -> None:
    """Insert or update taxonomy rows. Idempotent, so startup can call it every time."""
    existing = {
        row.category: row for row in (await session.execute(select(TaxonomyMap))).scalars().all()
    }
    for entry in entries.values():
        row = existing.get(entry.category)
        if row is None:
            session.add(
                TaxonomyMap(
                    category=entry.category,
                    atlas_id=entry.atlas_id,
                    owasp_id=entry.owasp_id,
                    nist_function=entry.nist_function,
                )
            )
        else:
            row.atlas_id = entry.atlas_id
            row.owasp_id = entry.owasp_id
            row.nist_function = entry.nist_function
    await session.commit()

#!/usr/bin/env python3
"""
Hook Cursor postToolUse : commit Git automatique après une modification de fichier.
Désactiver : export PHR_SKIP_AUTO_GIT_COMMIT=1 (ou dans .env local du shell qui lance Cursor).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

# Outils qui modifient le dépôt (noms côté Cursor ; ajuster si la doc évolue).
EDIT_TOOLS = frozenset(
    {
        "Write",
        "StrReplace",
        "ApplyPatch",
        "EditNotebook",
        "Delete",
    }
)


def _load_tool_input(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _paths_to_stage(tool_name: str, tool_input: dict[str, Any]) -> list[str]:
    out: list[str] = []
    p = tool_input.get("path")
    if isinstance(p, str) and p.strip():
        out.append(p.strip())
    if tool_name == "EditNotebook":
        nb = tool_input.get("notebook_path") or tool_input.get("target_notebook")
        if isinstance(nb, str) and nb.strip():
            out.append(nb.strip())
    # ApplyPatch / formats exotiques : pas de path unique fiable → laisser vide.
    return out


def main() -> int:
    if os.environ.get("PHR_SKIP_AUTO_GIT_COMMIT", "").strip() in ("1", "true", "yes", "on"):
        print("{}")
        return 0

    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        print("{}")
        return 0

    tool_name = str(data.get("tool_name") or "")
    if tool_name not in EDIT_TOOLS:
        print("{}")
        return 0

    cwd = str(data.get("cwd") or os.getcwd())
    os.chdir(cwd)

    r = subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], capture_output=True, text=True)
    if r.returncode != 0 or r.stdout.strip() != "true":
        print("{}")
        return 0

    tool_input = _load_tool_input(data.get("tool_input"))
    paths = _paths_to_stage(tool_name, tool_input)

    if paths:
        subprocess.run(["git", "add", "--", *paths], check=False)
    else:
        # Pas de path explicite : seulement fichiers déjà suivis (évite d’ajouter des zip / artefacts non ignorés).
        subprocess.run(["git", "add", "-u"], check=False)

    st = subprocess.run(["git", "diff", "--cached", "--quiet"], capture_output=True)
    if st.returncode == 0:
        # Rien à committer
        print("{}")
        return 0

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    msg = f"wip: sauvegarde auto ({tool_name}) {ts}"
    c = subprocess.run(["git", "commit", "-m", msg], capture_output=True, text=True)
    # Ne jamais faire échouer l’agent si commit impossible (pas de user.name, hook, etc.).
    if c.returncode != 0:
        sys.stderr.write(c.stderr or c.stdout or "git commit failed\n")

    print("{}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Render the central transition policy into the exact SQL Editor script."""
from pathlib import Path
from backend.services.operations import STATUS_TRANSITIONS

START = "  -- BEGIN GENERATED STATUS POLICY"
END = "  -- END GENERATED STATUS POLICY"
def policy_sql():
    lines = [START, "  -- Source: backend/services/operations.py; regenerate with python -m backend.sql.render_status_policy", "  targets := CASE i.status"]
    for status, targets in STATUS_TRANSITIONS.items():
        if targets:
            values = ",".join("'" + target + "'" for target in targets)
            lines.append(f"    WHEN '{status}' THEN ARRAY[{values}]")
    lines.extend(["    ELSE ARRAY[]::text[] END;", END])
    return "\n".join(lines)

if __name__ == "__main__":
    path = Path(__file__).with_name("stage4_operations.sql")
    source = path.read_text(encoding="utf-8")
    start = source.index(START)
    end = source.index(END) + len(END)
    path.write_text(source[:start] + policy_sql() + source[end:], encoding="utf-8")

from typing import List


def normalize_cell(value: str) -> str:
    return value.strip()


def parse_audit_selection(selection: List[str]) -> List[str]:
    if not selection:
        return ["all"]
    audits: List[str] = []
    for entry in selection:
        for item in entry.split(","):
            item = item.strip().lower()
            if item:
                audits.append(item)
    return audits if audits else ["all"]


def should_run_audit(audits: List[str], name: str) -> bool:
    return "all" in audits or name in audits

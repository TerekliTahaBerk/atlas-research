#!/usr/bin/env python3
"""Offline Phase 00 documentation checks; no app execution, install or infrastructure."""

from pathlib import Path
import hashlib
import json
import re
import sys
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
failures = []
checks = []


def check(label, errors):
    errors = list(errors)
    checks.append(label)
    if errors:
        failures.extend(f"{label}: {error}" for error in errors)
        print(f"FAIL: {label} ({len(errors)})")
        for error in errors:
            print(f"  {error}")
    else:
        print(f"PASS: {label}")


required = [
    "docs/PRODUCT_SPEC.md", "docs/USER_FLOWS.md", "docs/SCREEN_MAP.md",
    "docs/design/DESIGN_SYSTEM.md", "docs/design/REFERENCE_AUDIT.md",
    "docs/ARCHITECTURE.md", "docs/DATA_MODEL.md", "docs/AUTHORIZATION.md",
    "docs/AI_AND_SOURCE_CONTRACT.md", "docs/COOLIFY_PLAN.md",
    "docs/VERIFICATION_PLAN.md", "docs/PHASE_00_HANDOFF.md",
    "docs/decisions/0002-authentication.md",
    "docs/decisions/0003-tenancy-and-authorization.md",
    "docs/decisions/0004-files-jobs-and-realtime.md",
    "docs/design/reference/manifest.json", "docs/design/reference/README.md",
] + [f"docs/phases/PHASE_{i:02}.md" for i in range(6)]
check("required deliverables", (p for p in required if not (ROOT / p).is_file()))

markdown = sorted(p for p in ROOT.rglob("*.md") if ".git" not in p.parts)
link_errors = []
link_count = 0
for path in markdown:
    # Code fences are examples, not Markdown navigation links.
    body = re.sub(r"^```[^\n]*\n.*?^```\s*$", "", path.read_text(), flags=re.M | re.S)
    for match in re.finditer(r"!?\[[^\]\n]*\]\((<[^>]+>|[^)\s]+)(?:\s+\"[^\"]*\")?\)", body):
        target = match.group(1).strip("<>")
        parsed = urlsplit(target)
        if parsed.scheme or target.startswith("#"):
            continue
        local = unquote(parsed.path)
        if not local:
            continue
        link_count += 1
        dest = (path.parent / local).resolve()
        if not dest.is_relative_to(ROOT) or not dest.exists():
            link_errors.append(f"{path.relative_to(ROOT)}: {target}")
check(f"local Markdown file links ({link_count})", link_errors)

phase_errors = []
for i in range(6):
    path = ROOT / f"docs/phases/PHASE_{i:02}.md"
    if not path.exists():
        continue
    body = path.read_text()
    for heading in ["Amaç", "Kapsam", "Kapsam dışı", "Önkoşullar", "Görevler", "Test ve kabul kriterleri", "Bitiş koşulları"]:
        if not re.search(r"^## " + re.escape(heading), body, flags=re.M):
            phase_errors.append(f"{path.name}: missing {heading}")
    if f"G{i:02}" not in body or f"P{i:02}-1" not in body:
        phase_errors.append(f"{path.name}: missing acceptance gate / PR slices")
check("phase sections, gates and PR slices", phase_errors)

flow = (ROOT / "docs/USER_FLOWS.md").read_text()
screen_map = (ROOT / "docs/SCREEN_MAP.md").read_text()
flow_errors = []
for i in range(1, 12):
    if f"J1.{i} " not in flow:
        flow_errors.append(f"missing J1.{i}")
screen_ids = set(re.findall(r"\bS\d{2}\b", screen_map))
for screen in sorted(set(re.findall(r"\bS\d{2}\b", flow)) - screen_ids):
    flow_errors.append(f"unmapped flow screen {screen}")
for i in range(1, 18):
    if f"S{i:02}" not in screen_ids:
        flow_errors.append(f"missing S{i:02}")
check("J1 journey and S01-S17 screen references", flow_errors)

reference = ROOT / "docs/design/reference"
manifest = json.loads((reference / "manifest.json").read_text())
hash_errors = []
for row in manifest["files"]:
    path = reference / row["path"]
    if not path.is_file():
        hash_errors.append(f"missing {row['path']}")
        continue
    data = path.read_bytes()
    if len(data) != row["published_bytes"] or hashlib.sha256(data).hexdigest() != row["published_sha256"]:
        hash_errors.append(f"byte count / SHA-256 mismatch: {row['path']}")
check("published reference SHA-256 and byte counts", hash_errors)

privacy_errors = []
source = (reference / "Atlas.dc.html").read_text()
emails = re.findall(r"[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}", source)
if any(not email.endswith("@example.invalid") for email in emails):
    privacy_errors.append("non-demo email remains in reference (values withheld)")
if re.search(r"\b(?:Taha|Ayşe|Mehmet|Elif|Jonas)\b", source):
    privacy_errors.append("original person-name label remains in reference")
secret_pattern = re.compile(r"sk-(?:proj-|live_|test_)[A-Za-z0-9]{12,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY")
for path in [*markdown, reference / "Atlas.dc.html"]:
    text = path.read_text()
    if secret_pattern.search(text) or re.search(r"data:application/pdf|%PDF-", text):
        privacy_errors.append(f"credential/embedded PDF pattern: {path.relative_to(ROOT)} (values withheld)")
check("reference privacy and obvious secret/PDF patterns", privacy_errors)

scope_errors = []
for path in ROOT.rglob("*"):
    if not path.is_file() or ".git" in path.parts:
        continue
    rel = path.relative_to(ROOT)
    forbidden_name = path.name in {"package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "Dockerfile", "compose.yml", "compose.yaml", "docker-compose.yml", "schema.prisma"}
    forbidden_dir = rel.parts[0] in {"app", "src", "pages", "prisma", "migrations", "node_modules"} or rel.parts[:2] == (".github", "workflows")
    if forbidden_name or forbidden_dir:
        scope_errors.append(str(rel))
check("Phase 00: no app manifests, source tree, migrations or deployment config", scope_errors)

legacy = json.loads((ROOT / "docs/repository/legacy-refs.json").read_text())
check("legacy reference manifest parses", [] if legacy else ["empty manifest"])

if failures:
    print(f"FAIL: {len(failures)} issue(s) in {len(checks)} check groups")
    sys.exit(1)
print(f"PASS: {len(checks)} documentation check groups. App/build/DB/deploy/AI tests: NOT RUN.")

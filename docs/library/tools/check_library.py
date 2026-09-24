#!/usr/bin/env python3
"""Lightweight integrity checks for the documentation authority index."""
import csv
import re
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
from build_requirements import build

ROOT = Path(__file__).resolve().parents[3]
DOCS = ROOT / 'docs'
LIBRARY = DOCS / 'library'

subprocess.run([sys.executable, str(LIBRARY / 'tools/build_library.py'), '--check'], cwd=ROOT, check=True)


def fail(message):
    raise SystemExit(message)


with (LIBRARY / 'catalog.csv').open(newline='', encoding='utf-8') as stream:
    catalog = list(csv.DictReader(stream))
actual = {str(path.relative_to(DOCS)) for path in DOCS.rglob('*')
          if path.is_file() and not str(path.relative_to(DOCS)).startswith('library/')
          and path.name not in {'.DS_Store', '.gitkeep'}}
listed = {row['path'] for row in catalog}
if actual != listed:
    fail(f'Catalog mismatch: missing={sorted(actual-listed)}, extra={sorted(listed-actual)}')
if len(catalog) != len(listed) or any(not row['review_basis'] for row in catalog):
    fail('Catalog has duplicate paths or missing review basis')

for page in LIBRARY.glob('*.md'):
    text = page.read_text(encoding='utf-8')
    for destination in re.findall(r'(?<!!)\[[^]]*\]\(([^)]+)\)', text):
        target = destination.split('#', 1)[0]
        if target and '://' not in target and not target.startswith('mailto:') and not (page.parent / target).exists():
            fail(f'Broken library link: {page} -> {destination}')

generated, documents, entries = build()
if (LIBRARY / 'requirements.csv').read_text(encoding='utf-8') != generated:
    fail('requirements.csv is stale; run build_requirements.py')
if documents != sum(row['type'] == 'Requirements (FRD/PRD)' for row in catalog):
    fail('Requirement document count mismatch')
for row in csv.DictReader((LIBRARY / 'requirement_status.csv').open(newline='', encoding='utf-8')):
    for path in row['evidence_paths'].split(';'):
        path = path.strip()
        if path and not (ROOT / path).exists():
            fail(f"Missing requirement evidence path: {row['source']} {row['requirement_id']} -> {path}")

print(f'Library valid: {len(catalog)} documents, {documents} FRD/PRD files, {entries} requirement entries')

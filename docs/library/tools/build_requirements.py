#!/usr/bin/env python3
"""Extract stable requirement IDs; merge manually reviewed delivery evidence.

The extractor is deliberately conservative. Documents without numbered IDs get a
NEEDS_ATOMIZATION row. Generated rows default to UNVERIFIED, never implemented.
"""
import argparse
import csv
import io
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
LIBRARY = ROOT / 'docs/library'
SOURCE = ROOT / 'docs'
ID = re.compile(r'(?:[A-Z]{2,12}-){1,3}\d{1,3}|(?:FR|TR|UR)-\d{1,3}')
LEAD = re.compile(r'^\s*(?:\|\s*|#{1,6}\s*|[-*]\s*)?(?:\*\*)?(' + ID.pattern + r')(?:\*\*)?\s*(?:[:—–|.]|\s+-\s+|\s+shall\b)', re.I)
FIELDS = ['source', 'requirement_id', 'line', 'requirement_text', 'status', 'acceptance_criteria', 'evidence_paths', 'checked_commit', 'checked_date', 'notes']
STATUSES = {'UNVERIFIED', 'TARGET', 'IMPLEMENTED_STATIC', 'VERIFIED_RUNTIME', 'PARTIAL', 'DEFERRED', 'SUPERSEDED', 'NEEDS_ATOMIZATION'}


def read_csv(path):
    if not path.exists():
        return []
    with path.open(newline='', encoding='utf-8') as stream:
        return list(csv.DictReader(stream))


def build():
    catalog = read_csv(LIBRARY / 'catalog.csv')
    source_files = [row['path'] for row in catalog if row['type'] == 'Requirements (FRD/PRD)']
    overrides = {(row['source'], row['requirement_id']): row for row in read_csv(LIBRARY / 'requirement_status.csv')}
    output = []
    seen = set()
    for source in source_files:
        lines = (SOURCE / source).read_text(encoding='utf-8', errors='replace').splitlines()
        found = []
        for number, line in enumerate(lines, 1):
            match = LEAD.match(line)
            if not match:
                continue
            key = match.group(1).upper()
            if key in found:
                continue
            found.append(key)
            clean = re.sub(r'\s+', ' ', line).strip(' |*#')[:500]
            row = dict(source=source, requirement_id=key, line=number, requirement_text=clean,
                       status='UNVERIFIED', acceptance_criteria='', evidence_paths='', checked_commit='', checked_date='', notes='')
            overlay = overrides.get((source, key))
            if overlay:
                for field in FIELDS[4:]:
                    row[field] = overlay.get(field, '') or row[field]
            output.append(row)
            seen.add((source, key))
        if not found:
            key = 'UNNUMBERED'
            row = dict(source=source, requirement_id=key, line='', requirement_text='Document has no machine-detected stable requirement IDs.',
                       status='NEEDS_ATOMIZATION', acceptance_criteria='', evidence_paths='', checked_commit='', checked_date='', notes='')
            overlay = overrides.get((source, key))
            if overlay:
                for field in FIELDS[4:]:
                    row[field] = overlay.get(field, '') or row[field]
            output.append(row)
            seen.add((source, key))
    stale = set(overrides) - seen
    if stale:
        raise SystemExit('Unknown status overrides: ' + ', '.join(map(str, sorted(stale))))
    for row in output:
        if row['status'] not in STATUSES:
            raise SystemExit(f"Invalid status: {row['source']} {row['requirement_id']} {row['status']}")
        if row['status'] in {'IMPLEMENTED_STATIC', 'VERIFIED_RUNTIME', 'PARTIAL', 'SUPERSEDED', 'DEFERRED'} and not row['evidence_paths']:
            raise SystemExit(f"Evidence required: {row['source']} {row['requirement_id']}")
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=FIELDS, lineterminator='\n')
    writer.writeheader()
    writer.writerows(output)
    return stream.getvalue(), len(source_files), len(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data, documents, requirements = build()
    target = LIBRARY / 'requirements.csv'
    if args.check:
        if not target.exists() or target.read_text(encoding='utf-8') != data:
            raise SystemExit('requirements.csv is stale; run build_requirements.py')
    else:
        target.write_text(data, encoding='utf-8')
    print(f'{documents} requirement documents; {requirements} extracted entries')

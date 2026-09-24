#!/usr/bin/env python3
"""Rebuild docs/library/ (catalog.csv, area pages, BY-TYPE.md, FLAGS.md, README.md).

Run from anywhere:  python3 docs/library/tools/build_library.py
Inputs: git history + document headers under docs/, tools/flags_head.md, and the
manual FLAGS dict below (edit `flag(...)` calls when a flag is resolved or added).
"""
import json, re, os, csv, collections, subprocess, glob, sys, tempfile
from datetime import date
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
DOCS = os.path.join(ROOT, 'docs')
LIBRARY_OUT = os.path.join(DOCS, 'library') + '/'
CHECK_MODE = '--check' in sys.argv[1:]
CHECK_TEMP = tempfile.TemporaryDirectory(prefix='c2c-library-check-') if CHECK_MODE else None
OUT = (CHECK_TEMP.name if CHECK_TEMP else LIBRARY_OUT) + '/'
TODAY = '2026-09-24'  # snapshot date shown in FLAGS.md; update when re-baselining
os.chdir(ROOT)

def git_dates():
    """path -> (first, last) commit date, in one pass."""
    out = subprocess.check_output(['git', 'log', '--format=@%cs', '--name-only', '--', 'docs'], text=True)
    first, last, cur = {}, {}, None
    for ln in out.splitlines():  # newest first
        if ln.startswith('@'): cur = ln[1:]
        elif ln:
            last.setdefault(ln, cur); first[ln] = cur
    # A rebuild normally happens before the documentation commit. Reflect the
    # working-tree date now so the generated catalog does not become stale as
    # soon as that commit lands. A clean post-commit rebuild yields the same date.
    dirty = subprocess.check_output(['git', 'status', '--porcelain=v1', '--untracked-files=all', '--', 'docs'], text=True)
    for ln in dirty.splitlines():
        path = ln[3:]
        if ' -> ' in path:
            path = path.split(' -> ', 1)[1]
        if path.startswith('docs/') and not path.startswith('docs/library/'):
            last[path] = date.today().isoformat()
    return first, last

def load_meta():
    first, last = git_dates()
    rows = []
    for r, d, fs in os.walk(DOCS):
        for f in fs:
            if f in ('.DS_Store', '.gitkeep'): continue
            full = os.path.join(r, f); p = os.path.relpath(full, DOCS)
            if p.startswith('library/'): continue
            title = status = ver = ''; lines = 0
            if p.endswith(('.md', '.MD')):
                t = open(full, errors='ignore').read(); lines = t.count('\n')
                m = re.search(r'^#\s+(.+)$', t, re.M); title = m.group(1).strip() if m else ''
                head = t[:2500]
                m = re.search(r'(?im)^\W*\**(status|state)\**\s*[:|]\s*\**(.+)$', head); status = m.group(2).strip()[:100] if m else ''
                m = re.search(r'(?im)(version|v)\s*[:|]?\s*\**\s*(\d+\.\d+(\.\d+)?)', head); ver = m.group(2) if m else ''
            g = 'docs/' + p
            rows.append(dict(path=p, title=title, status=status, ver=ver, lines=lines, last=last.get(g, ''), first=first.get(g, '')))
    return sorted(rows, key=lambda x: x['path'])

def load_paths():
    res = {}
    for f in glob.glob(DOCS + '/**/*.md', recursive=True):
        p = os.path.relpath(f, DOCS)
        if p.startswith('library/'): continue
        t = open(f, errors='ignore').read()
        refs = set(re.findall(r'`((?:apps|docs)/[A-Za-z0-9_./\-\[\]()@]+?\.(?:ts|tsx|js|jsx|md|prisma|json|yaml|yml|sh|mjs))`', t))
        dead = [x for x in refs if '*' not in x and not os.path.exists(os.path.join(ROOT, x))]
        if refs: res[p] = (len(refs), len(dead))
    return res

meta = load_meta()
paths = load_paths()

# ---------- domain rules (first match wins) ----------
D = collections.OrderedDict([
 ('ask', 'Ask Cozy, AI Concierge & Agentic Intelligence'),
 ('personalization', 'Personalization Engine'),
 ('context', 'Property Context & Property Setup'),
 ('guidance', 'Guidance, Actions & Home Intelligence'),
 ('intel', 'Property Intelligence, Environment & Event Radar'),
 ('records', 'Home Records, Maintenance & Digital Twin'),
 ('financial', 'Coverage, Risk & Financial Tools'),
 ('providers', 'Providers, Pricing & Renovation Execution'),
 ('transitions', 'Buying, Selling & Life Transitions'),
 ('platform', 'Product Framework & Capability Platform'),
 ('admin', 'Admin, Workers & Operations'),
 ('data', 'Data Architecture (Pass 1-7)'),
 ('prelaunch', 'Pre-Launch Audits & Strategy (Mar-Apr 2026)'),
 ('business', 'Acquisition & Business'),
 ('wiki', 'Code-Grounded Wiki (existing docs/wiki)'),
 ('meta', 'Meta & Methodology'),
])
RULES = [
 (r'^wiki/', 'wiki'),
 (r'^readme\.md$|audit_methodology', 'meta'),
 (r'^acquisition/|pilot_raise', 'business'),
 (r'^audit/|^audit-gemini/|^audits/ui-audit|icon-audit|production_(gap|readiness)|exhaustive_system|final_implementation_plan|^audits/signal-action', 'prelaunch'),
 (r'pass\d|^functional/dashboard-stats|feature-data-flow|schema-intelligence|homescore_db', 'data'),
 (r'ask_cozy|ai_home_concierge|agentic|intelligence_readiness|ai_request_governance|skill_platform|ai_cards|ai_home_decision|ai_room_scan|intelligence_envelope|c2c_intelligence', 'ask'),
 (r'^personalization/', 'personalization'),
 (r'^property-context/property_intelligence_phase1', 'intel'),
 (r'^property-context/|property_setup|rentcast|property_enhancement|testing_property_onboarding|corrected_user|property_page_best', 'context'),
 (r'guidance|deterministic|home_intelligence|home_action|unified_home_action|home_operations|dashboard-next|decision_trace|intelligence_layers|signal-action|resolution', 'guidance'),
 (r'environment_report|risk_replay|event_radar|event-radar|neighborhood|recall_safety|property_intelligence|nyc_zap|property_brief|home_gazette|knowledge_hub', 'intel'),
 (r'coverage|claims|risk_assessment|ownership_cost|ownership-costs|property_tax|hidden_|mortgage|improvement_financing|reserve_fund|capital_decision|inventory_and_coverage', 'financial'),
 (r'provider|service_price|service_category|negotiation|renovation|home_renovation|diy_|live_project|service_quote', 'providers'),
 (r'home_buyer|sale_readiness|home_digital_will|home_continuity', 'transitions'),
 (r'seasonal|rooms_experience|home_timeline|es_home_timeline|digital_twin|material_spec|permit_history|smart_home|inspection_report|household_collab|home_tools|home_digital', 'records'),
 (r'^product/(phase|decision-platform|capability-discovery|governance|contracttocozy|capability_|home_action)|product_framework|worker_module|w6_|w7_', 'platform'),
 (r'admin|worker_jobs|pwa_layer|^operations/|backup|longhorn', 'admin'),
 (r'^product/', 'platform'),
 (r'^functional/', 'records'),
]
def domain(p):
    lp = p.lower()
    for rx, k in RULES:
        if re.search(rx, lp): return k
    return 'meta'

# ---------- type rules ----------
def dtype(p, title, status):
    lp = p.lower(); lt = (title or '').lower()
    ext = lp.rsplit('.', 1)[-1]
    if ext in ('csv', 'json', 'docx', 'gitkeep'): return 'Data / asset'
    if 'adr' in re.split(r'[-_/ .]', lp) or lp.split('/')[-1].startswith('adr'): return 'ADR (decision)'
    if re.search(r'^operations/|runbook|backup|rollout|smoke|test_fixtures|cutover', lp): return 'Runbook / ops'
    if re.search(r'audit|gap|verification|review|assessment|findings|feasibility|evidence|reregistration|reverification', lp): return 'Audit / analysis'
    if re.search(r'implementation_plan|implementation-plan|roadmap|execution-plan|hardening-plan|_plan\.|-plan\.|plan-', lp): return 'Plan'
    if re.search(r'frd|prd|requirements', lp): return 'Requirements (FRD/PRD)'
    if re.search(r'handoff|session_prompt|completion|status|slice_|phase\d|readme|approval|registry|inventory|manifest|governance|policy|template|dictionary|disposition|gate|report', lp): return 'Status / phase record'
    if re.search(r'sprint|tracker|scorecard|route-audit|strategic|contract|one-pager|variants', lp): return 'Status / phase record'
    return 'Feature reference'

# ---------- manual flags: path -> (level, short note, flag id) ----------
# level: RED = conflicting/superseded; ORANGE = status lags reality or heavy dead refs; YELLOW = historical snapshot
F = {}
def flag(paths_, level, fid, note):
    for x in paths_: F[x] = (level, fid, note)

flag(['functional/AI_CARDS_SUMMARY.md'], 'RED', 'C1', 'Retired historical four-card inventory; superseded by AI_CARDS_SUMMARY_UPDATED.md. The successor is also stale as a current inventory (C18).')
flag(['functional/AI_CARDS_SUMMARY_UPDATED.md'], 'ORANGE', 'C18', 'Not a current feature inventory: still lists Climate Risk Predictor as a working AI feature, but climateRisk.routes.ts returns 410 CLIMATE_RISK_RETIRED.')
flag(['functional/SMART_HOME_INTEGRATION_HUB.md'], 'RED', 'C2', 'Retired design draft; SMART_HOME_IOT_INTEGRATION_FRD.md explicitly supersedes its direct alert-to-Incident path. 28/33 cited code paths do not exist.')
flag(['functional/SMART_HOME_IOT_INTEGRATION_FRD.md'], 'ORANGE', 'C2', 'No status line; 18/27 cited code paths (smartHome routes/services) do not exist and no smart-home route/page found in code - appears unimplemented.')
flag(['functional/GUIDANCE_ENGINE_FRD_Updated.md'], 'RED', 'C3', 'A distinct user-initiated resolution FRD despite the "Updated" name. Manual journey route exists, but TR-01 names initiatedByUser, targetAssetId, and integer templateVersion while schema uses isUserInitiated, scopeId, and string templateVersion. FR-02/TR-01 are PARTIAL in requirement_status.csv.')
flag(['functional/GUIDANCE_ENGINE_FRD.md', 'architecture/GUIDANCE_ENGINE.md'], 'ORANGE', 'C3', 'Three overlapping Guidance Engine specs (this, FRD_Updated, architecture/GUIDANCE_ENGINE.md); no doc says which governs. Last touched Mar 24-26 (FRD had a Jul 27 touch).')
flag(['functional/HOME_EVENT_RADAR_FRD.md'], 'ORANGE', 'C4', 'Status still "Proposed" while the Implementation Plan says "In progress - launch acceptance implemented" and 2 of the 3 Home Event Radar ADRs are Accepted.')
flag(['personalization/08-personalization-frd.md'], 'ORANGE', 'C5', 'Status "Proposed; implementation not authorized" but modules/personalization exists in code and README says internal validation is live.')
flag(['personalization/04-target-architecture.md'], 'YELLOW', 'C5', 'Titled "Current Target Architecture" - README says larger target sections are long-term reference, not commitments.')
flag(['personalization/adr-0001-personalization-module-foundation.md', 'personalization/adr-0002-phase1-foundation-migration-steps-1-3.md'], 'YELLOW', 'C5', 'Self-declared Superseded (retained as history). Do not implement from these.')
flag(['personalization/codebase-evidence.md'], 'ORANGE', 'C19', 'Six cited code paths are gone, including orchestration.routes.ts and ActionCenter.tsx; use as discovery-time evidence, not current architecture.')
flag(['product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md'], 'ORANGE', 'C6', 'Status says "implementation is not claimed", yet seven architecture/ASK_COZY_PHASE*_VERIFICATION/REVERIFICATION docs (Sep 16-18) report Complete.')
flag(['product/AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md'], 'ORANGE', 'C6', 'Frontmatter version 1.3 / Aug 11, file touched Aug 29 (version likely not bumped); status "Proposed"; amends Ask Redo v1.6, which itself says "in progress".')
flag(['product/AI_HOME_CONCIERGE_ASK_REDO_FRD.md'], 'ORANGE', 'C6', 'Aug "AI Home Concierge Ask" family vs Sep "Ask Cozy" family: no doc states that one supersedes the other.')
flag(['property-context/PROPERTY_CONTEXT_FRD.md', 'property-context/PROPERTY_CONTEXT_CATALOG_GOVERNANCE_FRD.md'], 'ORANGE', 'C7', 'Status "Proposed" but ~27 sibling docs in this folder record phases 0-8 / JIT slices 0-5 as implemented.')
flag(['property-context/PROPERTY_INTELLIGENCE_PHASE1_RECOMMENDATION.md'], 'ORANGE', 'C7', '"Not yet approved" (Jul 26) but functional/PROPERTY_INTELLIGENCE_*, NYC_ZAP and PROPERTY_BRIEF (Jul 30-31) look like its follow-through.')
flag(['product/CAPABILITY_DISCOVERY_AND_RECOMMENDATION_PLATFORM_FRD.md'], 'ORANGE', 'C8', 'Status "Proposed" while its plan says "Implementation in progress"; 4/6 cited paths under frontend/src/features/tools/ no longer exist.')
flag(['product/HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md', 'product/HOME_OPERATIONS_AND_ACTION_MANAGEMENT_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md', 'product/PROPERTY_INTELLIGENCE_AND_BRIEFINGS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md', 'product/RENOVATION_COMPLIANCE_AND_EXECUTION_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md', 'product/CAPITAL_DECISION_PLANNING_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md', 'product/HIDDEN_SAVINGS_AND_BENEFITS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md'], 'ORANGE', 'C9', 'Status "Recommended implementation plan" never advanced. Project memory says Home Continuity is fully on main (not re-verified in code here); sibling audits with the same header (Tax, Coverage, Ownership Cost) were updated to "Implemented".')
flag(['audit/contracttocozy-90-day-execution-plan-2026-04-18.md', 'audit/contracttocozy-strategic-audit-2026-04-18.md'], 'RED', 'C10', 'The v2 sibling explicitly supersedes this v1 in its header. Retain only if historical comparison is needed.')
flag(['audit/contracttocozy-90-day-execution-plan-v2-2026-04-18.md', 'audit/contracttocozy-strategic-audit-v2-2026-04-18.md', 'audit/contracttocozy-implementation-plan-2026-04-18.md', 'audit/contracttocozy-pre-launch-execution-plan-2026-04-18.md', 'audit/contracttocozy-pre-launch-hardening-plan-2026-04-18.md', 'audit-gemini/90-day-roadmap-audit.md', 'audit-gemini/strategic-transformation-plan.md'], 'ORANGE', 'C10', 'One of ~7 overlapping Apr 18-20 pre-launch plans (audit/ + audit-gemini/); no index says which is canonical. Pre-launch framing is out of date (W7 real-user cutover runbook exists, Jul 2026).')
flag(['functional/SEASONAL_FEATURE_SESSION_PROMPT.md'], 'RED', 'C11', 'A session prompt, not a spec; untouched since Jan 3. Cites deleted checklistItem controller/component.')
flag(['functional/SEASONAL_MAINTENANCE_HANDOFF.md'], 'ORANGE', 'C11', 'Body predates the deprecated ChecklistItem -> PropertyMaintenanceTask consolidation; 3 cited files deleted. Header notes "canonical Home integration implemented; historic..."')
flag(['functional/EXHAUSTIVE_SYSTEM_AUDIT.md', 'functional/FINAL_IMPLEMENTATION_PLAN.md', 'functional/PROPERTY_ENHANCEMENT_ANALYSIS.md', 'functional/CORRECTED_USER_HOMEOWNER_ANALYSIS.md', 'functional/SERVICE_CATEGORY_CONFIG_ANALYSIS.md', 'functional/RISK_ASSESSMENT_COMPREHENSIVE_DOCS.md'], 'YELLOW', 'C12', 'Jan 3 2026 one-off analysis; never updated. Cites pages that no longer exist ((dashboard)/checklist, /maintenance, /action-center, HomeBuyerDashboard). "CORRECTED_" implies an earlier wrong version that is not in the repo.')
flag(['functional/Testing_Property_Onboarding.md'], 'ORANGE', 'C13', 'PROPERTY_SETUP_CURRENT_STATE_AUDIT (line ~599) states parts of this checklist are stale vs current code (redirect behaviour).')
flag(['README.md'], 'ORANGE', 'C14', 'Lists api/, deployment/, development/ as documentation areas though they contain only .gitkeep; calls stale feature-data-flow-pass2.md canonical and calls the wiki current, despite their documented snapshot limits.')
flag(['functional/HOME_RESERVE_FUND_PLANNER_FRD.md'], 'ORANGE', 'C20', 'Core reserve-fund route, page and schema exist, but three cited paths are missing (including the by-design workers Prisma path); verify file-level architecture before implementation.')
flag(['product/COVERAGE_AND_PREMIUM_OPTIMIZATION_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md'], 'ORANGE', 'C21', 'Claims implementation complete but four cited code paths no longer exist. Outcome requirements may still govern; file-level implementation map is stale.')
flag(['functional/HOME_RISK_REPLAY.md'], 'ORANGE', 'C15', 'Top banner (2026-07-30) says the feature is now "Past Hazard Exposure"; the 1,194-line body still describes the old design and all 4 cited worker provider files are gone. Banner-only reconciliation.')
flag(['functional/MATERIAL_SPEC_REGISTRY.md', 'functional/HIDDEN_ASSET_FINDER.md'], 'ORANGE', 'C15', 'Route exists in code but many cited frontend/worker files do not (14/24 and 3/8): implementation moved or partial. Verify before relying on file-level detail.')
flag(['product/SALE_READINESS_VALUE_MAXIMIZATION_IMPLEMENTATION_PLAN.md'], 'ORANGE', 'C16', 'Status "Design fully resolved" (Aug 6) - project memory says it is fully implemented; 6/19 cited sellerPrep paths no longer exist.')
flag(['feature-data-flow-pass2.md'], 'ORANGE', 'C17', 'Pass docs are Mar 27 snapshots; this one was touched Jul 24 but still cites 9 missing files (homeRiskReplay service/controller/validators, orchestrationCompletion controller).')
flag(['wiki/README.md', 'wiki/00-introduction.md', 'wiki/01-getting-started.md', 'wiki/02-architecture-and-data-model.md',
      'wiki/features/01-onboarding-and-property-setup.md', 'wiki/features/02-home-health-inventory-and-maintenance.md',
      'wiki/features/03-guidance-ai-concierge-and-personalization.md', 'wiki/features/04-coverage-risk-and-financial-tools.md',
      'wiki/features/05-marketplace-providers-and-services.md', 'wiki/features/06-home-events-environment-and-community.md',
      'wiki/features/07-sale-buyer-and-life-transitions.md', 'wiki/features/08-admin-analytics-and-platform-operations.md'],
     'YELLOW', 'W', '2026 code snapshot. Home Actions/Resolution Center and Emergency entry paths were rechecked 2026-09-22; other claims need current route, service, and render-path verification before implementation.')

REDCOUNT = collections.Counter()

# ---------- build rows ----------
rows = []
for m in meta:
    p = m['path']
    if p.endswith(('.gitkeep',)): continue
    dom = domain(p)
    typ = dtype(p, m['title'], m['status'])
    n, dead = paths.get(p, (0, 0))
    level, fid, note = F.get(p, ('', '', ''))
    auto = []
    if not level:
        if dom != 'wiki' and m['last'] and m['last'] <= '2026-04-30' and p.endswith('.md'):
            level, fid, note = 'YELLOW', 'H', 'Historical snapshot (last changed %s, before the Jul 2026 launch-readiness work). Verify against code before use.' % m['last']
        elif n >= 5 and dead / n >= 0.3 and dead >= 3:
            level, fid, note = 'ORANGE', 'D', '%d of %d cited code paths do not exist.' % (dead, n)
    rows.append(dict(path=p, domain=dom, type=typ, title=m['title'] or os.path.basename(p), status=m['status'], ver=m['ver'],
                     lines=m['lines'], first=m['first'], last=m['last'], refs=n, dead=dead, level=level, fid=fid, note=note))

ICON = {'RED': '\U0001F534', 'ORANGE': '\U0001F7E0', 'YELLOW': '\U0001F7E1', '': ''}
def esc(s): return (s or '').replace('|', '\\|').replace('\n', ' ')
def link(p, frm=''):
    return '../' + p
def cite(r):
    return '[%s](../%s)' % (esc(r['title'])[:90] or r['path'], r['path'])

# ---------- CSV ----------
with open(OUT + 'catalog.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['path', 'domain', 'type', 'title', 'status', 'version', 'lines', 'first_commit', 'last_commit', 'code_refs', 'dead_refs', 'flag', 'flag_id', 'flag_note', 'review_basis'])
    for r in rows:
        basis = ('targeted cross-document and/or code-path review' if r['fid'].startswith('C') else
                 'git-date heuristic only' if r['fid'] == 'H' else
                 'wiki snapshot; selected paths rechecked' if r['fid'] == 'W' else
                 'inventory, metadata and cited-path checks only')
        w.writerow([r['path'], D[r['domain']], r['type'], r['title'], r['status'], r['ver'], r['lines'], r['first'], r['last'], r['refs'], r['dead'], r['level'], r['fid'], r['note'], basis])

# ---------- domain pages ----------
fn = {k: '%02d-%s.md' % (i + 1, k) for i, k in enumerate(D)}
TYPE_ORDER = ['Requirements (FRD/PRD)', 'ADR (decision)', 'Plan', 'Feature reference', 'Audit / analysis', 'Status / phase record', 'Runbook / ops', 'Data / asset']
for k, name in D.items():
    rs = [r for r in rows if r['domain'] == k]
    L = ['# %s' % name, '', '[Library home](README.md) · [Flags](FLAGS.md)', '',
         '%d documents. Flag key: \U0001F534 conflicting/superseded · \U0001F7E0 status lags reality or cites missing code · \U0001F7E1 historical snapshot. Blank = no issue found (not proof it is current - check *Last changed*).' % len(rs), '']
    for t in TYPE_ORDER:
        ts = [r for r in rs if r['type'] == t]
        if not ts: continue
        L += ['## %s (%d)' % (t, len(ts)), '', '| | Document | Status (as written) | Last changed | Lines |', '|---|---|---|---|---|']
        for r in sorted(ts, key=lambda x: x['last'], reverse=True):
            st = esc(r['status'])[:80]
            if r['ver']: st = ('v' + r['ver'] + ' · ' if st else 'v' + r['ver']) + st
            L.append('| %s | %s | %s | %s | %s |' % (ICON[r['level']] + (' ' + r['fid'] if r['fid'] not in ('', 'H', 'D') else ''), cite(r), st, r['last'], r['lines'] or ''))
        L.append('')
    fl = [r for r in rs if r['level'] in ('RED', 'ORANGE')]
    if fl:
        L += ['## Flag details for this area', '']
        for r in fl: L.append('- %s **%s** - %s' % (ICON[r['level']], r['path'], r['note']))
        L.append('')
    open(OUT + fn[k], 'w').write('\n'.join(L))

# ---------- by-type page ----------
L = ['# Documents by type', '', '[Library home](README.md)', '']
for t in TYPE_ORDER:
    ts = [r for r in rows if r['type'] == t]
    L += ['## %s (%d)' % (t, len(ts)), '', 'Most recently changed first; showing area.', '', '| | Document | Area | Last changed |', '|---|---|---|---|']
    for r in sorted(ts, key=lambda x: x['last'], reverse=True):
        L.append('| %s | %s | %s | %s |' % (ICON[r['level']], cite(r), D[r['domain']].split(',')[0][:40], r['last']))
    L.append('')
open(OUT + 'BY-TYPE.md', 'w').write('\n'.join(L))


# ---------- FLAGS.md (hand-written head + auto historical list) ----------
head = open(os.path.join(HERE, 'flags_head.md')).read().replace('seven root-level Pass/dashboard docs', 'eight root-level Pass/dashboard/icon docs')
L = [head, '## Auto-flagged: historical (\U0001F7E1 H) - last changed on/before 2026-04-30', '',
     'Grouped by folder. Full list with dates in `catalog.csv` (filter `flag_id = H`).', '']
g = collections.defaultdict(list)
for r in rows:
    if r['fid'] == 'H': g[r['path'].rsplit('/', 1)[0] if '/' in r['path'] else '(docs root)'].append(r)
for k, v in sorted(g.items()):
    L.append('- **%s/** - %d files, %s to %s' % (k, len(v), min(x['last'] for x in v), max(x['last'] for x in v)))
dcount = [r for r in rows if r['fid'] == 'D']
if dcount:
    L += ['', '## Auto-flagged: cites missing code (\U0001F7E0 D)', '', '| Document | Missing / cited | Last changed |', '|---|---|---|']
    for r in sorted(dcount, key=lambda r: -r['dead'] / r['refs']):
        L.append('| [%s](../%s) | %d / %d | %s |' % (r['path'], r['path'], r['dead'], r['refs'], r['last']))
open(OUT + 'FLAGS.md', 'w').write('\n'.join(L) + '\n')

# ---------- README.md ----------
c = collections.Counter(r['domain'] for r in rows)
fl = collections.defaultdict(collections.Counter)
for r in rows: fl[r['domain']][r['level']] += 1
guide = {
 'ask': 'Ask Cozy conversational workspace, AI concierge, skills, agentic architecture',
 'personalization': 'Recommendation/personalization engine: discovery pack, FRD, ADRs, phase audits',
 'context': 'Property Context platform, JIT capture slices, property setup/onboarding, RentCast',
 'guidance': 'Guidance Engine, home actions, Home Intelligence, home operations, signals',
 'intel': 'Environment report, Home Event Radar, hazard exposure, neighborhood, briefs, recalls',
 'records': 'Maintenance/seasonal, timeline, digital twin, rooms, permits, materials, smart home',
 'financial': 'Coverage, claims, risk, ownership cost, tax, savings, mortgage, reserve fund',
 'providers': 'Provider profiles/reviews, service pricing, renovation, DIY, negotiation',
 'transitions': 'Home buyer, sale readiness, digital will, continuity',
 'platform': 'Product Framework phases 0-6, capability discovery, decision platform, launch runbooks',
 'admin': 'Admin module, worker jobs, backup/DB ops, PWA',
 'data': 'Pass 1-7 schema/data-flow analyses',
 'prelaunch': 'Mar-Apr 2026 audits, 90-day plans, route audits, production readiness',
 'business': 'Acquisition one-pagers, pilot/fundraise plan',
 'wiki': 'Existing code-grounded wiki (setup, architecture, 8 feature guides)',
 'meta': 'Docs index and audit methodology'}
L = ['# Documentation Library', '',
 'A searchable map of everything under `docs/` (%d files, snapshot %s). Start here instead of scanning raw folders.' % (len(rows), TODAY), '',
 '> This complements [`../wiki/`](../wiki/README.md), a code-grounded feature snapshot. **Use the wiki to locate the relevant workflow, then verify its route, service, schema, and render path before changing behavior. Use this library to find the governing requirement, plan, ADR, audit, or runbook and its review flags.**', '',
 '## Find something', '',
 '| I want to... | Go to |', '|---|---|',
 '| Find docs about a feature/area | the area table below |',
 '| Find all runbooks / all ADRs / all FRDs | [BY-TYPE.md](BY-TYPE.md) |',
 '| Decide which requirement governs | [AUTHORITY.md](AUTHORITY.md) |',
 '| Change or retire product behavior | [CHANGE_POLICY.md](CHANGE_POLICY.md) |',
 '| Review FRD authority and unresolved requirement families | [REQUIREMENTS_REVIEW.md](REQUIREMENTS_REVIEW.md) |',
 '| Check individual requirement status and evidence | [requirements.csv](requirements.csv) and [requirement_status.csv](requirement_status.csv) |',
 '| Know whether a doc is stale or conflicts with another | [FLAGS.md](FLAGS.md) |',
 '| Find documents that may be deleted | [FLAGS.md — Deletion candidates](FLAGS.md#deletion-candidates) |',
 '| Grep/filter by anything (status, date, dead-code refs, review basis) | [`catalog.csv`](catalog.csv) |',
 '| Find a code-path starting point | [`../wiki/`](../wiki/README.md), then verify against current code |', '',
 'Quick searches from the repo root:', '', '```bash',
 'grep -i "smart home" docs/library/catalog.csv                      # locate a doc',
 "python3 -c \"import csv;[print(r['path']) for r in csv.DictReader(open('docs/library/catalog.csv')) if r['flag']=='RED']\"   # conflicting docs",
 '```', '',
 '## Areas', '',
 '| Area | Docs | \U0001F534 | \U0001F7E0 | \U0001F7E1 | Covers |', '|---|---|---|---|---|---|']
for k, name in D.items():
    L.append('| [%s](%s) | %d | %d | %d | %d | %s |' % (name, fn[k], c[k], fl[k]['RED'], fl[k]['ORANGE'], fl[k]['YELLOW'], guide[k]))
L += ['', '## Which doc wins? (reading order when several overlap)', '',
 '| Topic | Read first | Then | Treat as history |', '|---|---|---|---|',
 '| Ask Cozy | `product/ASK_COZY_INLINE_WORKSPACE_FRD.md` (check its current version; states it governs the completion target) | Interaction Model FRD, Cross-Domain Rollout FRD, `architecture/ASK_COZY_PHASE*` verification docs | Aug `AI_HOME_CONCIERGE_ASK_*` family unless you need addendum detail (lineage undeclared - see C6) |',
 '| Guidance Engine | `functional/GUIDANCE_ENGINE_FRD.md` (v2.1 living) | `GUIDANCE_ENGINE_FRD_Updated.md` for the resolution-journey feature | gap-analysis / phased plan (Mar 29) |',
 '| Personalization | `personalization/README.md` (states current strategy) | `08` FRD only for long-term intent | ADR-0001/0002 (superseded) |',
 '| Home Event Radar | `functional/HOME_EVENT_RADAR.md` (current state) | FRD + Implementation Plan + ADRs | - |',
 '| Property Context | `property-context/PROPERTY_CONTEXT_FRD.md` + phase completion audits | JIT FRD + slice docs | - |',
 '| Smart Home | `SMART_HOME_IOT_INTEGRATION_FRD.md` (unbuilt) | - | `SMART_HOME_INTEGRATION_HUB.md` |',
 '| AI feature cards | Current feature routes and the relevant feature FRDs | `AI_CARDS_SUMMARY_UPDATED.md` for July 2026 history only (see C18) | `AI_CARDS_SUMMARY.md` (superseded) |',
 '| Pre-launch strategy | none - all Apr 2026 | `product/ContractToCozy_W7_Launch_Cutover_Runbook.md` for launch | all of `audit/`, `audit-gemini/` |', '',
 'These are recommendations from the flag review, not decisions recorded in the source docs.', '',
 '## Maintaining this library', '',
 'Rebuild after docs change: `python3 docs/library/tools/build_library.py`, then `python3 docs/library/tools/build_requirements.py`. `requirement_status.csv`, AUTHORITY.md, and REQUIREMENTS_REVIEW.md are manually maintained. Run `python3 docs/library/tools/check_library.py` to validate generated pages, inventory, links, requirement entries, and evidence paths without modifying them.',
 'The `review_basis` column distinguishes targeted findings from metadata-only checks. A blank flag means no issue was detected by those checks, not that every requirement was validated.',
 'Flags are manual: edit the `flag(...)` calls in `tools/build_library.py` and the prose in `tools/flags_head.md`, then rebuild. Bump `TODAY` in the script when you re-baseline.']
open(OUT + 'README.md', 'w').write('\n'.join(L) + '\n')
if CHECK_MODE:
    stale = []
    for name in sorted(os.listdir(OUT)):
        generated = open(OUT + name, 'rb').read()
        current_path = LIBRARY_OUT + name
        if not os.path.exists(current_path) or open(current_path, 'rb').read() != generated:
            stale.append(name)
    CHECK_TEMP.cleanup()
    if stale:
        raise SystemExit('Stale generated library files: ' + ', '.join(stale))
print(len(rows), 'docs;', dict(collections.Counter(r['level'] for r in rows)))

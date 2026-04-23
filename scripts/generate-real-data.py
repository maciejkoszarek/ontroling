#!/usr/bin/env python3
"""Generate src/lib/realData.ts from parsed JSON."""
import json
import re

with open('/tmp/cca-parse/employees.json') as f:
    data = json.load(f)

employees = data['employees']
projects = data['projects']
assignments = data['assignments']

# ---------- Market units ----------
# Collect every MU appearing in projects or assignments
mus_used = set()
for p in projects:
    mus_used.add(p['mu'])
for a in assignments:
    mus_used.add(a['mu'])

MU_META = {
    'AUTO':      ('AUTO', 'AUTO'),
    'VW_GROUP':  ('VW_GROUP', 'VW Group'),
    'MHT':       ('MHT', 'MHT'),
    'RED':       ('RED', 'Retail/Logistics (RED)'),
    'PS':        ('PS', 'Public Sector'),
    'UNN':       ('UNN', 'UNN (Unified Nordics)'),
    'OTHER':     ('OTHER', 'Other / Internal'),
    'OTHER_BU':  ('OTHER_BU', 'Other BU'),
    'UK':        ('UK', 'UK'),
    'FS':        ('FS', 'Financial Services'),
    'CIS':       ('CIS', 'CIS'),
    'GDC':       ('GDC', 'GDC Overhead'),
    'BAYER':     ('BAYER', 'Bayer'),
    'NORDICS':   ('NORDICS', 'Nordics'),
    'PUBLIC':    ('PUBLIC', 'Public'),
    'IDC':       ('IDC', 'IDC Methods'),
    'ITD':       ('ITD', 'ITD'),
}

market_units = []
for mu in sorted(mus_used):
    code, display = MU_META.get(mu, (mu, mu))
    market_units.append({'code': code, 'displayName': display, 'sbu': 'GDC PL ABL'})

# ---------- Projects ----------
# Assign synthetic project numbers "P0001"..."Pnnnn"
# Detect internal / non-billable by keyword
INTERNAL_KEYWORDS = [
    'IDC-Bench', 'IDC_L&D', 'IDC-Intern', 'PPLM', 'STAFFING', 'Unpaid_Leave',
    'Paid Leave', 'Leaver', 'Transfer', 'HIRING', 'GDC PL ABL MAN',
    'Internal-Projects', 'NSC-Internal', 'BU_Support', 'SBU_Support',
    'MS_Bootstrap', 'BD_Nordics',
]
def is_internal(name):
    for kw in INTERNAL_KEYWORDS:
        if kw.lower() in name.lower():
            return True
    return False

def is_overhead_bucket(name):
    return name in {'IDC-Bench', 'PPLM', 'STAFFING', 'Unpaid_Leave', 'Paid Leave', 'Leaver',
                    'Transfer', 'HIRING', 'IDC_L&D_Standard', 'IDC-Intern'}

# Customer heuristic: first token before '-' or space
def infer_customer(name):
    for prefix in ['BMW', 'MB', 'Mercedes', 'Audi', 'AUDI', 'VW', 'CARIAD', 'Porsche', 'PowerCO', 'Sogeti', 'ZF',
                   'DHL', 'K+N', 'ALDI', 'Dachser', 'DB', 'Eprimo', 'HAPAG', 'HENKEL', 'IKEA', 'LH-',
                   'MCD', 'OBI', 'REWE', 'SCHENKER', 'Tennet', 'Uniper', 'ENGIE',
                   'BVA', 'BVK', 'DGUV', 'D-NRW', 'BMI', 'BfArM', 'BA', 'AOK', 'Dataport', 'LFU', 'LGL',
                   'Toll', 'Polizei', 'Register', 'Grundsteuer', 'PD', 'Healthcare/NLGA', 'Zensus', 'BNotKa',
                   'BNoTK', 'Academy', 'ITZ', 'Konsens', 'H2', 'Nina',
                   'ABB', 'Airbus', 'Bosch', 'BSH', 'DTAG', 'DTPI', 'Qiagen', 'SAP', 'Siemens', 'Telefonica',
                   'Vodafone', 'Boehringer', 'SE Maritime',
                   'Bayer', 'Fresenius', 'Astrazeneca',
                   'ABN AMRO', 'CREDIT SUISSE', 'EUROCLEAR', 'UNIQUA', 'ALLIANZ', 'SIX GROUP', 'AMEX',
                   'DigiOss', 'Stellantis', 'Navblue', 'MSPolska', 'MyPlace', 'Microsoft', 'HP',
                   'DSB', 'EMA', 'Gasunie', 'MoFA', 'Royal Mail', 'TATA', 'Volvo', 'Northvolt', 'Nuuday',
                   'EC-Cities', 'ASML', 'IDVOM', 'var energi', 'CBG', 'NATO', 'Telia',
                   'Tereg', 'AppsModernisation', 'CySip', 'Data Platform', 'PRISM', 'TME',
                   'BBS', 'HR Tool', 'DANAHER', 'PIANO', 'EURO CDP', 'GLASFASER', 'Agents 4 Us']:
        if name.startswith(prefix) or name.startswith(prefix + ' ') or name.startswith(prefix + '-'):
            return prefix.replace('+', '').strip()
    return name.split('-')[0].split(' ')[0][:20] or 'Unknown'

# Sort projects alphabetically for stable ordering
projects_sorted = sorted(projects, key=lambda p: p['name'])
project_by_name = {}
ts_projects = []
for idx, p in enumerate(projects_sorted, start=1):
    proj_num = f"P{idx:04d}"
    internal = is_internal(p['name'])
    overhead = is_overhead_bucket(p['name'])
    status = 'active'
    if overhead:
        customer = 'Internal'
    else:
        customer = infer_customer(p['name'])
    project_by_name[p['name']] = proj_num
    ts_projects.append({
        'projectNumber': proj_num,
        'name': p['name'],
        'customer': customer,
        'marketUnit': p['mu'],
        'isBillable': not internal,
        'status': status,
        'startDate': '2025-01-01',
        'endDate': '2026-12-31',
        'tags': ['internal'] if internal else ['external'],
    })

# ---------- Employees ----------
LOCATIONS = ['WRO', 'POZ', 'GDN', 'WAW', 'KRK', 'REMOTE']
GRADES = ['A5', 'B1', 'B2', 'C1', 'C2', 'D1', 'NG', 'Z']

def pick_location(local_number):
    # deterministic pseudo-random from hash
    h = sum(ord(c) for c in local_number)
    return LOCATIONS[h % len(LOCATIONS)]

# Compute displayName and normalize casing: titlecase for names that are all-caps
def tc(s):
    if not s:
        return s
    if s.isupper():
        # Convert to title case but keep Polish chars
        return ' '.join(w.capitalize() for w in s.split())
    return s

def job_function(grade, pu):
    if grade == 'Z':
        return 'Z'
    return 'CSS'

# Determine start date: employee's earliest assignment period if start date missing
emp_earliest = {}
for a in assignments:
    ln = a['localNumber']
    p = a['period']
    if ln not in emp_earliest or p < emp_earliest[ln]:
        emp_earliest[ln] = p

ts_employees = []
for e in employees:
    ln = e['localNumber']
    # If from SE sheet we have startDate; otherwise use earliest assignment
    sd = e.get('startDate') or '2020-01-01'
    # Normalize start date format: "2021.04.01" → "2021-04-01"
    sd = sd.replace('.', '-')
    # Some might be just "2021-04-01" already
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', sd):
        # try to parse loose
        m = re.match(r'^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})', sd)
        if m:
            sd = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        else:
            sd = '2020-01-01'
    first = tc(e['firstName'])
    last = tc(e['lastName'])
    display = f"{first} {last}"
    grade = e.get('gradeCode') or 'B2'
    if grade not in GRADES:
        grade = 'B2'
    ts_employees.append({
        'localNumber': ln,
        'ggid': e.get('ggid'),
        'firstName': first,
        'lastName': last,
        'displayName': display,
        'puCode': e['puCode'],
        'gradeCode': grade,
        'jobFunction': job_function(grade, e['puCode']),
        'locationCode': pick_location(ln),
        'startDate': sd,
        'fteCapacity': e.get('fteCapacity') or 1.0,
        'engagement': e['puCode'],
        'skills': [],
    })

# ---------- Assignments → GfsHours ----------
HOURS_PER_FTE = 160
ts_gfs = []
for a in assignments:
    proj_num = project_by_name.get(a['project'])
    if not proj_num:
        continue
    proj = next((p for p in ts_projects if p['projectNumber'] == proj_num), None)
    if not proj:
        continue
    hours = round(a['fte'] * HOURS_PER_FTE, 1)
    if hours <= 0:
        continue
    if is_overhead_bucket(a['project']):
        ptype = 'Management Resource'
    elif not proj['isBillable']:
        ptype = 'Management Resource'
    else:
        ptype = 'External Services'
    ts_gfs.append({
        'employeeLocalNumber': a['localNumber'],
        'period': a['period'],
        'projectNumber': proj_num,
        'projectType': ptype,
        'hours': hours,
    })

# ---------- Emit TS ----------
def ts_str(s):
    if s is None:
        return 'undefined'
    return json.dumps(s, ensure_ascii=False)

def emit_market_units():
    lines = ['export const realMarketUnits: MarketUnit[] = [']
    for mu in market_units:
        lines.append(f"  {{ code: {ts_str(mu['code'])}, displayName: {ts_str(mu['displayName'])}, sbu: {ts_str(mu['sbu'])} }},")
    lines.append('];')
    return '\n'.join(lines)

def emit_projects():
    lines = ['export const realProjects: Project[] = [']
    for p in ts_projects:
        lines.append(
            f"  {{ projectNumber: {ts_str(p['projectNumber'])}, "
            f"name: {ts_str(p['name'])}, "
            f"customer: {ts_str(p['customer'])}, "
            f"marketUnit: {ts_str(p['marketUnit'])}, "
            f"isBillable: {'true' if p['isBillable'] else 'false'}, "
            f"status: {ts_str(p['status'])}, "
            f"startDate: {ts_str(p['startDate'])}, "
            f"endDate: {ts_str(p['endDate'])}, "
            f"tags: {json.dumps(p['tags'])} }},"
        )
    lines.append('];')
    return '\n'.join(lines)

def emit_employees():
    lines = ['export const realEmployees: Employee[] = [']
    for e in ts_employees:
        parts = [
            f"localNumber: {ts_str(e['localNumber'])}",
        ]
        if e['ggid']:
            parts.append(f"ggid: {ts_str(e['ggid'])}")
        parts += [
            f"firstName: {ts_str(e['firstName'])}",
            f"lastName: {ts_str(e['lastName'])}",
            f"displayName: {ts_str(e['displayName'])}",
            f"puCode: {ts_str(e['puCode'])}",
            f"gradeCode: {ts_str(e['gradeCode'])}",
            f"jobFunction: {ts_str(e['jobFunction'])}",
            f"locationCode: {ts_str(e['locationCode'])}",
            f"startDate: {ts_str(e['startDate'])}",
            f"fteCapacity: {e['fteCapacity']}",
            f"engagement: {ts_str(e['engagement'])}",
            f"skills: []",
        ]
        lines.append(f"  {{ {', '.join(parts)} }},")
    lines.append('];')
    return '\n'.join(lines)

def emit_gfs():
    lines = ['export const realGfsHours: GfsHours[] = [']
    for g in ts_gfs:
        lines.append(
            f"  {{ employeeLocalNumber: {ts_str(g['employeeLocalNumber'])}, "
            f"period: {ts_str(g['period'])}, "
            f"projectNumber: {ts_str(g['projectNumber'])}, "
            f"projectType: {ts_str(g['projectType'])}, "
            f"hours: {g['hours']} }},"
        )
    lines.append('];')
    return '\n'.join(lines)

ts = f"""// Auto-generated from ForecastProjectsCCACoreApps_2026.xlsx.
// Do not edit by hand — run scripts/generate-real-data.py to regenerate.

import type {{ Employee, GfsHours, MarketUnit, Project }} from "../types";

{emit_market_units()}

{emit_projects()}

{emit_employees()}

{emit_gfs()}
"""

import sys
sys.stdout.write(ts)

# stderr summary
sys.stderr.write(f"MUs: {len(market_units)}\n")
sys.stderr.write(f"Projects: {len(ts_projects)}\n")
sys.stderr.write(f"Employees: {len(ts_employees)}\n")
sys.stderr.write(f"GFS hours: {len(ts_gfs)}\n")

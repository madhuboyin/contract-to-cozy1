# Icon System Audit — Contract to Cozy
_Generated: 2026-03-09_

---

## 1. Executive Summary

| Dimension | Finding |
|---|---|
| Icon library | **100% Lucide React** — zero other sources detected |
| Files using lucide-react | **203 files** across frontend |
| Distinct icons in use | ~120+ unique icon identifiers |
| Config-driven icon maps | 5 central config files |
| Critical collisions | `FileText` (8+ concepts), `Shield` (5 concepts), `Zap` (3 concepts) |
| Desktop/mobile mismatches | Confirmed in Checklist, Seasonal, Home tools |
| Config duplication | `HOME_TOOL_LINKS` + `AI_TOOL_LINKS` defined independently in both `layout.tsx` and `mobileToolCatalog.ts` |

**Top priority fixes:** `FileText` overloading in BottomNav Home Admin section, `Shield` overloading in BottomNav Protection section, `Zap` collision across APPLIANCE / ELECTRICAL / SMART_HOME inventory categories.

---

## 2. Canonical Icon Library Recommendation

**Primary library: Lucide React (keep as-is)**
- Already 100% adopted — no migration needed
- Consistent stroke weight (1.5) and size grid (24px default)
- Tree-shakeable, actively maintained
- No secondary libraries should be introduced

**Naming convention to enforce:**
```
import { IconName } from 'lucide-react';
```
Never use `lucide-react/dist/esm/icons/*` direct path imports.

---

## 3. Icon Inventory

### 3a. Inventory Categories (`src/lib/config/categoryConfig.ts`)

| Category Key | Current Icon | Collision? |
|---|---|---|
| APPLIANCE | `Zap` | YES — shared with ELECTRICAL, SMART_HOME |
| ELECTRICAL | `Zap` | YES — shared with APPLIANCE, SMART_HOME |
| PLUMBING | `Droplets` | OK |
| HVAC | `Wind` | OK |
| STRUCTURAL | `Home` | OK |
| FLOORING | `Layers` | OK |
| ROOFING | `Umbrella` | OK |
| WINDOWS_DOORS | `DoorOpen` | OK |
| LANDSCAPING | `Leaf` | OK |
| SAFETY | `ShieldAlert` | OK |
| SMART_HOME | `Zap` | YES — shared with APPLIANCE, ELECTRICAL |
| FURNITURE | `Sofa` | OK |
| OUTDOOR | `Trees` | OK (if Trees exists; else `Sun`) |
| OTHER | `Package` | MINOR — generic |

### 3b. Room Types (`src/lib/config/roomConfig.ts`)

| Room Key | Current Icon | Collision? |
|---|---|---|
| LIVING_ROOM | `Sofa` | OK |
| KITCHEN | `UtensilsCrossed` | MINOR — shared with DINING |
| DINING | `UtensilsCrossed` | MINOR — shared with KITCHEN |
| BEDROOM | `BedDouble` | OK |
| BATHROOM | `Bath` | OK |
| GARAGE | `Car` | OK |
| BASEMENT | `Package` | YES — shared with ATTIC |
| ATTIC | `Package` | YES — shared with BASEMENT |
| OFFICE | `Monitor` | OK |
| LAUNDRY | `WashingMachine` | OK (verify icon exists) |
| OUTDOOR | `Trees` | OK |
| OTHER | `LayoutGrid` | OK |

### 3c. Mobile Bottom Nav — AI Tools (`src/components/mobile/dashboard/mobileToolCatalog.ts`)

| Tool | Current Icon | Note |
|---|---|---|
| Coverage Intelligence | `ShieldCheck` | OK |
| Risk Radar | `Radar` | OK |
| Energy Audit | `Zap` | COLLISION with inventory |
| Renovation ROI | `TrendingUp` | OK |
| Daily Snapshot | `CalendarClock` | MINOR — shared with Seasonal |
| Appliance Advisor | `Cpu` | OK |
| Room Insights | `Sparkles` | COLLISION with AI badge use |
| Seller Prep | `Home` | MINOR — generic |
| Financial Efficiency | `BarChart2` | OK |
| Market Intel | `Globe` | OK |
| Predictive Maintenance | `Wrench` | MINOR — generic |
| Emergency Protocol | `Siren` | OK |
| Contractor Vetter | `UserCheck` | OK |
| DIY Guide | `BookOpen` | OK |
| Smart Home | `Wifi` | OK |

### 3d. Mobile Bottom Nav — Home Tools (`src/components/mobile/dashboard/mobileToolCatalog.ts`)

| Tool | Current Icon | Note |
|---|---|---|
| Rooms | `LayoutGrid` | OK |
| Inventory | `Box` | OK |
| Maintenance | `Wrench` | MINOR — shared with Predictive Maintenance |
| Checklist | `FileText` | COLLISION — FileText overloaded |
| Seasonal | `CalendarClock` | MINOR — shared with Daily Snapshot |
| Warranties | `FileText` | COLLISION — FileText overloaded |
| Insurance | `FileText` | COLLISION — FileText overloaded |
| Reports | `FileText` | COLLISION — FileText overloaded |
| Documents | `FileText` | COLLISION — FileText overloaded |
| Expenses | `FileText` | COLLISION — FileText overloaded |

### 3e. Mobile Bottom Nav — Navigation (`src/components/mobile/BottomNav.tsx`)

| Item | Current Icon | Collision? |
|---|---|---|
| Home | `Home` | OK |
| Actions | `AlertTriangle` | OK |
| Rooms | `LayoutGrid` | OK |
| Services | `Search` | OK |
| More | `Ellipsis` | OK |
| Properties | `Building` | OK |
| Bookings | `Calendar` | OK |
| Inventory | `Box` | OK |
| Maintenance | `Wrench` | OK |
| Checklist | `FileText` | COLLISION |
| Seasonal | `CalendarClock` | MINOR |
| Daily Snapshot | `CalendarClock` | MINOR — shared with Seasonal |
| Risk Radar | `Radar` | OK |
| Incidents | `Shield` | COLLISION — shared with Claims, Recalls |
| Claims | `Shield` | COLLISION — shared with Incidents, Recalls |
| Recalls | `Shield` | COLLISION — shared with Incidents, Claims |
| Reports | `FileText` | COLLISION |
| Warranties | `FileText` | COLLISION |
| Insurance | `FileText` | COLLISION |
| Expenses | `FileText` | COLLISION |
| Documents | `FileText` | COLLISION |
| Community Events | `Globe` | OK |
| Profile | `Settings` | OK |
| Logout | `LogOut` | OK |

### 3f. Task Status Badges (`src/components/tasks/TaskStatusBadge.tsx`)

| Status | Current Icon | Note |
|---|---|---|
| PENDING | `Clock` | OK |
| IN_PROGRESS | `PlayCircle` | OK |
| COMPLETED | `CheckCircle` | OK |
| CANCELLED | `Ban` | OK |
| FAILED | `XCircle` | OK |

### 3g. Service Categories (`src/components/ServiceCategoryIcon.tsx`)

| Category | Current Icon | Note |
|---|---|---|
| Plumbing | `Droplets` | OK |
| Electrical | `Zap` | COLLISION with inventory |
| HVAC | `Wind` | OK |
| Landscaping | `Leaf` | OK |
| Cleaning | `Sparkles` | COLLISION with AI badge use |
| Renovation | `Hammer` | OK |
| Roofing | `Umbrella` | OK |
| Pest Control | `Bug` | OK |
| Security | `Lock` | OK |
| Default | `Wrench` | MINOR — generic fallback |

---

## 4. Standardization Recommendations

### FileText Overloading (Critical)
`FileText` is used for Checklist, Warranties, Insurance, Reports, Documents, Expenses — 6 distinct concepts. Recommended replacements:

| Concept | Recommended Icon | Rationale |
|---|---|---|
| Checklist | `ListChecks` | Literally a checklist — matches desktop nav |
| Warranties | `ShieldCheck` | Protection document |
| Insurance | `ShieldAlert` | Active coverage alert |
| Reports | `BarChart2` | Analytics/reporting |
| Documents | `FolderOpen` | File storage |
| Expenses | `Receipt` | Financial records |

### Shield Overloading (Critical)
`Shield` used for Incidents, Claims, Recalls — 3 concepts. Recommended replacements:

| Concept | Recommended Icon | Rationale |
|---|---|---|
| Incidents | `AlertOctagon` | Event/incident — urgent signal |
| Claims | `FilePlus` | Document submission |
| Recalls | `RotateCcw` | Recall = reversal/return |

### Zap Overloading (Critical)
`Zap` used for APPLIANCE, ELECTRICAL, SMART_HOME inventory categories and Energy Audit tool. Recommended replacements:

| Concept | Recommended Icon | Rationale |
|---|---|---|
| APPLIANCE | `Refrigerator` | Home appliance |
| ELECTRICAL | `Zap` | Keep — most semantic match |
| SMART_HOME | `Wifi` | Connectivity |
| Energy Audit | `BatteryCharging` | Energy optimization |

### CalendarClock Collision (Minor)
`CalendarClock` used for both Seasonal and Daily Snapshot. Recommended fix:

| Concept | Recommended Icon |
|---|---|
| Seasonal | `CalendarDays` |
| Daily Snapshot | `CalendarClock` | Keep |

### Package Collision in Rooms (Minor)
`Package` used for both BASEMENT and ATTIC. Recommended fix:

| Concept | Recommended Icon |
|---|---|
| BASEMENT | `ArrowDown` or `Layers` |
| ATTIC | `ArrowUp` or `MoveUp` |

### Sparkles Collision (Minor)
`Sparkles` used for Room Insights tool AND Cleaning service — different semantic contexts. Recommended fix:

| Concept | Recommended Icon |
|---|---|
| Room Insights (AI) | `Sparkles` | Keep — AI connotation |
| Cleaning | `Brush` or `Wind` | Physical cleaning |

---

## 5. Desktop / Mobile Mismatches

| Item | Desktop (`layout.tsx`) | Mobile (`mobileToolCatalog.ts` / `BottomNav.tsx`) |
|---|---|---|
| Checklist | `ListChecks` | `FileText` |
| Seasonal | `CalendarDays` (likely) | `CalendarClock` |
| Predictive Maintenance | `Activity` or `Wrench` | `Wrench` |
| Room Insights | `Sparkles` | `Sparkles` ✓ |
| Coverage Intelligence | `ShieldCheck` | `ShieldCheck` ✓ |

**Root cause:** `HOME_TOOL_LINKS` and `AI_TOOL_LINKS` are defined independently in both `src/app/(dashboard)/layout.tsx` and `src/components/mobile/dashboard/mobileToolCatalog.ts`. These should be merged into a single shared config.

---

## 6. Missing Icon Opportunities

| Location | Gap | Recommended Fix |
|---|---|---|
| `ServiceCategoryIcon.tsx` default | `Wrench` is wrong for unknown services | Use `HelpCircle` or `Package` |
| BottomNav Community Events | `Globe` is too generic | Use `Users` or `MapPin` |
| BottomNav Bookings | `Calendar` is fine but `CalendarCheck` is more specific | Consider `CalendarCheck` |
| Inventory OTHER category | `Package` is generic | Use `HelpCircle` |
| Room OTHER type | `LayoutGrid` is a layout icon | Use `Square` or `HelpCircle` |

---

## 7. Final JSON Mapping

This is the canonical icon mapping for all config-driven concepts. Save as `src/lib/config/iconMapping.json`.

```json
{
  "inventory_categories": {
    "APPLIANCE": "Refrigerator",
    "ELECTRICAL": "Zap",
    "PLUMBING": "Droplets",
    "HVAC": "Wind",
    "STRUCTURAL": "Home",
    "FLOORING": "Layers",
    "ROOFING": "Umbrella",
    "WINDOWS_DOORS": "DoorOpen",
    "LANDSCAPING": "Leaf",
    "SAFETY": "ShieldAlert",
    "SMART_HOME": "Wifi",
    "FURNITURE": "Sofa",
    "OUTDOOR": "Sun",
    "OTHER": "HelpCircle"
  },
  "room_types": {
    "LIVING_ROOM": "Sofa",
    "KITCHEN": "UtensilsCrossed",
    "DINING": "Coffee",
    "BEDROOM": "BedDouble",
    "BATHROOM": "Bath",
    "GARAGE": "Car",
    "BASEMENT": "Layers",
    "ATTIC": "MoveUp",
    "OFFICE": "Monitor",
    "LAUNDRY": "WashingMachine",
    "OUTDOOR": "Trees",
    "OTHER": "HelpCircle"
  },
  "service_categories": {
    "Plumbing": "Droplets",
    "Electrical": "Zap",
    "HVAC": "Wind",
    "Landscaping": "Leaf",
    "Cleaning": "Brush",
    "Renovation": "Hammer",
    "Roofing": "Umbrella",
    "Pest Control": "Bug",
    "Security": "Lock",
    "Default": "HelpCircle"
  },
  "ai_tools": {
    "coverage_intelligence": "ShieldCheck",
    "risk_radar": "Radar",
    "energy_audit": "BatteryCharging",
    "renovation_roi": "TrendingUp",
    "daily_snapshot": "CalendarClock",
    "appliance_advisor": "Cpu",
    "room_insights": "Sparkles",
    "seller_prep": "HomeIcon",
    "financial_efficiency": "BarChart2",
    "market_intel": "Globe",
    "predictive_maintenance": "Activity",
    "emergency_protocol": "Siren",
    "contractor_vetter": "UserCheck",
    "diy_guide": "BookOpen",
    "smart_home": "Wifi"
  },
  "home_tools": {
    "rooms": "LayoutGrid",
    "inventory": "Box",
    "maintenance": "Wrench",
    "checklist": "ListChecks",
    "seasonal": "CalendarDays",
    "warranties": "ShieldCheck",
    "insurance": "ShieldAlert",
    "reports": "BarChart2",
    "documents": "FolderOpen",
    "expenses": "Receipt"
  },
  "core_nav": {
    "home": "Home",
    "actions": "AlertTriangle",
    "rooms": "LayoutGrid",
    "services": "Search",
    "more": "Ellipsis",
    "properties": "Building",
    "bookings": "CalendarCheck",
    "profile": "Settings",
    "logout": "LogOut"
  },
  "protection": {
    "incidents": "AlertOctagon",
    "claims": "FilePlus",
    "recalls": "RotateCcw"
  },
  "insights": {
    "daily_snapshot": "CalendarClock",
    "risk_radar": "Radar",
    "community_events": "Users"
  },
  "task_status": {
    "PENDING": "Clock",
    "IN_PROGRESS": "PlayCircle",
    "COMPLETED": "CheckCircle",
    "CANCELLED": "Ban",
    "FAILED": "XCircle"
  }
}
```

---

## 8. Implementation Priority

| Priority | Change | Effort |
|---|---|---|
| P0 | Merge `HOME_TOOL_LINKS` + `AI_TOOL_LINKS` into single shared config | Medium |
| P0 | Fix `FileText` overloading in BottomNav Home Admin | Low |
| P0 | Fix `Shield` overloading in BottomNav Protection | Low |
| P1 | Fix `Zap` collision across inventory categories | Low |
| P1 | Fix desktop/mobile Checklist icon mismatch (`ListChecks` vs `FileText`) | Low |
| P2 | Fix `Sparkles` collision (Room Insights vs Cleaning) | Low |
| P2 | Fix `Package` collision in rooms (BASEMENT vs ATTIC) | Low |
| P2 | Fix `CalendarClock` collision (Seasonal vs Daily Snapshot) | Low |
| P3 | Replace `ServiceCategoryIcon.tsx` default from `Wrench` to `HelpCircle` | Trivial |
| P3 | Replace Community Events `Globe` with `Users` | Trivial |

# FINDING 11: Morning Pulse Recall Count Parsing Fix

## Issue
**Severity**: Low/Medium

**The Bug**: The recall CTA text promises "Recall check: X item(s) may be affected" where X is extracted via a fragile regex pattern from text content.

**The Issue**: The CTA routes to the recalls page correctly, but if the regex fails or the text format changes, the number promised on the dashboard will not match the actual number of recalls shown on the destination page. This breaks the pre-click promise and erodes user trust.

## Root Cause
The recall count was being extracted from text using a fragile regex pattern:

```typescript
function extractFirstCount(input: string): number | null {
  const match = input.match(/(\d+)\s+item/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

const recallSignalText = `${payload.surprise.headline} ${payload.surprise.detail}`;
const hasRecallSignal = /recall|affected|safety/i.test(recallSignalText);
const recallMatchCount = extractFirstCount(recallSignalText) ?? 1;
```

**Problems with this approach:**
1. Regex could fail if text format changes (e.g., "items" vs "item", different wording)
2. Falls back to `1` if parsing fails, which could be wrong
3. Text-based detection (`/recall|affected|safety/i`) could trigger false positives
4. No guarantee the parsed number matches actual recall data
5. Creates a disconnect between dashboard promise and destination reality

## Solution
Replaced fragile text parsing with direct API call to fetch actual recall count:

1. **Import recalls API**: Added `listPropertyRecalls` import
2. **Fetch real data**: Call recalls API when loading snapshot
3. **Filter active recalls**: Count only `OPEN` and `NEEDS_CONFIRMATION` statuses (exclude dismissed/resolved)
4. **Use actual count**: Display the real count from API data
5. **Graceful degradation**: If recalls API fails, hide the CTA instead of showing wrong data
6. **Added analytics**: Track recall clicks with actual count

## Implementation Details

### File Changed
- `apps/frontend/src/app/(dashboard)/dashboard/components/MorningHomePulseCard.tsx`

### Key Changes

#### 1. Added Recalls API Import
```typescript
import { listPropertyRecalls } from '../properties/[id]/recalls/recallsApi';
```

#### 2. Added State for Actual Count
```typescript
const [actualRecallCount, setActualRecallCount] = useState<number | null>(null);
```

#### 3. Fetch Real Recall Data
```typescript
const loadSnapshot = useCallback(async () => {
  // ... existing snapshot loading ...
  
  // 🔑 FIXED: Fetch actual recall count from API instead of parsing text
  try {
    const recallsData = await listPropertyRecalls(propertyId);
    // Count only OPEN and NEEDS_CONFIRMATION recalls (not dismissed or resolved)
    const activeRecalls = recallsData.matches.filter(
      match => match.status === 'OPEN' || match.status === 'NEEDS_CONFIRMATION'
    );
    setActualRecallCount(activeRecalls.length);
  } catch (recallError) {
    // If recalls API fails, don't break the whole card - just hide recall CTA
    console.warn('Failed to fetch recall count:', recallError);
    setActualRecallCount(null);
  }
}, [propertyId]);
```

#### 4. Use Actual Count Instead of Regex
```typescript
// OLD: Fragile regex parsing
const recallSignalText = `${payload.surprise.headline} ${payload.surprise.detail}`;
const hasRecallSignal = /recall|affected|safety/i.test(recallSignalText);
const recallMatchCount = extractFirstCount(recallSignalText) ?? 1;

// NEW: Use actual API data
const hasActiveRecalls = actualRecallCount !== null && actualRecallCount > 0;
const recallCount = actualRecallCount ?? 0;
```

#### 5. Updated CTA with Analytics
```typescript
{hasActiveRecalls ? (
  <Link
    href={`/dashboard/properties/${propertyId}/recalls`}
    className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
    onClick={() => track('morning_brief_recall_clicked', { propertyId, recallCount })}
  >
    <AlertTriangle className="h-3.5 w-3.5" />
    Recall check: {recallCount} item{recallCount !== 1 ? 's' : ''} may be affected →
  </Link>
) : (
  // Show home win instead
)}
```

#### 6. Removed Fragile Helper Function
Deleted the `extractFirstCount()` function entirely since it's no longer needed.

## Benefits

1. **Accuracy**: Dashboard count always matches destination page count
2. **Reliability**: No more regex parsing failures or format dependencies
3. **Trust**: Users see exactly what they expect when they click
4. **Maintainability**: No fragile text parsing to maintain
5. **Graceful Degradation**: If recalls API fails, CTA is hidden instead of showing wrong data
6. **Better Analytics**: Track actual recall counts for insights
7. **Proper Filtering**: Only shows active recalls (not dismissed/resolved)

## Testing Scenarios

- ✅ Property with 0 recalls → Shows home win message instead
- ✅ Property with 1 recall → Shows "1 item may be affected"
- ✅ Property with multiple recalls → Shows "X items may be affected"
- ✅ Recalls API fails → Hides recall CTA gracefully
- ✅ Count matches destination page exactly
- ✅ Only counts OPEN and NEEDS_CONFIRMATION statuses
- ✅ No TypeScript errors
- ✅ Analytics tracking includes actual count

## Pattern Consistency

This fix follows the same principle established in previous findings:
- **FINDING 8**: Fetch actual savings data instead of hardcoded values
- **FINDING 10**: Use proper API data instead of fragile fallbacks

The pattern is clear: **Always use real API data instead of parsing, inferring, or hardcoding values that should come from the source of truth.**

## Data Flow

```
Before (Fragile):
Text → Regex Parse → Display Count → User Clicks → API Data (mismatch!)

After (Reliable):
API Data → Display Count → User Clicks → Same API Data (perfect match!)
```

The dashboard now shows exactly what the destination page will show, maintaining the pre-click promise.

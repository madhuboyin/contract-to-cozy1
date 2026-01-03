# AI Features - Implementation Summary

## 🎯 Overview

4 AI-powered features built using Google Gemini API for Contract to Cozy platform.

---

## 📦 The Features

### 1. Emergency Troubleshooter
**What:** Conversational AI for home emergencies  
**Icon:** AlertTriangle (red gradient)  
**Route:** `/dashboard/emergency`  
**Cost:** ~$0.0004 per session

**Features:**
- Real-time emergency guidance
- Safety warnings (gas, electrical, water)
- Severity assessment (LOW/MEDIUM/HIGH/CRITICAL)
- DIY steps or professional recommendations
- Multi-turn conversation support

**Tech Stack:**
- Backend: `emergencyTroubleshooter.service.ts`, `emergency.routes.ts`
- Frontend: `EmergencyTroubleshooter.tsx`, `emergency/page.tsx`
- API: POST `/api/emergency/start`, POST `/api/emergency/continue`

---

### 2. Document Intelligence Hub
**What:** AI-powered document analysis & extraction  
**Icon:** FileText (purple gradient)  
**Route:** `/dashboard/documents`  
**Cost:** ~$0.0003 per document

**Features:**
- Auto-extract product names, model numbers, serial numbers
- Detect document type (WARRANTY/RECEIPT/MANUAL/INVOICE)
- Extract dates (purchase, warranty expiration)
- Auto-create warranty records
- Confidence scoring (0-100%)
- Visual preview before upload

**Tech Stack:**
- Backend: `documentIntelligence.service.ts`, `document.routes.ts`
- Frontend: `SmartDocumentUpload.tsx` (integrated into existing documents page)
- API: POST `/api/documents/analyze`
- Database: Uses existing Document model + added `aiInsights`, `confidence` fields

---

### 3. Appliance Replacement Oracle
**What:** Predicts appliance failures with replacement recommendations  
**Icon:** Zap (purple/pink gradient)  
**Route:** `/dashboard/oracle`  
**Cost:** ~$0.008 per report (8 appliances)

**Features:**
- Failure risk prediction (0-100%)
- Urgency levels (CRITICAL/HIGH/MEDIUM/LOW)
- Estimated failure dates
- 3 AI recommendations per appliance (brand, model, features, cost)
- Energy efficiency ratings
- Warranty information
- Category breakdowns (HVAC, Plumbing, etc.)

**Tech Stack:**
- Backend: `applianceOracle.service.ts`, `applianceOracle.routes.ts`
- Frontend: `ApplianceOracle.tsx`, `oracle/page.tsx`
- API: GET `/api/oracle/predict/:propertyId`
- Database: Uses existing Property.homeAssets field (no migration needed)

**Algorithm:**
- Age ratio = Current Age / Expected Lifespan
- Risk increases exponentially with age
- Property age multiplier applied
- Lifespan database (15+ appliances)

---

### 4. Maintenance Budget Forecaster
**What:** 12-month maintenance cost predictions  
**Icon:** DollarSign (blue gradient)  
**Route:** `/dashboard/budget`  
**Cost:** ~$0.001 per forecast

**Features:**
- Monthly breakdown (routine, preventive, unexpected)
- Category breakdown (7 categories with percentages)
- Seasonal task lists per month
- Property age factor
- AI budget optimization tips (5 recommendations)
- Confidence scoring

**Tech Stack:**
- Backend: `budgetForecaster.service.ts`, `budgetForecaster.routes.ts`
- Frontend: `BudgetForecaster.tsx`, `budget/page.tsx`
- API: GET `/api/budget/forecast/:propertyId`
- Database: Uses existing Property data (no migration needed)

**Calculations:**
- Base cost by property type (Single Family: $170/mo)
- Age multiplier: 1 + (age / 100)
- Seasonal variation (Spring/Fall higher)
- Category percentages (HVAC 25%, Plumbing 15%, etc.)

---

## 🎨 Dashboard Integration

### Visual Layout

```
┌──────────────────────────────────────┐
│ Welcome Message                      │
│ Property Selector                    │
├──────────────────────────────────────┤
│ ✨ AI-Powered Features      [NEW]   │
├─────────┬─────────┬─────────┬────────┤
│   🚨    │   📄    │   ⚡    │   💰   │
│Emergency│Document │ Oracle  │ Budget │
└─────────┴─────────┴─────────┴────────┘
```

### Card Features
- Gradient backgrounds (color-coded by feature)
- Pulsing Sparkles icon (top-right)
- Hover effects (scale + shadow)
- Responsive grid (1 col → 2 col → 4 col)
- Section header with "NEW" badge

### Code Location
```
apps/frontend/src/app/(dashboard)/dashboard/page.tsx
Lines 448-488
```

---

## 🔧 Technical Architecture

### Backend Structure
```
apps/backend/src/
├── services/
│   ├── emergencyTroubleshooter.service.ts
│   ├── documentIntelligence.service.ts
│   ├── applianceOracle.service.ts
│   └── budgetForecaster.service.ts
└── routes/
    ├── emergency.routes.ts
    ├── document.routes.ts
    ├── applianceOracle.routes.ts
    └── budgetForecaster.routes.ts
```

### Route Registration
```typescript
// apps/backend/src/index.ts
app.use('/api/emergency', emergencyRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/oracle', oracleRoutes);
app.use('/api/budget', budgetRoutes);
```

### Frontend Structure
```
apps/frontend/src/
├── components/
│   ├── EmergencyTroubleshooter.tsx
│   ├── SmartDocumentUpload.tsx (in documents page)
│   ├── ApplianceOracle.tsx
│   └── BudgetForecaster.tsx
└── app/(dashboard)/dashboard/
    ├── emergency/page.tsx
    ├── documents/page.tsx (enhanced)
    ├── oracle/page.tsx
    └── budget/page.tsx
```

### API Client Methods
```typescript
// apps/frontend/src/lib/api/client.ts
async startEmergency(issue, propertyId?)
async continueEmergency(sessionId, message)
async analyzeDocument(file, propertyId, autoCreateWarranty)
async getApplianceOracle(propertyId)
async getBudgetForecast(propertyId)
```

---

## 💰 Cost Summary

| Feature | Cost per Use | Monthly (1000 uses) |
|---------|--------------|---------------------|
| Emergency | $0.0004 | $0.40 |
| Documents | $0.0003 | $0.30 |
| Oracle | $0.008 | $8.00 |
| Budget | $0.001 | $1.00 |
| **Total** | **~$0.01** | **~$10/mo** |

**Free Tier:** 1M tokens/day (covers ~125k requests)

---

## 🔑 Configuration

### Environment Variables
```bash
GEMINI_API_KEY=your_key_here
```

### Gemini Model Used
```typescript
model: "gemini-2.0-flash-exp"
```

**Why Flash:**
- 8x cheaper than Pro
- Fast response times
- Sufficient accuracy for these use cases

---

## 📊 Data Sources

| Feature | Data Source | Migration Needed |
|---------|-------------|------------------|
| Emergency | User input | No |
| Documents | File upload | Yes (added aiInsights, confidence) |
| Oracle | Property.homeAssets | No |
| Budget | Property data | No |

**Only Documents feature required database changes.**

---

## ✨ Common Patterns

### All features use:
1. **Property Context**: Selected property from context
2. **Loading States**: Loader2 with spinner
3. **Error Handling**: Try-catch with user-friendly messages
4. **Responsive Design**: Mobile-first grid layouts
5. **AI Fallback**: Basic recommendations if Gemini fails
6. **Cost Optimization**: 
   - Low temperature (0.1-0.7) for consistency
   - Max tokens limited (500-1000)
   - Concise prompts

### Common UI Components
- Card, CardContent, CardHeader
- Button with variants
- Select for property selection
- Progress bars for metrics
- Color-coded badges for severity/urgency

---

## 🚀 Deployment Checklist

**Backend:**
- [ ] Copy 4 service files
- [ ] Copy 4 route files
- [ ] Register routes in index.ts
- [ ] Add GEMINI_API_KEY to secrets
- [ ] Run document migration (if not done)

**Frontend:**
- [ ] Copy 4 component files
- [ ] Create 4 page files
- [ ] Add API methods to client.ts
- [ ] Update dashboard page.tsx
- [ ] Add Zap icon import

**Test:**
- [ ] All 4 routes accessible
- [ ] AI responses working
- [ ] Property selector working
- [ ] Cards display correctly
- [ ] Mobile responsive

---

## 🎯 Success Metrics

Track:
1. **Usage**: Feature clicks per week
2. **Engagement**: Time spent per session
3. **Accuracy**: User feedback on AI quality
4. **Action**: Conversions to bookings/warranties
5. **Cost**: Actual Gemini API spend

---

## 📝 Quick Reference

**Dashboard Card Order:**
1. Emergency (Red) - Safety critical
2. Documents (Purple) - Document management
3. Oracle (Purple/Pink) - Predictive analytics
4. Budget (Blue) - Financial planning

**Color Scheme:**
- Red: Emergency/Critical
- Purple: AI Intelligence
- Blue: Financial/Planning
- Green: Success states
- Orange/Yellow: Warnings

**Icons:**
- AlertTriangle: Emergency
- FileText: Documents
- Zap: Oracle/Prediction
- DollarSign: Budget
- Sparkles: AI indicator

---

**Total Implementation Time: ~2 hours**  
**Total Lines of Code: ~3000**  
**Database Changes: 2 fields added**  
**Monthly Cost: ~$10 (1000 uses across all features)**

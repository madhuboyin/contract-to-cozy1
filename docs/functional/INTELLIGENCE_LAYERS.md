Comprehensive Feature Documentation: ContractToCozy Home Intelligence Suite
This documentation provides an in-depth analysis of the intelligence layers, gamification mechanics, and service integrations implemented within the ContractToCozy platform. The suite is designed to transition homeowners from reactive maintenance to proactive property stewardship.

1. The Intelligence Nudge Ecosystem
The "Nudge" is the core unit of engagement, designed to bridge the gap between static property data and actionable home improvement.

Health Nudges & Automated AI Oracle Life-Cycle Trigger
Description: A dynamic feedback loop where the system analyzes the current "Health Score" and triggers life-cycle events.

Functionality: The "AI Oracle" monitors asset aging (e.g., a 12-year-old HVAC) and triggers a nudge to move the asset from "Estimated" to "Verified" status via OCR or photo upload.

Business Value: Increases data high-fidelity, ensuring the platform's advice is based on actual equipment specs rather than generic averages.

Insurance Protection Gap Analysis & Nudge
Description: Cross-references verified inventory assets against the user’s existing InsurancePolicy.

Functionality: If the total value of verified assets exceeds the "Personal Property" coverage limit, a nudge is triggered to suggest a policy review or an increase in coverage.

Business Value: Prevents under-insurance and provides a direct lead-generation path for insurance partners.

Home Equity & ROI Intelligence Nudge
Description: Connects maintenance actions to real-world financial gain.

Functionality: Tracks purchasePriceCents and purchaseDate to calculate appreciation. It highlights "Maintenance Alpha"—the premium added to the home's value due to verified, professional upkeep.

Business Value: Motivates users by reframing maintenance as an investment rather than an expense.

Home Resilience Micro-Task & Nudge Carousel
Description: A specialized category focusing on disaster prevention and property longevity.

Functionality: Uses weather-driven signals (e.g., WEATHER_FORECAST_HEAVY_RAIN) to prompt micro-tasks like checking a sump pump or clearing gutters.

Business Value: Reduces the likelihood of high-cost insurance claims through proactive resilience checks.

2. The Prioritization & Engagement Engine
To prevent "notification fatigue," the platform employs a sophisticated orchestration layer.

Unified Nudge Waterfall & Snooze System
Description: A prioritized queue of tasks that ensures the user is only seeing the most relevant action at any given time.

Nudge Waterfall: Priority is calculated based on:

Immediate Risk: (e.g., Weather alerts).

Financial Impact: (e.g., Expiring warranties or tax renewals).

Data Completion: (e.g., High-priority asset verification).

Snooze Logic: Users can snooze a nudge for 24 hours. The system then "bubbles up" the next highest priority item in the waterfall to maintain engagement.

3. Gamification & Mastery
The gamification layer is built to reward consistency and data accuracy.

Completion Streak & Gamification System
Metrics: Tracks currentStreak, longestStreak, and lastActivityDate.

The Multiplier: Every 3 consecutive tasks completed increases the bonusMultiplier (up to 1.25x), which directly boosts the property's Maintenance Premium score.

UI Feedback: Features a "Streak Flame" and canvas-confetti celebrations for milestones.

Category Mastery & Achievement Badges
Description: Permanent rewards for 100% verification of specific home systems.

Badges: * HVAC Hero: All heating/cooling units verified.

Roof Guardian: Verified roof age and maintenance log.

Safety First: Verified smoke/CO detectors and resilience backups.

Verification: Saved in the unlockedBadges array and displayed in the "Seller's Vault".

4. Predictive Maintenance & Commerce
This layer moves the platform from "Advice" to "Execution."

Maintenance Prediction Engine Logic & UI
The Engine: A weighted decay model that calculates the predictedDate for service based on asset age, manufacturer reliability, and local climateSetting.

Maintenance Forecast UI: A vertical timeline of future tasks.

Data Integrity: Predictions carry a confidenceScore based on whether the source data was manually entered (0.60) or OCR-verified (0.95).

One-Click Pro Booking & Service Log Integration
The Bridge: Maps InventoryItemCategory to ServiceCategory (e.g., HVAC → HVAC_REPAIR).

Pro Info Pack: Automatically injects model and serial numbers into the booking description so the contractor arrives prepared.

Automated Service Log: When a Booking status moves to COMPLETED, the system automatically updates the asset's lastServicedOn date and resets the Maintenance Prediction clock.

5. Reporting: The Seller's Vault
Description: A password-protected, read-only public view of the home's "Proof of Care".

Benefit: Unlike the "Home Score Report" (which identifies gaps), the "Seller's Vault" highlights verified history, badges, and "Maintenance Alpha" to justify premium resale value to Realtors and buyers.




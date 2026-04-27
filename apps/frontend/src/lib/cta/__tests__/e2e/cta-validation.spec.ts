/**
 * E2E Tests for CTA Contract Validation
 * 
 * Tests that CTAs deliver exactly what they promise by validating
 * the complete user journey from card to destination page.
 */

import { test, expect, Page } from '@playwright/test';

// Test data setup
const TEST_PROPERTY_ID = 'test-property-123';
const MOCK_DATA = {
  healthScore: {
    score: 85,
    maintenanceCount: 3,
    weeklyChange: 2.3,
  },
  riskAssessment: {
    totalExposure: 12450,
    coverageRatio: 0.65,
  },
  savings: {
    monthlyPotential: 240,
    annualPotential: 2880,
    opportunityCount: 5,
  },
  urgentAlerts: {
    count: 4,
  },
  coverageGaps: {
    count: 7,
  },
};

test.describe('CTA Promise Validation', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses
    await page.route('**/api/properties/*/health-score', async (route) => {
      await route.fulfill({
        json: MOCK_DATA.healthScore,
      });
    });

    await page.route('**/api/properties/*/risk-assessment', async (route) => {
      await route.fulfill({
        json: MOCK_DATA.riskAssessment,
      });
    });

    await page.route('**/api/properties/*/savings', async (route) => {
      await route.fulfill({
        json: MOCK_DATA.savings,
      });
    });

    await page.route('**/api/resolution-center*', async (route) => {
      const url = new URL(route.request().url());
      const filter = url.searchParams.get('filter');
      const expectedCount = url.searchParams.get('expectedCount');
      
      let items = [];
      if (filter === 'maintenance') {
        items = Array.from({ length: parseInt(expectedCount || '0') }, (_, i) => ({
          id: `maintenance-${i}`,
          type: 'maintenance',
          title: `Maintenance Item ${i + 1}`,
          priority: 'high',
        }));
      } else if (filter === 'urgent') {
        items = Array.from({ length: parseInt(expectedCount || '0') }, (_, i) => ({
          id: `urgent-${i}`,
          type: 'urgent',
          title: `Urgent Alert ${i + 1}`,
          priority: 'critical',
        }));
      }

      await route.fulfill({
        json: { items, count: items.length },
      });
    });

    await page.goto(`/dashboard/properties/${TEST_PROPERTY_ID}`);
  });

  test('Health Score Card - Maintenance Promise', async ({ page }) => {
    // 1. Verify card shows maintenance count
    const maintenanceCount = await page.locator('[data-testid="maintenance-count"]').textContent();
    expect(maintenanceCount).toContain('3 required');

    // 2. Click maintenance CTA
    await page.click('[data-testid="health-score-maintenance-cta"]');

    // 3. Verify navigation to resolution center
    await expect(page).toHaveURL(/\/dashboard\/resolution-center/);

    // 4. Verify URL parameters
    const url = new URL(page.url());
    expect(url.searchParams.get('filter')).toBe('maintenance');
    expect(url.searchParams.get('expectedCount')).toBe('3');
    expect(url.searchParams.get('propertyId')).toBe(TEST_PROPERTY_ID);

    // 5. Verify destination shows exactly 3 maintenance items
    const maintenanceItems = page.locator('[data-testid="maintenance-item"]');
    await expect(maintenanceItems).toHaveCount(3);

    // 6. Verify items are filtered correctly
    for (let i = 0; i < 3; i++) {
      await expect(maintenanceItems.nth(i)).toContainText('Maintenance Item');
    }

    // 7. Verify page shows expected count validation
    await expect(page.locator('[data-testid="item-count-display"]')).toContainText('Showing 3 items');
  });

  test('Risk Score Card - Exposure Amount Promise', async ({ page }) => {
    // 1. Verify card shows exposure amount
    const exposureAmount = await page.locator('[data-testid="exposure-amount"]').textContent();
    expect(exposureAmount).toContain('$12,450');

    // 2. Click exposure CTA
    await page.click('[data-testid="risk-score-exposure-cta"]');

    // 3. Verify navigation to risk assessment
    await expect(page).toHaveURL(/\/dashboard\/properties\/.*\/risk-assessment/);

    // 4. Verify URL parameters
    const url = new URL(page.url());
    expect(url.searchParams.get('focus')).toBe('exposure');
    expect(url.searchParams.get('amount')).toBe('12450');

    // 5. Verify destination shows same exposure amount prominently
    await expect(page.locator('[data-testid="exposure-hero-amount"]')).toContainText('$12,450');

    // 6. Verify exposure section is highlighted/focused
    await expect(page.locator('[data-testid="exposure-section"]')).toHaveClass(/highlighted/);

    // 7. Verify breakdown explains the amount
    const breakdownTotal = await page.locator('[data-testid="exposure-breakdown-total"]').textContent();
    expect(breakdownTotal).toContain('$12,450');
  });

  test('Savings Card - Amount Validation Promise', async ({ page }) => {
    // 1. Verify card shows savings amounts
    const monthlyAmount = await page.locator('[data-testid="monthly-savings"]').textContent();
    const annualAmount = await page.locator('[data-testid="annual-savings"]').textContent();
    expect(monthlyAmount).toContain('$240');
    expect(annualAmount).toContain('$2,880');

    // 2. Click savings CTA
    await page.click('[data-testid="savings-card-cta"]');

    // 3. Verify navigation to savings tool
    await expect(page).toHaveURL(/\/dashboard\/properties\/.*\/tools\/home-savings/);

    // 4. Verify URL parameters
    const url = new URL(page.url());
    expect(url.searchParams.get('expectedMonthly')).toBe('240');
    expect(url.searchParams.get('expectedAnnual')).toBe('2880');
    expect(url.searchParams.get('highlight')).toBe('opportunities');

    // 5. Verify destination shows same amounts
    await expect(page.locator('[data-testid="monthly-savings-hero"]')).toContainText('$240');
    await expect(page.locator('[data-testid="annual-savings-hero"]')).toContainText('$2,880');

    // 6. Verify opportunities are highlighted
    await expect(page.locator('[data-testid="opportunities-section"]')).toHaveClass(/highlighted/);

    // 7. Verify breakdown adds up to expected amounts
    const categoryAmounts = await page.locator('[data-testid="category-amount"]').allTextContents();
    const total = categoryAmounts.reduce((sum, amount) => {
      const num = parseFloat(amount.replace(/[$,]/g, ''));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
    expect(Math.abs(total - 240)).toBeLessThan(1); // Allow for rounding
  });

  test('Sidebar Urgent Alerts - Count and Filter Promise', async ({ page }) => {
    // 1. Navigate to sidebar
    await page.click('[data-testid="sidebar-toggle"]');

    // 2. Verify urgent alerts action shows count
    const urgentAction = page.locator('[data-testid="sidebar-urgent-alerts"]');
    await expect(urgentAction).toContainText('4 urgent issues');

    // 3. Click urgent alerts action
    await urgentAction.click();

    // 4. Verify navigation and parameters
    await expect(page).toHaveURL(/\/dashboard\/resolution-center/);
    const url = new URL(page.url());
    expect(url.searchParams.get('filter')).toBe('urgent');
    expect(url.searchParams.get('sort')).toBe('priority');
    expect(url.searchParams.get('expectedCount')).toBe('4');

    // 5. Verify destination shows exactly 4 urgent items
    const urgentItems = page.locator('[data-testid="urgent-item"]');
    await expect(urgentItems).toHaveCount(4);

    // 6. Verify items are sorted by priority
    const priorities = await page.locator('[data-testid="item-priority"]').allTextContents();
    expect(priorities.every(p => p === 'critical')).toBe(true);
  });

  test('Coverage Gaps - Filter and Highlight Promise', async ({ page }) => {
    // Mock coverage gaps API
    await page.route('**/api/properties/*/coverage-analysis*', async (route) => {
      const url = new URL(route.request().url());
      const filter = url.searchParams.get('filter');
      const expectedCount = url.searchParams.get('expectedCount');
      
      let gaps = [];
      if (filter === 'gaps') {
        gaps = Array.from({ length: parseInt(expectedCount || '0') }, (_, i) => ({
          id: `gap-${i}`,
          type: 'coverage-gap',
          asset: `Asset ${i + 1}`,
          gapAmount: 1000 + (i * 500),
        }));
      }

      await route.fulfill({
        json: { gaps, count: gaps.length },
      });
    });

    // 1. Click coverage gaps from sidebar
    await page.click('[data-testid="sidebar-toggle"]');
    const gapsAction = page.locator('[data-testid="sidebar-coverage-gaps"]');
    await expect(gapsAction).toContainText('7 gaps');
    await gapsAction.click();

    // 2. Verify navigation and parameters
    await expect(page).toHaveURL(/\/dashboard\/properties\/.*\/tools\/coverage-analysis/);
    const url = new URL(page.url());
    expect(url.searchParams.get('filter')).toBe('gaps');
    expect(url.searchParams.get('highlight')).toBe('true');
    expect(url.searchParams.get('expectedCount')).toBe('7');

    // 3. Verify destination shows exactly 7 gaps
    const gapItems = page.locator('[data-testid="coverage-gap"]');
    await expect(gapItems).toHaveCount(7);

    // 4. Verify gaps are highlighted
    for (let i = 0; i < 7; i++) {
      await expect(gapItems.nth(i)).toHaveClass(/highlighted/);
    }

    // 5. Verify filter is applied (no covered items shown)
    const coveredItems = page.locator('[data-testid="covered-item"]');
    await expect(coveredItems).toHaveCount(0);
  });

  test('Weekly Change Trends - View Parameter Promise', async ({ page }) => {
    // Mock trends API
    await page.route('**/api/properties/*/health-score*', async (route) => {
      const url = new URL(route.request().url());
      const view = url.searchParams.get('view');
      
      const response = {
        ...MOCK_DATA.healthScore,
        trends: view === 'trends' ? [
          { week: 1, score: 82.7 },
          { week: 2, score: 84.1 },
          { week: 3, score: 85.0 },
        ] : undefined,
      };

      await route.fulfill({ json: response });
    });

    // 1. Verify card shows weekly change
    const weeklyChange = await page.locator('[data-testid="weekly-change"]').textContent();
    expect(weeklyChange).toContain('+2.3 pts');

    // 2. Click health score CTA (should include view=trends)
    await page.click('[data-testid="health-score-details-cta"]');

    // 3. Verify navigation includes trends view
    await expect(page).toHaveURL(/\/dashboard\/properties\/.*\/health-score/);
    const url = new URL(page.url());
    expect(url.searchParams.get('view')).toBe('trends');

    // 4. Verify trends chart is displayed
    await expect(page.locator('[data-testid="trends-chart"]')).toBeVisible();

    // 5. Verify chart shows weekly data points
    const dataPoints = page.locator('[data-testid="trend-data-point"]');
    await expect(dataPoints).toHaveCount(3);

    // 6. Verify current week shows +2.3 change
    await expect(page.locator('[data-testid="current-week-change"]')).toContainText('+2.3');
  });
});

test.describe('CTA Error Scenarios', () => {
  test('Missing Expected Count - Should Show Warning', async ({ page }) => {
    // Mock API to return different count than expected
    await page.route('**/api/resolution-center*', async (route) => {
      await route.fulfill({
        json: { 
          items: [{ id: '1', title: 'Only One Item' }], 
          count: 1 
        },
      });
    });

    await page.goto(`/dashboard/properties/${TEST_PROPERTY_ID}`);

    // Click maintenance CTA expecting 3 items
    await page.click('[data-testid="health-score-maintenance-cta"]');

    // Should show validation warning
    await expect(page.locator('[data-testid="count-mismatch-warning"]')).toBeVisible();
    await expect(page.locator('[data-testid="count-mismatch-warning"]')).toContainText(
      'Expected 3 items but found 1'
    );
  });

  test('Missing Amount Validation - Should Show Error', async ({ page }) => {
    // Mock API to return different amount
    await page.route('**/api/properties/*/savings', async (route) => {
      await route.fulfill({
        json: { 
          monthlyPotential: 150, // Different from expected 240
          annualPotential: 1800,
        },
      });
    });

    await page.goto(`/dashboard/properties/${TEST_PROPERTY_ID}`);
    await page.click('[data-testid="savings-card-cta"]');

    // Should show amount mismatch error
    await expect(page.locator('[data-testid="amount-mismatch-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="amount-mismatch-error"]')).toContainText(
      'Expected $240 but found $150'
    );
  });

  test('Unsupported Feature - Should Show Fallback', async ({ page }) => {
    await page.goto(`/dashboard/properties/${TEST_PROPERTY_ID}`);
    
    // Navigate to page that doesn't support required feature
    await page.goto(`/dashboard/properties/${TEST_PROPERTY_ID}/health-score?filter=unsupported-feature`);

    // Should show feature not supported message
    await expect(page.locator('[data-testid="feature-not-supported"]')).toBeVisible();
    await expect(page.locator('[data-testid="feature-not-supported"]')).toContainText(
      'This page does not support the requested feature'
    );
  });
});

test.describe('CTA Performance', () => {
  test('Navigation Speed - Should Load Within 2 Seconds', async ({ page }) => {
    await page.goto(`/dashboard/properties/${TEST_PROPERTY_ID}`);

    const startTime = Date.now();
    await page.click('[data-testid="health-score-maintenance-cta"]');
    await page.waitForLoadState('networkidle');
    const endTime = Date.now();

    const loadTime = endTime - startTime;
    expect(loadTime).toBeLessThan(2000); // Should load within 2 seconds
  });

  test('Parameter Preservation - Should Maintain Context Across Navigation', async ({ page }) => {
    await page.goto(`/dashboard/properties/${TEST_PROPERTY_ID}?source=dashboard`);

    // Click CTA
    await page.click('[data-testid="health-score-maintenance-cta"]');

    // Verify source context is preserved
    const url = new URL(page.url());
    expect(url.searchParams.get('source')).toBe('dashboard');
  });
});

// Helper functions for test data validation
async function validateMetricConsistency(page: Page, cardSelector: string, pageSelector: string) {
  const cardValue = await page.locator(cardSelector).textContent();
  const pageValue = await page.locator(pageSelector).textContent();
  
  // Extract numeric values and compare
  const cardNum = parseFloat(cardValue?.replace(/[^0-9.-]/g, '') || '0');
  const pageNum = parseFloat(pageValue?.replace(/[^0-9.-]/g, '') || '0');
  
  expect(Math.abs(cardNum - pageNum)).toBeLessThan(0.01);
}

async function validateUrlParameters(page: Page, expectedParams: Record<string, string>) {
  const url = new URL(page.url());
  
  for (const [key, value] of Object.entries(expectedParams)) {
    expect(url.searchParams.get(key)).toBe(value);
  }
}

async function validateItemCount(page: Page, selector: string, expectedCount: number) {
  const items = page.locator(selector);
  await expect(items).toHaveCount(expectedCount);
}
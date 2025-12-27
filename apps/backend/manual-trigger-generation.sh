#!/bin/bash
# Manual Trigger for Seasonal Checklist Generation
# Use this to test the fix immediately without waiting for cron

set -e

echo "=================================================="
echo "Seasonal Checklist Generation - Manual Trigger"
echo "=================================================="
echo ""

# Check if we're in the right directory
if [ ! -d "apps/workers" ]; then
    echo "❌ Error: Must run from project root directory"
    exit 1
fi

echo "Step 1: Building workers..."
cd apps/workers
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"
echo ""

echo "Step 2: Running generation job manually..."
echo ""

# Run the generation job
node -e "
const { generateSeasonalChecklists } = require('./dist/jobs/seasonalChecklistGeneration.job');
generateSeasonalChecklists()
  .then(() => {
    console.log('');
    console.log('✅ Generation job completed successfully');
    console.log('');
    console.log('Next steps:');
    console.log('1. Check database: SELECT * FROM seasonal_checklists ORDER BY generated_at DESC LIMIT 5;');
    console.log('2. Refresh dashboard at https://contracttocozy.com/dashboard');
    console.log('3. Seasonal card should now show tasks');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Generation job failed:', error);
    process.exit(1);
  });
"

cd ../..

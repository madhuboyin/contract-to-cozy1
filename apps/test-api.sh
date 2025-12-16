#!/bin/bash

# Manual API Testing Script
# Use this to test if backend changes are deployed and working

echo "=================================================="
echo "Community Events API Manual Testing"
echo "=================================================="
echo ""

# Configuration
API_URL="${API_URL:-https://api.contracttocozy.com}"
read -p "Enter your JWT token: " TOKEN
read -p "Enter a property ID to test with: " PROPERTY_ID

echo ""
echo "Testing with:"
echo "  API URL: $API_URL"
echo "  Property ID: $PROPERTY_ID"
echo "  Token: ${TOKEN:0:20}..."
echo ""

# Test 1: Original events endpoint (should still work)
echo "=================================================="
echo "Test 1: Original Events Endpoint"
echo "=================================================="
echo "GET /api/v1/properties/$PROPERTY_ID/community/events?limit=5"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/v1/properties/$PROPERTY_ID/community/events?limit=5")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "Status: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Endpoint works"
    
    # Check if events have category field (new feature)
    if echo "$BODY" | grep -q '"category"'; then
        echo "✅ Events have 'category' field (NEW FEATURE DEPLOYED!)"
        echo ""
        echo "Sample event categories found:"
        echo "$BODY" | grep -o '"category":"[^"]*"' | head -3
    else
        echo "❌ Events do NOT have 'category' field (OLD VERSION)"
    fi
else
    echo "❌ Endpoint failed with status $HTTP_CODE"
    echo "Response: $BODY"
fi

echo ""
sleep 2

# Test 2: Events with category filter (new feature)
echo "=================================================="
echo "Test 2: Category Filter (NEW FEATURE)"
echo "=================================================="
echo "GET /api/v1/properties/$PROPERTY_ID/community/events?category=FARMERS_MARKET"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/v1/properties/$PROPERTY_ID/community/events?category=FARMERS_MARKET")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "Status: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Category filtering works (NEW FEATURE DEPLOYED!)"
    EVENT_COUNT=$(echo "$BODY" | grep -o '"externalId"' | wc -l)
    echo "   Found $EVENT_COUNT Farmers' Market events"
else
    echo "❌ Category filtering failed"
    echo "Response: $BODY"
fi

echo ""
sleep 2

# Test 3: Trash schedule endpoint (new feature)
echo "=================================================="
echo "Test 3: Trash Schedule AI Endpoint (NEW FEATURE)"
echo "=================================================="
echo "GET /api/community/trash-schedule?propertyId=$PROPERTY_ID"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/community/trash-schedule?propertyId=$PROPERTY_ID")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "Status: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Trash schedule endpoint works (NEW FEATURE DEPLOYED!)"
    
    # Check if we got schedules
    if echo "$BODY" | grep -q '"schedules"'; then
        SCHEDULE_COUNT=$(echo "$BODY" | grep -o '"type"' | wc -l)
        echo "   Found $SCHEDULE_COUNT schedule(s)"
        
        # Show schedule types
        echo ""
        echo "   Schedule types found:"
        echo "$BODY" | grep -o '"type":"[^"]*"' | sed 's/"type":"//g' | sed 's/"//g'
    else
        echo "   No schedules found (city may not be supported yet)"
    fi
else
    if [ "$HTTP_CODE" = "404" ]; then
        echo "❌ Endpoint not found (OLD VERSION - feature not deployed)"
    else
        echo "❌ Endpoint failed with status $HTTP_CODE"
    fi
    echo "Response: $BODY"
fi

echo ""
sleep 2

# Test 4: Trash info endpoint (should still work)
echo "=================================================="
echo "Test 4: Trash Info Endpoint (Original)"
echo "=================================================="
echo "GET /api/community/trash?propertyId=$PROPERTY_ID"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/community/trash?propertyId=$PROPERTY_ID")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "Status: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Trash info endpoint works"
    ITEM_COUNT=$(echo "$BODY" | grep -o '"title"' | wc -l)
    echo "   Found $ITEM_COUNT items"
else
    echo "❌ Endpoint failed with status $HTTP_CODE"
fi

echo ""
sleep 2

# Test 5: Alerts endpoint (should still work)
echo "=================================================="
echo "Test 5: Alerts Endpoint (Original)"
echo "=================================================="
echo "GET /api/community/alerts?propertyId=$PROPERTY_ID"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/community/alerts?propertyId=$PROPERTY_ID")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "Status: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Alerts endpoint works"
    ITEM_COUNT=$(echo "$BODY" | grep -o '"title"' | wc -l)
    echo "   Found $ITEM_COUNT alert(s)"
else
    echo "❌ Endpoint failed with status $HTTP_CODE"
fi

echo ""
echo "=================================================="
echo "SUMMARY"
echo "=================================================="
echo ""

# Determine deployment status
NEW_FEATURES=0
if echo "$RESPONSE" | grep -q '"category"'; then
    NEW_FEATURES=$((NEW_FEATURES + 1))
fi

echo "Backend Deployment Status:"
if [ $NEW_FEATURES -gt 0 ]; then
    echo "  ✅ NEW FEATURES DETECTED - Backend is deployed"
    echo ""
    echo "  Working features:"
    echo "  - Event categorization"
    echo "  - Category filtering"
    
    # Check if trash-schedule worked
    TRASH_RESPONSE=$(curl -s \
      -H "Authorization: Bearer $TOKEN" \
      "$API_URL/api/community/trash-schedule?propertyId=$PROPERTY_ID" \
      -w "%{http_code}" -o /dev/null)
    
    if [ "$TRASH_RESPONSE" = "200" ]; then
        echo "  - AI-powered trash schedules"
    fi
else
    echo "  ❌ OLD VERSION - Backend changes NOT deployed"
    echo ""
    echo "  Possible issues:"
    echo "  - Docker image not rebuilt"
    echo "  - Files not copied to correct location"
    echo "  - Kubernetes pod not restarted"
    echo ""
    echo "  Try:"
    echo "  1. Run ./check-files.sh to verify file locations"
    echo "  2. Rebuild Docker image: docker build --no-cache ..."
    echo "  3. Delete pod: kubectl delete pod -n production -l app=api"
fi

echo ""
echo "=================================================="

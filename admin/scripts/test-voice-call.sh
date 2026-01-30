#!/bin/bash
# Voice Call Test Runner
# Usage: ./scripts/test-voice-call.sh [local|prod]

set -e

ENV=${1:-local}

if [ "$ENV" = "prod" ]; then
    BASE_URL="https://kiosk.hio.ai.kr"
else
    BASE_URL="http://localhost:3000"
fi

echo "🧪 Voice Call API Tests"
echo "   Target: $BASE_URL"
echo "=========================================="

SESSION_ID="test-$(date +%s)"

# Test 1: POST signaling message
echo ""
echo "Test 1: POST signaling message"
RESULT=$(curl -s -X POST "$BASE_URL/api/signaling" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"$SESSION_ID\", \"payload\": {\"type\": \"test\"}, \"sender\": \"admin\"}")
if echo "$RESULT" | grep -q "success"; then
    echo "   ✅ PASSED"
else
    echo "   ❌ FAILED: $RESULT"
fi

# Test 2: GET signaling messages (should receive our message)
echo ""
echo "Test 2: GET signaling messages"
RESULT=$(curl -s "$BASE_URL/api/signaling?sessionId=$SESSION_ID&lastId=0&excludeSender=kiosk")
if echo "$RESULT" | grep -q "test"; then
    echo "   ✅ PASSED"
else
    echo "   ❌ FAILED: $RESULT"
fi

# Test 3: Sender exclusion (should NOT receive own message)
echo ""
echo "Test 3: Sender exclusion"
RESULT=$(curl -s "$BASE_URL/api/signaling?sessionId=$SESSION_ID&lastId=0&excludeSender=admin")
if echo "$RESULT" | grep -q '"messages":\[\]' || ! echo "$RESULT" | grep -q "test"; then
    echo "   ✅ PASSED (own messages excluded)"
else
    echo "   ❌ FAILED: Should not receive own messages"
fi

# Test 4: DELETE signaling messages
echo ""
echo "Test 4: DELETE signaling messages"
RESULT=$(curl -s -X DELETE "$BASE_URL/api/signaling" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"$SESSION_ID\"}")
if echo "$RESULT" | grep -q "success"; then
    echo "   ✅ PASSED"
else
    echo "   ❌ FAILED: $RESULT"
fi

# Test 5: Verify deletion
echo ""
echo "Test 5: Verify messages deleted"
RESULT=$(curl -s "$BASE_URL/api/signaling?sessionId=$SESSION_ID&lastId=0")
if echo "$RESULT" | grep -q '"messages":\[\]'; then
    echo "   ✅ PASSED (messages deleted)"
else
    echo "   ❌ FAILED: Messages still exist"
fi

# Test 6: Full signaling flow simulation
echo ""
echo "Test 6: Full Kiosk→Admin signaling flow"
FLOW_SESSION="flow-$(date +%s)"

# Admin sends call-answered
curl -s -X POST "$BASE_URL/api/signaling" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"$FLOW_SESSION\", \"payload\": {\"type\": \"call-answered\"}, \"sender\": \"admin\"}" > /dev/null

# Kiosk receives call-answered
KIOSK_POLL=$(curl -s "$BASE_URL/api/signaling?sessionId=$FLOW_SESSION&lastId=0&excludeSender=kiosk")
if echo "$KIOSK_POLL" | grep -q "call-answered"; then
    echo "   ✅ Kiosk received call-answered"
else
    echo "   ❌ Kiosk did not receive call-answered"
fi

# Kiosk sends offer
curl -s -X POST "$BASE_URL/api/signaling" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"$FLOW_SESSION\", \"payload\": {\"type\": \"offer\", \"sdp\": \"fake-sdp\"}, \"sender\": \"kiosk\"}" > /dev/null

# Admin receives offer
ADMIN_POLL=$(curl -s "$BASE_URL/api/signaling?sessionId=$FLOW_SESSION&lastId=0&excludeSender=admin")
if echo "$ADMIN_POLL" | grep -q "offer"; then
    echo "   ✅ Admin received offer"
else
    echo "   ❌ Admin did not receive offer"
fi

# Admin sends answer
curl -s -X POST "$BASE_URL/api/signaling" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"$FLOW_SESSION\", \"payload\": {\"type\": \"answer\", \"sdp\": \"fake-answer\"}, \"sender\": \"admin\"}" > /dev/null

# Kiosk receives answer
KIOSK_POLL2=$(curl -s "$BASE_URL/api/signaling?sessionId=$FLOW_SESSION&lastId=0&excludeSender=kiosk")
if echo "$KIOSK_POLL2" | grep -q "answer"; then
    echo "   ✅ Kiosk received answer"
    echo "   ✅ Full flow PASSED"
else
    echo "   ❌ Kiosk did not receive answer"
fi

# Cleanup
curl -s -X DELETE "$BASE_URL/api/signaling" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"$FLOW_SESSION\"}" > /dev/null

echo ""
echo "=========================================="
echo "✅ All API tests completed"
echo ""
echo "Next steps for manual testing:"
echo "1. Open Admin: $BASE_URL/dashboard"
echo "2. Open Kiosk: $BASE_URL/kiosk"
echo "3. Test call in both directions"

#!/usr/bin/env bash
# Agora MVP API smoke test

BASE_URL="${AGORA_BASE_URL:-http://localhost:3003}"

echo "=== Agora API Smoke Test ==="

# Test 1: Off-topic check
echo -n "Test 1: Off-topic check (on-topic)... "
RESULT=$(curl -s -X POST "$BASE_URL/api/off-topic-check" \
  -H "Content-Type: application/json" \
  -d '{"question": "How do I improve search ranking for my products?"}')
if echo "$RESULT" | grep -q '"isOffTopic":false'; then
  echo "PASS"
else
  echo "FAIL: $RESULT"
  exit 1
fi

# Test 2: Off-topic check (off-topic)
echo -n "Test 2: Off-topic check (baking)... "
RESULT=$(curl -s -X POST "$BASE_URL/api/off-topic-check" \
  -H "Content-Type: application/json" \
  -d '{"question": "How do I bake a chocolate cake?"}')
if echo "$RESULT" | grep -q '"isOffTopic":true'; then
  echo "PASS"
else
  echo "FAIL: $RESULT"
  exit 1
fi

# Test 3: Session 1-round smoke test
echo -n "Test 3: Session 1-round (SSE streaming)... "
RESULT=$(curl -s -X POST "$BASE_URL/api/session" \
  -H "Content-Type: application/json" \
  -d '{"question": "How do I improve search ranking for my products?", "maxRounds": 1}')
if echo "$RESULT" | grep -q "session_started" && \
   echo "$RESULT" | grep -q "socrates_question" && \
   echo "$RESULT" | grep -q "oracle_answer" && \
   echo "$RESULT" | grep -q "synthesis_update" && \
   echo "$RESULT" | grep -q "session_complete"; then
  echo "PASS"
else
  echo "FAIL: missing events"
  exit 1
fi

echo "=== All tests passed ==="

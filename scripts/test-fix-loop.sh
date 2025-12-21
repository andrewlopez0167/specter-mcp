#!/bin/bash
# Test Fix Loop - Run failed tests only until all pass, then run full suite

set -e

FAILED_TESTS_FILE=".failed-tests"
MAX_ITERATIONS=10

echo "=== Running full test suite to identify failures ==="
npm test 2>&1 | tee /tmp/test-output.log || true

# Extract failed test files
grep -E "FAIL.*\.test\.ts" /tmp/test-output.log | sed 's/.*FAIL //' | sed 's/ \[.*//' | sort -u > "$FAILED_TESTS_FILE"

if [ ! -s "$FAILED_TESTS_FILE" ]; then
  echo "✅ All tests passed on first run!"
  rm -f "$FAILED_TESTS_FILE"
  exit 0
fi

echo ""
echo "=== Failed test files ==="
cat "$FAILED_TESTS_FILE"
echo ""

iteration=1
while [ -s "$FAILED_TESTS_FILE" ] && [ $iteration -le $MAX_ITERATIONS ]; do
  echo "=== Iteration $iteration: Running $(wc -l < "$FAILED_TESTS_FILE" | tr -d ' ') failed test file(s) ==="

  # Run only failed tests
  FAILED_FILES=$(cat "$FAILED_TESTS_FILE" | tr '\n' ' ')
  npm test -- $FAILED_FILES 2>&1 | tee /tmp/test-output.log || true

  # Check for new failures
  grep -E "FAIL.*\.test\.ts" /tmp/test-output.log | sed 's/.*FAIL //' | sed 's/ \[.*//' | sort -u > "${FAILED_TESTS_FILE}.new" || true

  if [ ! -s "${FAILED_TESTS_FILE}.new" ]; then
    echo "✅ All previously failed tests now pass!"
    rm -f "$FAILED_TESTS_FILE" "${FAILED_TESTS_FILE}.new"
    break
  fi

  mv "${FAILED_TESTS_FILE}.new" "$FAILED_TESTS_FILE"
  echo "Still failing: $(cat "$FAILED_TESTS_FILE" | tr '\n' ' ')"
  echo ""

  ((iteration++))
done

if [ -s "$FAILED_TESTS_FILE" ]; then
  echo "❌ Max iterations reached. Still failing:"
  cat "$FAILED_TESTS_FILE"
  exit 1
fi

echo ""
echo "=== Final verification: Running full test suite ==="
npm test

echo "✅ All tests pass!"
rm -f "$FAILED_TESTS_FILE"

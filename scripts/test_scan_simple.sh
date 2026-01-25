#!/bin/bash
# Simple test script to audit repositories - one at a time with immediate status

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"

# Repositories to scan
REPOS=(
    "https://github.com/andreclaro/ssm"
    "https://github.com/stoic-one/ns-auth-sdk"
    "https://github.com/andreclaro/nsauth"
    "https://github.com/AsyncFuncAI/deepwiki-open"
)

echo "=== Security Audit API - Simple Test ==="
echo "API: ${API_BASE_URL}"
echo ""

for repo in "${REPOS[@]}"; do
    repo_name=$(basename "$repo" .git)
    echo "📦 Scanning: ${repo_name}"
    echo "   ${repo}"
    
    # Submit scan
    response=$(curl -s -X POST "${API_BASE_URL}/scan" \
        -H "Content-Type: application/json" \
        -d "{\"repo_url\": \"${repo}\", \"audit_types\": [\"all\"]}")
    
    scan_id=$(echo "$response" | grep -o '"scan_id":"[^"]*' | cut -d'"' -f4)
    
    if [ -z "$scan_id" ]; then
        echo "   ❌ Failed to submit"
        echo "   Response: $response"
        echo ""
        continue
    fi
    
    echo "   ✅ Submitted (ID: ${scan_id})"
    echo "   🔗 Status: ${API_BASE_URL}/scan/${scan_id}/status"
    echo ""
done

echo "=== All scans submitted ==="
echo "Check status manually or wait for completion"

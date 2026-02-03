#!/bin/bash
# Test script to audit multiple repositories via the scan API

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
# Audit types: "all", "sast", "dockerfile", "terraform", "node", "go", "rust"
# Can be comma-separated: "sast,dockerfile,node"
AUDIT_TYPES="${AUDIT_TYPES:-all}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Repositories to scan
declare -a REPOS=(
    "https://github.com/andreclaro/ssm"
    "https://github.com/stoic-one/ns-auth-sdk"
    "https://github.com/andreclaro/nsauth"
    "https://github.com/AsyncFuncAI/deepwiki-open"
)

# Store scan IDs
declare -a SCAN_IDS=()

echo -e "${BLUE}=== Security Audit API Test Script ===${NC}\n"
echo -e "API Base URL: ${API_BASE_URL}"
echo -e "Audit Types: ${AUDIT_TYPES}\n"

# Function to check API health
check_health() {
    echo -e "${BLUE}Checking API health...${NC}"
    if curl -s -f "${API_BASE_URL}/health" > /dev/null; then
        echo -e "${GREEN}✓ API is healthy${NC}\n"
        return 0
    else
        echo -e "${RED}✗ API is not responding${NC}\n"
        return 1
    fi
}

# Function to submit a scan
submit_scan() {
    local repo_url=$1
    local repo_name=$(basename "$repo_url" .git)
    
    echo -e "${YELLOW}Submitting scan for: ${repo_name}${NC}"
    echo -e "  URL: ${repo_url}"
    
    # Convert comma-separated audit types to JSON array
    local audit_array=""
    IFS=',' read -ra TYPES <<< "$AUDIT_TYPES"
    for type in "${TYPES[@]}"; do
        if [ -z "$audit_array" ]; then
            audit_array="\"${type}\""
        else
            audit_array="${audit_array}, \"${type}\""
        fi
    done
    
    local response=$(curl -s -X POST "${API_BASE_URL}/scan" \
        -H "Content-Type: application/json" \
        -d "{
            \"repo_url\": \"${repo_url}\",
            \"audit_types\": [${audit_array}]
        }")
    
    local scan_id=$(echo "$response" | grep -o '"scan_id":"[^"]*' | cut -d'"' -f4)
    
    if [ -z "$scan_id" ]; then
        echo -e "${RED}✗ Failed to submit scan${NC}"
        echo "Response: $response"
        return 1
    fi
    
    echo -e "${GREEN}✓ Scan submitted${NC}"
    echo -e "  Scan ID: ${scan_id}\n"
    SCAN_IDS+=("$scan_id")
    return 0
}

# Function to check scan status
check_status() {
    local scan_id=$1
    local status_response=$(curl -s "${API_BASE_URL}/scan/${scan_id}/status")
    
    # Use Python to parse JSON properly (more reliable than grep)
    # Capture all output to a single line
    local parsed=$(echo "$status_response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    status = data.get('status', 'unknown')
    progress = data.get('progress') or 0
    error = data.get('error') or ''
    if error is None:
        error = ''
    print(f'{status}|{progress}|{error}')
except Exception as e:
    print(f'error|0|Failed to parse: {str(e)}')
" 2>/dev/null)
    
    # Ensure we only get one line
    echo "$parsed" | head -n1
}

# Function to wait for scan completion
wait_for_scan() {
    local scan_id=$1
    local max_wait=${2:-600}  # 10 minutes default
    local wait_time=0
    local check_interval=5
    local last_status=""
    
    echo -e "${BLUE}Waiting for scan ${scan_id} to complete...${NC}"
    
    while [ $wait_time -lt $max_wait ]; do
        local status_info=$(check_status "$scan_id")
        # Take only the first line in case of multiple outputs
        status_info=$(echo "$status_info" | head -n1)
        local status=$(echo "$status_info" | cut -d'|' -f1 | tr -d '[:space:]')
        local progress=$(echo "$status_info" | cut -d'|' -f2 | tr -d '[:space:]')
        local error=$(echo "$status_info" | cut -d'|' -f3)
        
        # Only print if status changed or every 10 seconds
        if [ "$status" != "$last_status" ] || [ $((wait_time % 10)) -eq 0 ]; then
            if [ "$status" = "completed" ]; then
                echo -e "\r${GREEN}✓ Scan completed (${progress}%)${NC}"
                echo ""
                return 0
            elif [ "$status" = "failed" ]; then
                echo -e "\r${RED}✗ Scan failed${NC}"
                if [ -n "$error" ] && [ "$error" != "null" ]; then
                    echo -e "  Error: ${error}${NC}"
                fi
                echo ""
                return 1
            elif [ "$status" = "retrying" ]; then
                echo -e "\r${YELLOW}⏳ Scan retrying... (${progress}%)${NC}    "
            elif [ "$status" = "running" ]; then
                echo -e "\r${BLUE}⏳ Scan running... (${progress}%)${NC}    "
            else
                echo -e "\r${YELLOW}⏳ Scan status: ${status} (${progress}%)${NC}    "
            fi
            last_status="$status"
        fi
        
        sleep $check_interval
        wait_time=$((wait_time + check_interval))
    done
    
    echo -e "\r${RED}✗ Scan timed out after ${max_wait} seconds${NC}"
    echo ""
    return 1
}

# Function to get scan results summary
get_results_summary() {
    local scan_id=$1
    local status_response=$(curl -s "${API_BASE_URL}/scan/${scan_id}/status")
    
    echo "$status_response" | python3 -m json.tool 2>/dev/null || echo "$status_response"
}

# Main execution
main() {
    # Check API health first
    if ! check_health; then
        echo -e "${RED}API is not available. Please start the API server.${NC}"
        exit 1
    fi
    
    # Submit all scans
    echo -e "${BLUE}=== Submitting Scans ===${NC}\n"
    for repo in "${REPOS[@]}"; do
        submit_scan "$repo" || continue
    done
    
    if [ ${#SCAN_IDS[@]} -eq 0 ]; then
        echo -e "${RED}No scans were submitted successfully.${NC}"
        exit 1
    fi
    
    # Wait for all scans to complete
    echo -e "${BLUE}=== Waiting for Scans to Complete ===${NC}\n"
    local success_count=0
    local fail_count=0
    
    for scan_id in "${SCAN_IDS[@]}"; do
        if wait_for_scan "$scan_id"; then
            success_count=$((success_count + 1))
        else
            fail_count=$((fail_count + 1))
        fi
    done
    
    # Print summary
    echo -e "${BLUE}=== Scan Summary ===${NC}\n"
    echo -e "Total scans: ${#SCAN_IDS[@]}"
    echo -e "${GREEN}Successful: ${success_count}${NC}"
    echo -e "${RED}Failed: ${fail_count}${NC}\n"
    
    # Print detailed results
    echo -e "${BLUE}=== Detailed Results ===${NC}\n"
    for scan_id in "${SCAN_IDS[@]}"; do
        local repo_index=0
        for repo in "${REPOS[@]}"; do
            if [ "$repo_index" -lt ${#SCAN_IDS[@]} ]; then
                local current_scan_id="${SCAN_IDS[$repo_index]}"
                if [ "$current_scan_id" = "$scan_id" ]; then
                    local repo_name=$(basename "$repo" .git)
                    echo -e "${BLUE}--- ${repo_name} (${scan_id}) ---${NC}"
                    get_results_summary "$scan_id"
                    echo ""
                    break
                fi
            fi
            repo_index=$((repo_index + 1))
        done
    done
    
    # Print scan IDs for reference
    echo -e "${BLUE}=== Scan IDs (for manual checking) ===${NC}"
    for i in "${!SCAN_IDS[@]}"; do
        local repo_name=$(basename "${REPOS[$i]}" .git)
        echo -e "${repo_name}: ${SCAN_IDS[$i]}"
        echo -e "  Status: ${API_BASE_URL}/scan/${SCAN_IDS[$i]}/status"
    done
    echo ""
}

# Run main function
main

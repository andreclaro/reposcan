#!/bin/bash
# Script to fetch top 50 GitHub repositories by stars and scan them via the API

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"  # Optional: for higher rate limits
AUDIT_TYPES="${AUDIT_TYPES:-all}"
MAX_REPOS="${MAX_REPOS:-50}"
MAX_WAIT="${MAX_WAIT:-1800}"  # 30 minutes default per scan

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Arrays to store repos and scan IDs (parallel arrays for bash 3.2 compatibility)
declare -a REPOS=()
declare -a SCAN_IDS=()
declare -a SCAN_REPO_NAMES=()  # Parallel array to track repo names for each scan

echo -e "${BLUE}=== Top GitHub Repositories Scanner ===${NC}\n"
echo -e "API Base URL: ${API_BASE_URL}"
echo -e "Audit Types: ${AUDIT_TYPES}"
echo -e "Max Repositories: ${MAX_REPOS}\n"

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

# Function to fetch top GitHub repositories
fetch_top_repos() {
    echo -e "${BLUE}Fetching top ${MAX_REPOS} GitHub repositories by stars...${NC}"
    
    # Build GitHub API URL
    local api_url="https://api.github.com/search/repositories?q=stars:>0&sort=stars&order=desc&per_page=${MAX_REPOS}"
    
    # Add authentication header if token is provided
    local auth_header=""
    if [ -n "$GITHUB_TOKEN" ]; then
        auth_header="-H \"Authorization: token ${GITHUB_TOKEN}\""
        echo -e "${CYAN}Using GitHub token for authentication${NC}"
    else
        echo -e "${YELLOW}⚠ No GitHub token provided. Rate limit: 60 requests/hour${NC}"
        echo -e "${YELLOW}   Set GITHUB_TOKEN environment variable for 5000 requests/hour${NC}"
    fi
    
    # Fetch repositories using curl
    local response
    if [ -n "$GITHUB_TOKEN" ]; then
        response=$(curl -s -H "Authorization: token ${GITHUB_TOKEN}" \
            -H "Accept: application/vnd.github.v3+json" \
            "$api_url")
    else
        response=$(curl -s -H "Accept: application/vnd.github.v3+json" \
            "$api_url")
    fi
    
    # Check for API errors
    local error_message=$(echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'message' in data and 'items' not in data:
        print(data.get('message', 'Unknown error'))
    else:
        print('')
except:
    print('Failed to parse response')
" 2>/dev/null)
    
    if [ -n "$error_message" ]; then
        echo -e "${RED}✗ GitHub API error: ${error_message}${NC}"
        return 1
    fi
    
    # Extract repository URLs
    local repo_urls=$(echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    items = data.get('items', [])
    for item in items:
        full_name = item.get('full_name', '')
        stars = item.get('stargazers_count', 0)
        url = item.get('html_url', '')
        if url:
            print(f'{url}|{full_name}|{stars}')
except Exception as e:
    print(f'Error parsing: {str(e)}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null)
    
    if [ -z "$repo_urls" ]; then
        echo -e "${RED}✗ Failed to fetch repositories${NC}"
        return 1
    fi
    
    # Parse and store repository URLs
    local count=0
    while IFS='|' read -r url full_name stars; do
        if [ -n "$url" ]; then
            REPOS+=("$url")
            echo -e "  ${GREEN}✓${NC} ${full_name} (${stars} ⭐)"
            count=$((count + 1))
        fi
    done <<< "$repo_urls"
    
    echo -e "\n${GREEN}✓ Fetched ${count} repositories${NC}\n"
    return 0
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
    
    local scan_id=$(echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('scan_id', ''))
except:
    print('')
" 2>/dev/null)
    
    if [ -z "$scan_id" ]; then
        echo -e "${RED}✗ Failed to submit scan${NC}"
        echo "Response: $response"
        return 1
    fi
    
    echo -e "${GREEN}✓ Scan submitted${NC}"
    echo -e "  Scan ID: ${scan_id}\n"
    SCAN_IDS+=("$scan_id")
    SCAN_REPO_NAMES+=("$repo_name")
    return 0
}

# Function to check scan status
check_status() {
    local scan_id=$1
    local status_response=$(curl -s "${API_BASE_URL}/scan/${scan_id}/status")
    
    # Use Python to parse JSON properly
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
    local repo_name=$2
    local max_wait=${3:-1800}  # 30 minutes default
    local wait_time=0
    local check_interval=5
    local last_status=""
    
    echo -e "${BLUE}Waiting for scan ${scan_id} (${repo_name}) to complete...${NC}"
    
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
    
    # Fetch top repositories
    if ! fetch_top_repos; then
        echo -e "${RED}Failed to fetch repositories from GitHub.${NC}"
        exit 1
    fi
    
    if [ ${#REPOS[@]} -eq 0 ]; then
        echo -e "${RED}No repositories found.${NC}"
        exit 1
    fi
    
    # Submit all scans
    echo -e "${BLUE}=== Submitting Scans ===${NC}\n"
    local submitted=0
    for repo in "${REPOS[@]}"; do
        if submit_scan "$repo"; then
            submitted=$((submitted + 1))
        else
            echo -e "${YELLOW}⚠ Skipping ${repo}${NC}\n"
        fi
        # Small delay to avoid overwhelming the API
        sleep 1
    done
    
    if [ ${#SCAN_IDS[@]} -eq 0 ]; then
        echo -e "${RED}No scans were submitted successfully.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Submitted ${submitted} scans${NC}\n"
    
    # Wait for all scans to complete
    echo -e "${BLUE}=== Waiting for Scans to Complete ===${NC}\n"
    local success_count=0
    local fail_count=0
    local timeout_count=0
    
    # Use parallel arrays - scan_ids and repo_names are kept in sync by index
    local scan_index=0
    for scan_id in "${SCAN_IDS[@]}"; do
        local repo_name="${SCAN_REPO_NAMES[$scan_index]}"
        
        if wait_for_scan "$scan_id" "$repo_name" "$MAX_WAIT"; then
            success_count=$((success_count + 1))
        else
            local wait_result=$?
            if [ $wait_result -eq 1 ]; then
                fail_count=$((fail_count + 1))
            else
                timeout_count=$((timeout_count + 1))
            fi
        fi
        scan_index=$((scan_index + 1))
    done
    
    # Print summary
    echo -e "${BLUE}=== Scan Summary ===${NC}\n"
    echo -e "Total scans: ${#SCAN_IDS[@]}"
    echo -e "${GREEN}Successful: ${success_count}${NC}"
    echo -e "${RED}Failed: ${fail_count}${NC}"
    if [ $timeout_count -gt 0 ]; then
        echo -e "${YELLOW}Timed out: ${timeout_count}${NC}"
    fi
    echo ""
    
    # Print scan IDs for reference
    echo -e "${BLUE}=== Scan IDs (for manual checking) ===${NC}"
    local scan_index=0
    for scan_id in "${SCAN_IDS[@]}"; do
        local repo_name="${SCAN_REPO_NAMES[$scan_index]}"
        echo -e "${repo_name}: ${scan_id}"
        echo -e "  Status: ${API_BASE_URL}/scan/${scan_id}/status"
        scan_index=$((scan_index + 1))
    done
    echo ""
}

# Run main function
main

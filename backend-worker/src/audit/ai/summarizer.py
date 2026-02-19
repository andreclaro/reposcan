"""AI-powered summarizer for security findings."""
import json
from typing import List, Dict, Any

from .models import Finding
from .llm_client import LLMClient, create_llm_client


class AISummarizer:
    """Generate AI summaries and recommendations from security findings."""
    
    def __init__(self, llm_client: LLMClient = None):
        self.llm_client = llm_client or create_llm_client()
    
    async def generate_summary(
        self,
        scan_id: str,
        findings: List[Finding],
        repo_url: str,
        languages: Dict[str, int]
    ) -> Dict[str, Any]:
        """
        Generate AI summary and recommendations.
        
        Args:
            scan_id: Unique scan identifier
            findings: List of normalized findings
            repo_url: Repository URL
            languages: Dictionary of detected languages and file counts
        
        Returns:
            Dictionary with summary, riskScore, topFindings, recommendations, tokensUsed
        """
        if not findings:
            return {
                'summary': "No security findings detected in this scan.",
                'riskScore': 0,
                'topFindings': [],
                'recommendations': [],
                'tokensUsed': 0
            }
        
        # Prepare findings summary for LLM
        findings_text = self._format_findings_for_llm(findings)
        languages_text = ", ".join(f"{lang} ({count} files)" for lang, count in languages.items())
        
        prompt = f"""You are a security expert analyzing a security audit report.

Repository: {repo_url}
Languages: {languages_text}

Findings Summary:
{findings_text}

Please provide:
1. An executive summary (2-3 paragraphs) of the security posture
2. Top 10 most critical findings with specific remediation steps
3. Prioritized recommendations grouped by:
   - Critical/High priority (immediate action)
   - Medium priority (plan for next sprint)
   - Low priority (technical debt)

IMPORTANT: Your response must be valid JSON only. Do not include markdown code blocks, explanations, or any text outside the JSON.

Required JSON format:
{{
  "summary": "Executive summary text...",
  "topFindings": [1, 2, 3],
  "recommendations": [
    {{
      "priority": "critical",
      "action": "Fix SQL injection in user authentication",
      "findingIds": [1, 5],
      "estimatedEffort": "medium"
    }}
  ]
}}

The topFindings array should contain finding numbers (1-indexed) from the Findings Summary above.
"""
        
        try:
            response = await self.llm_client.generate(
                prompt=prompt,
                max_tokens=4000,
                temperature=0.3  # Lower temperature for more consistent analysis
            )
            
            # Parse JSON response
            content = response['content'].strip()
            
            # Try to extract JSON from markdown code blocks first
            json_str = None
            if '```json' in content:
                start = content.find('```json') + 7
                end = content.find('```', start)
                if end > start:
                    json_str = content[start:end].strip()
            elif '```' in content:
                start = content.find('```') + 3
                end = content.find('```', start)
                if end > start:
                    json_str = content[start:end].strip()
            
            # Fallback to finding JSON object boundaries
            if not json_str:
                json_start = content.find('{')
                json_end = content.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    json_str = content[json_start:json_end]
                else:
                    json_str = content
            
            # Parse the JSON
            result = json.loads(json_str)
            
            # Validate and normalize result
            summary = result.get('summary', 'No summary generated.')
            top_findings = [int(f) for f in result.get('topFindings', [])[:10]]
            recommendations = result.get('recommendations', [])
            
            # Validate recommendations structure
            validated_recommendations = []
            for rec in recommendations:
                if isinstance(rec, dict):
                    validated_rec = {
                        'priority': rec.get('priority', 'medium'),
                        'action': rec.get('action', ''),
                        'findingIds': [int(f) for f in rec.get('findingIds', [])],
                        'estimatedEffort': rec.get('estimatedEffort', 'medium')
                    }
                    validated_recommendations.append(validated_rec)
            
            return {
                'summary': summary,
                'topFindings': top_findings,
                'recommendations': validated_recommendations,
                'tokensUsed': response['tokens_used'],
                'model': response['model'],
                'modelVersion': response.get('model_version', 'unknown')
            }
        
        except json.JSONDecodeError as e:
            # Fallback if JSON parsing fails
            return {
                'summary': f"AI analysis completed but response parsing failed: {str(e)}",
                'topFindings': [],
                'recommendations': [],
                'tokensUsed': response.get('tokens_used', 0),
                'model': response.get('model', 'unknown'),
                'modelVersion': response.get('model_version', 'unknown')
            }
        except Exception as e:
            import traceback
            error_msg = f"AI analysis failed: {type(e).__name__}: {str(e)}"
            print(f"[AISummarizer ERROR] {error_msg}")
            print(traceback.format_exc())
            return {
                'summary': error_msg,
                'topFindings': [],
                'recommendations': [],
                'tokensUsed': 0,
                'model': 'unknown',
                'modelVersion': 'unknown'
            }
    
    def _format_findings_for_llm(self, findings: List[Finding], max_tokens: int = 60000) -> str:
        """Format findings for LLM consumption, truncating if needed to fit token limit.
        
        Args:
            findings: List of findings to format
            max_tokens: Maximum tokens to use for findings (default 120k for 128k context models)
        """
        # Priority order: critical > high > medium > low > info
        severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3, 'info': 4}
        
        # Sort by severity priority, then by severity within same level
        sorted_findings = sorted(
            findings,
            key=lambda f: (severity_order.get(f.severity.lower(), 5), f.severity)
        )
        
        lines = []
        total_chars = 0
        max_chars = max_tokens * 4  # Rough estimate: 4 chars per token
        included_count = 0
        
        for i, finding in enumerate(sorted_findings, 1):
            file_info = f"{finding.file_path or 'N/A'}"
            if finding.line_start:
                file_info += f" (lines {finding.line_start}"
                if finding.line_end and finding.line_end != finding.line_start:
                    file_info += f"-{finding.line_end}"
                file_info += ")"
            
            # Truncate long descriptions to save tokens
            description = finding.description or 'N/A'
            if len(description) > 500:
                description = description[:497] + '...'
            
            # Skip redundant fields to save tokens
            finding_text = f"""
Finding #{i}: {finding.title} [{finding.severity}]
File: {file_info}
{description[:150]}{'...' if len(description) > 150 else ''}
"""
            
            # Check if adding this would exceed limit
            if total_chars + len(finding_text) > max_chars and included_count > 0:
                # Add truncation notice
                lines.append(f"\n... {len(sorted_findings) - included_count} more findings truncated to fit context window ...")
                break
            
            lines.append(finding_text)
            total_chars += len(finding_text)
            included_count += 1
        
        return "\n".join(lines)

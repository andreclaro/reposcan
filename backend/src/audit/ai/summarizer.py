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
3. Overall risk score (0-100)
4. Prioritized recommendations grouped by:
   - Critical/High priority (immediate action)
   - Medium priority (plan for next sprint)
   - Low priority (technical debt)

Format your response as JSON:
{{
  "summary": "Executive summary text...",
  "riskScore": 75,
  "topFindings": [1, 2, 3, ...], // Finding IDs (1-indexed from the list above)
  "recommendations": [
    {{
      "priority": "critical",
      "action": "Fix SQL injection in user authentication",
      "findingIds": [1, 5], // 1-indexed finding IDs
      "estimatedEffort": "medium"
    }}
  ]
}}
"""
        
        try:
            response = await self.llm_client.generate(
                prompt=prompt,
                max_tokens=4000,
                temperature=0.3  # Lower temperature for more consistent analysis
            )
            
            # Parse JSON response
            content = response['content']
            
            # Extract JSON from response (handle markdown code blocks)
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = content[json_start:json_end]
                result = json.loads(json_str)
            else:
                # Fallback: try parsing entire content
                result = json.loads(content)
            
            # Validate and normalize result
            summary = result.get('summary', 'No summary generated.')
            risk_score = max(0, min(100, int(result.get('riskScore', 50))))
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
                'riskScore': risk_score,
                'topFindings': top_findings,
                'recommendations': validated_recommendations,
                'tokensUsed': response['tokensUsed'],
                'model': response['model'],
                'modelVersion': response['modelVersion']
            }
        
        except json.JSONDecodeError as e:
            # Fallback if JSON parsing fails
            return {
                'summary': f"AI analysis completed but response parsing failed: {str(e)}\n\nRaw response:\n{response.get('content', '')[:500]}",
                'riskScore': 50,
                'topFindings': [],
                'recommendations': [],
                'tokensUsed': response.get('tokensUsed', 0),
                'model': response.get('model', 'unknown'),
                'modelVersion': response.get('modelVersion', 'unknown')
            }
        except Exception as e:
            return {
                'summary': f"AI analysis failed: {str(e)}",
                'riskScore': 50,
                'topFindings': [],
                'recommendations': [],
                'tokensUsed': 0,
                'model': 'unknown',
                'modelVersion': 'unknown'
            }
    
    def _format_findings_for_llm(self, findings: List[Finding]) -> str:
        """Format findings for LLM consumption."""
        lines = []
        for i, finding in enumerate(findings, 1):
            file_info = f"{finding.file_path or 'N/A'}"
            if finding.line_start:
                file_info += f" (lines {finding.line_start}"
                if finding.line_end and finding.line_end != finding.line_start:
                    file_info += f"-{finding.line_end}"
                file_info += ")"
            
            lines.append(f"""
Finding #{i}:
- Severity: {finding.severity}
- Category: {finding.category or 'N/A'}
- Title: {finding.title}
- File: {file_info}
- Description: {finding.description or 'N/A'}
- CWE: {finding.cwe or 'N/A'}
- CVE: {finding.cve or 'N/A'}
- Scanner: {finding.scanner}
""")
        return "\n".join(lines)

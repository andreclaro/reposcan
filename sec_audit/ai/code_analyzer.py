"""Deep code analysis for security findings."""
from pathlib import Path
from typing import Dict, Any, Optional
import json

from .models import Finding
from .llm_client import LLMClient, create_llm_client


class CodeAnalyzer:
    """Analyze source code context for security vulnerabilities."""
    
    def __init__(self, llm_client: LLMClient = None):
        self.llm_client = llm_client or create_llm_client()
    
    async def analyze_finding(
        self,
        finding: Finding,
        repo_path: Path
    ) -> Dict[str, Any]:
        """
        Analyze source code context for a finding.
        
        Args:
            finding: Finding to analyze
            repo_path: Path to repository root
        
        Returns:
            Dictionary with analysis, exploit_scenario, remediation_code, additional_notes
        """
        if not finding.file_path:
            return {'error': 'No file path for finding'}
        
        file_path = repo_path / finding.file_path
        
        if not file_path.exists():
            return {'error': f'File not found: {finding.file_path}'}
        
        # Read file with context (surrounding lines)
        code_context = self._read_file_with_context(
            file_path,
            finding.line_start,
            finding.line_end,
            context_lines=20
        )
        
        prompt = f"""You are analyzing a security vulnerability in source code.

Finding:
- Severity: {finding.severity}
- Category: {finding.category or 'N/A'}
- Title: {finding.title}
- Description: {finding.description or 'N/A'}
- CWE: {finding.cwe or 'N/A'}
- CVE: {finding.cve or 'N/A'}

Code Context:
```{file_path.suffix.lstrip('.')}
{code_context}
```

Please provide:
1. Detailed analysis of the vulnerability
2. How it could be exploited
3. Specific remediation code (show before/after)
4. Additional security considerations

Format as JSON with fields: analysis, exploit_scenario, remediation_code, additional_notes
"""
        
        try:
            response = await self.llm_client.generate(
                prompt=prompt,
                max_tokens=2000,
                temperature=0.3
            )
            
            content = response['content']
            
            # Extract JSON from response
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = content[json_start:json_end]
                result = json.loads(json_str)
            else:
                # Fallback: try parsing entire content
                result = json.loads(content)
            
            return {
                'analysis': result.get('analysis', ''),
                'exploit_scenario': result.get('exploit_scenario', ''),
                'remediation_code': result.get('remediation_code', ''),
                'additional_notes': result.get('additional_notes', ''),
                'tokensUsed': response['tokensUsed'],
                'model': response['model']
            }
        
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails
            return {
                'analysis': content[:1000] if 'content' in locals() else 'Analysis failed',
                'exploit_scenario': '',
                'remediation_code': '',
                'additional_notes': 'JSON parsing failed',
                'tokensUsed': response.get('tokensUsed', 0),
                'model': response.get('model', 'unknown')
            }
        except Exception as e:
            return {
                'error': f'Code analysis failed: {str(e)}'
            }
    
    def _read_file_with_context(
        self,
        file_path: Path,
        line_start: Optional[int],
        line_end: Optional[int],
        context_lines: int = 20
    ) -> str:
        """Read file with surrounding context lines."""
        try:
            with file_path.open('r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
        except Exception:
            return f"Error reading file: {file_path}"
        
        if not lines:
            return ""
        
        # Calculate context range
        if line_start is None:
            line_start = 1
        if line_end is None:
            line_end = line_start
        
        # Convert to 0-based indexing
        start_idx = max(0, line_start - 1 - context_lines)
        end_idx = min(len(lines), line_end + context_lines)
        
        context = lines[start_idx:end_idx]
        
        # Add line numbers and highlight vulnerable lines
        numbered = []
        for i, line in enumerate(context, start=start_idx + 1):
            # Mark vulnerable lines
            if line_start <= i <= line_end:
                marker = ">>> "
            else:
                marker = "    "
            numbered.append(f"{marker}{i:4d} | {line.rstrip()}")
        
        return "\n".join(numbered)

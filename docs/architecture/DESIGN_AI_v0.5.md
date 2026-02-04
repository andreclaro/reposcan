# Security Audit SaaS - AI-Powered SAST & IaC Analysis (v0.5)

## Executive Summary

This document proposes v0.5 of the AI integration, extending beyond scanner output summarization to **AI-powered static analysis** of source code, Dockerfiles, and infrastructure configurations. The AI acts as a security expert performing SAST (Static Application Security Testing) and IaC (Infrastructure as Code) security reviews.

> **⚠️ AI Code Analysis is a PRO tier feature** - Available only for users on Pro plans and above.

### Key Enhancements in v0.5

1. **AI-Powered Source Code Analysis**: Direct analysis of application logic for OWASP Top 10 vulnerabilities
2. **Dockerfile Security Analysis**: Detection of container security misconfigurations  
3. **Infrastructure Security Analysis**: Terraform, GitHub Actions, Kubernetes manifest reviews
4. **Secret Scanning**: Gitleaks integration for hardcoded credentials detection (ALL tiers)
5. **Unified LLM Client**: Modular support for Anthropic, OpenAI, and Kimi with provider-agnostic interface
6. **Standardized Findings Format**: All AI discoveries use the same normalized format as tool-based findings
7. **Token Limit Management**: Smart chunking and prioritization for large codebases

### Architecture Philosophy

**DRY Principle (Don't Repeat Yourself)**:
- Single LLM client interface for all providers
- Shared prompt templates with provider-specific optimizations
- Unified output normalizer for all analysis types
- Common context gathering utilities

**Tiered Availability**:
- **Free/Basic tiers**: Rule-based scanners + Secret scanning (Gitleaks)
- **Pro tier**: AI-powered analysis with smart file prioritization
- **Enterprise tier**: Full codebase analysis with incremental scanning and caching

**Note**: Secret scanning with Gitleaks is available on **ALL tiers** because hardcoded secrets are the #1 security risk and must be detected for every user.

---

## Enhanced AI Analysis Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI Analysis Service v0.5                             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Unified LLM Client (llm_client.py)                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │  Anthropic  │  │   OpenAI    │  │    Kimi     │  │  (Extensible)│ │   │
│  │  │   Adapter   │  │   Adapter   │  │   Adapter   │  │              │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  │                                                                              │
│  │  Common Interface: analyze(), chat(), structured_output()                   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│           ┌────────────────────────┼────────────────────────┐               │
│           │                        │                        │               │
│  ┌────────▼─────────┐  ┌───────────▼────────────┐  ┌───────▼────────┐      │
│  │  Source Code     │  │   Dockerfile          │  │  Infrastructure │      │
│  │  Analyzer        │  │   Analyzer            │  │  Analyzer       │      │
│  │                  │  │                       │  │                 │      │
│  │  - OWASP Top 10  │  │  - CIS Benchmarks     │  │  - Terraform    │      │
│  │  - Business logic│  │  - Base image risks   │  │  - GitHub Actions│     │
│  │  - Auth flows    │  │  - Secret leakage     │  │  - Kubernetes   │      │
│  │  - Data flow     │  │  - Privilege escal.   │  │  - CloudFormation│     │
│  └────────┬─────────┘  └───────────┬────────────┘  └───────┬────────┘      │
│           │                        │                        │               │
│           └────────────────────────┼────────────────────────┘               │
│                                    │                                         │
│  ┌─────────────────────────────────▼─────────────────────────────────────┐  │
│  │                    Unified Findings Normalizer                         │  │
│  │                                                                        │  │
│  │  All AI findings → Standardized Finding schema → PostgreSQL            │  │
│  │  (Same format as Semgrep, Trivy, etc.)                                 │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Unified LLM Client Architecture

### Design Goals

1. **Provider Agnostic**: Switch between Anthropic, OpenAI, Kimi without changing analyzer code
2. **Structured Output**: Native JSON mode support with schema validation
3. **Retry & Error Handling**: Exponential backoff, rate limit handling
4. **Token Tracking**: Unified cost monitoring across providers
5. **Caching**: Optional response caching for identical prompts

### Code Structure

```python
# backend/src/audit/ai/llm_client.py

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, AsyncGenerator, Dict, List, Optional, Type, TypeVar
import json

class LLMProvider(Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    KIMI = "kimi"

@dataclass
class LLMResponse:
    content: str
    model: str
    usage: Dict[str, int]  # {input_tokens, output_tokens, total_tokens}
    metadata: Dict[str, Any]

@dataclass
class StructuredResponse:
    data: Dict[str, Any]
    model: str
    usage: Dict[str, int]
    raw_content: str  # Original LLM output for debugging

T = TypeVar('T')

class BaseLLMClient(ABC):
    """Abstract base class for LLM providers."""
    
    def __init__(self, api_key: str, model: str, **kwargs):
        self.api_key = api_key
        self.model = model
        self.config = kwargs
    
    @abstractmethod
    async def analyze(
        self, 
        prompt: str, 
        system_prompt: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 4000
    ) -> LLMResponse:
        """Send a single prompt and get response."""
        pass
    
    @abstractmethod
    async def structured_output(
        self,
        prompt: str,
        output_schema: Dict[str, Any],
        system_prompt: Optional[str] = None,
        temperature: float = 0.1
    ) -> StructuredResponse:
        """Get structured JSON output matching schema."""
        pass
    
    @abstractmethod
    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.1,
        max_tokens: int = 4000
    ) -> LLMResponse:
        """Multi-turn conversation."""
        pass

class LLMClientFactory:
    """Factory to create appropriate LLM client based on configuration."""
    
    _providers: Dict[LLMProvider, Type[BaseLLMClient]] = {}
    
    @classmethod
    def register(cls, provider: LLMProvider, client_class: Type[BaseLLMClient]):
        cls._providers[provider] = client_class
    
    @classmethod
    def create(
        cls, 
        provider: LLMProvider, 
        api_key: str, 
        model: Optional[str] = None,
        **kwargs
    ) -> BaseLLMClient:
        if provider not in cls._providers:
            raise ValueError(f"Unknown provider: {provider}")
        
        client_class = cls._providers[provider]
        
        # Default models per provider
        default_models = {
            LLMProvider.ANTHROPIC: "claude-3-sonnet-20240229",
            LLMProvider.OPENAI: "gpt-4o",
            LLMProvider.KIMI: "kimi-k2.5"
        }
        
        model = model or default_models.get(provider)
        return client_class(api_key=api_key, model=model, **kwargs)

# Provider-specific implementations
class AnthropicClient(BaseLLMClient):
    """Anthropic Claude adapter."""
    
    async def analyze(self, prompt: str, system_prompt: Optional[str] = None, 
                     temperature: float = 0.1, max_tokens: int = 4000) -> LLMResponse:
        from anthropic import AsyncAnthropic
        
        client = AsyncAnthropic(api_key=self.api_key)
        
        response = await client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt or "You are a security expert.",
            messages=[{"role": "user", "content": prompt}]
        )
        
        return LLMResponse(
            content=response.content[0].text,
            model=self.model,
            usage={
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
                "total_tokens": response.usage.input_tokens + response.usage.output_tokens
            },
            metadata={}
        )
    
    async def structured_output(
        self, 
        prompt: str, 
        output_schema: Dict[str, Any],
        system_prompt: Optional[str] = None,
        temperature: float = 0.1
    ) -> StructuredResponse:
        # Add schema instruction to system prompt
        schema_instruction = f"""
Respond with valid JSON matching this schema:
{json.dumps(output_schema, indent=2)}

Do not include markdown formatting or explanation. Only output the JSON."""
        
        full_system = f"{system_prompt or ''}\n{schema_instruction}".strip()
        
        response = await self.analyze(
            prompt=prompt,
            system_prompt=full_system,
            temperature=temperature
        )
        
        # Parse and validate JSON
        try:
            data = json.loads(response.content)
            return StructuredResponse(
                data=data,
                model=response.model,
                usage=response.usage,
                raw_content=response.content
            )
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse structured output: {e}")

class OpenAIClient(BaseLLMClient):
    """OpenAI GPT adapter with JSON mode."""
    
    async def analyze(self, prompt: str, system_prompt: Optional[str] = None,
                     temperature: float = 0.1, max_tokens: int = 4000) -> LLMResponse:
        from openai import AsyncOpenAI
        
        client = AsyncOpenAI(api_key=self.api_key)
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        response = await client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens
        )
        
        return LLMResponse(
            content=response.choices[0].message.content,
            model=response.model,
            usage={
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            },
            metadata={}
        )
    
    async def structured_output(
        self,
        prompt: str,
        output_schema: Dict[str, Any],
        system_prompt: Optional[str] = None,
        temperature: float = 0.1
    ) -> StructuredResponse:
        from openai import AsyncOpenAI
        
        client = AsyncOpenAI(api_key=self.api_key)
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        response = await client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        data = json.loads(content)
        
        return StructuredResponse(
            data=data,
            model=response.model,
            usage={
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            },
            raw_content=content
        )

class KimiClient(BaseLLMClient):
    """Moonshot AI Kimi adapter."""
    
    async def analyze(self, prompt: str, system_prompt: Optional[str] = None,
                     temperature: float = 0.1, max_tokens: int = 4000) -> LLMResponse:
        # Kimi uses OpenAI-compatible API
        import httpx
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.moonshot.cn/v1/chat/completions",
                headers=headers,
                json={
                    "model": self.model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens
                }
            )
            response.raise_for_status()
            data = response.json()
        
        return LLMResponse(
            content=data["choices"][0]["message"]["content"],
            model=data["model"],
            usage=data["usage"],
            metadata={}
        )
    
    async def structured_output(self, prompt: str, output_schema: Dict[str, Any],
                               system_prompt: Optional[str] = None,
                               temperature: float = 0.1) -> StructuredResponse:
        schema_instruction = f"""Respond with valid JSON matching this schema:
{json.dumps(output_schema, indent=2)}"""
        
        full_system = f"{system_prompt or ''}\n{schema_instruction}".strip()
        response = await self.analyze(prompt, full_system, temperature)
        
        data = json.loads(response.content)
        return StructuredResponse(
            data=data,
            model=response.model,
            usage=response.usage,
            raw_content=response.content
        )

# Register providers
LLMClientFactory.register(LLMProvider.ANTHROPIC, AnthropicClient)
LLMClientFactory.register(LLMProvider.OPENAI, OpenAIClient)
LLMClientFactory.register(LLMProvider.KIMI, KimiClient)
```

---

## Source Code Security Analyzer

### Purpose
Analyze application source code for OWASP Top 10 vulnerabilities, business logic flaws, and security anti-patterns.

### Supported Languages
- Python
- TypeScript/JavaScript
- Go
- Java
- Rust
- Ruby
- PHP

### Analysis Categories

| Category | OWASP Mapping | Description |
|----------|---------------|-------------|
| Injection | A01 | SQLi, Command Injection, LDAP Injection |
| Broken Auth | A07 | Weak password policies, session management |
| Sensitive Data Exposure | A02 | Hardcoded secrets, weak crypto |
| XXE | A04 | XML External Entity attacks |
| Broken Access Control | A01 | IDOR, privilege escalation |
| Security Misconfiguration | A05 | Debug mode, verbose errors |
| XSS | A03 | Stored, reflected, DOM-based XSS |
| Insecure Deserialization | A08 | Unsafe object deserialization |
| Vulnerable Components | A06 | Known vulnerable dependency usage |
| Insufficient Logging | A09 | Missing security event logging |
| SSRF | A10 | Server-side request forgery |

### Code Structure

```python
# backend/src/audit/ai/analyzers/source_code.py

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional
import re

from ..llm_client import BaseLLMClient
from ..models import AIFinding, AnalysisContext

@dataclass
class SourceFile:
    path: Path
    content: str
    language: str
    relative_path: str

class SourceCodeAnalyzer:
    """AI-powered source code security analysis."""
    
    # File patterns by language
    LANGUAGE_PATTERNS = {
        "python": ["*.py"],
        "javascript": ["*.js", "*.mjs"],
        "typescript": ["*.ts", "*.tsx"],
        "go": ["*.go"],
        "java": ["*.java"],
        "rust": ["*.rs"],
        "ruby": ["*.rb"],
        "php": ["*.php"]
    }
    
    # High-risk file patterns (always analyze)
    HIGH_RISK_PATTERNS = [
        r".*auth.*\.(py|js|ts|go|java|rb|php)$",
        r".*login.*\.(py|js|ts|go|java|rb|php)$",
        r".*password.*\.(py|js|ts|go|java|rb|php)$",
        r".*crypto.*\.(py|js|ts|go|java|rb|php)$",
        r".*secret.*\.(py|js|ts|go|java|rb|php)$",
        r".*config.*\.(py|js|ts|json|yaml|yml)$",
        r".*middleware.*\.(py|js|ts|go|rb)$",
        r"api.*\.(py|js|ts|go|rb|php)$",
        r"routes.*\.(py|js|ts|go|rb|php)$"
    ]
    
    def __init__(self, llm_client: BaseLLMClient):
        self.llm_client = llm_client
        self.max_file_size = 100_000  # 100KB per file
        self.batch_size = 5  # Files per analysis batch
    
    async def analyze_repository(
        self, 
        repo_path: Path,
        languages: List[str],
        context: AnalysisContext
    ) -> List[AIFinding]:
        """Analyze entire repository for security issues."""
        
        findings = []
        
        # Gather source files
        source_files = self._gather_source_files(repo_path, languages)
        
        # Prioritize high-risk files
        prioritized_files = self._prioritize_files(source_files)
        
        # Analyze in batches
        for i in range(0, len(prioritized_files), self.batch_size):
            batch = prioritized_files[i:i + self.batch_size]
            batch_findings = await self._analyze_batch(batch, context)
            findings.extend(batch_findings)
        
        # Analyze cross-file patterns (auth flows, data flow)
        cross_file_findings = await self._analyze_cross_file_patterns(
            prioritized_files, context
        )
        findings.extend(cross_file_findings)
        
        return findings
    
    def _gather_source_files(self, repo_path: Path, languages: List[str]) -> List[SourceFile]:
        """Collect all source files for analysis."""
        files = []
        
        for language in languages:
            if language not in self.LANGUAGE_PATTERNS:
                continue
                
            for pattern in self.LANGUAGE_PATTERNS[language]:
                for file_path in repo_path.rglob(pattern):
                    if file_path.stat().st_size > self.max_file_size:
                        continue
                    
                    try:
                        content = file_path.read_text(encoding='utf-8', errors='ignore')
                        relative = str(file_path.relative_to(repo_path))
                        files.append(SourceFile(
                            path=file_path,
                            content=content,
                            language=language,
                            relative_path=relative
                        ))
                    except Exception:
                        continue
        
        return files
    
    def _prioritize_files(self, files: List[SourceFile]) -> List[SourceFile]:
        """Prioritize high-risk files first."""
        high_risk = []
        normal = []
        
        for f in files:
            if any(re.match(pattern, f.relative_path, re.I) for pattern in self.HIGH_RISK_PATTERNS):
                high_risk.append(f)
            else:
                normal.append(f)
        
        # Limit to prevent token explosion
        return (high_risk[:50] + normal[:50])[:100]
    
    async def _analyze_batch(
        self, 
        files: List[SourceFile],
        context: AnalysisContext
    ) -> List[AIFinding]:
        """Analyze a batch of files."""
        
        # Build prompt with file contents
        files_section = "\n\n".join([
            f"=== File: {f.relative_path} ({f.language}) ===\n```\n{f.content[:5000]}\n```"
            for f in files
        ])
        
        prompt = f"""Analyze these source code files for OWASP Top 10 security vulnerabilities.

Repository: {context.repo_url}
Branch: {context.branch}

{files_section}

Identify security issues including:
1. Injection vulnerabilities (SQL, Command, LDAP)
2. Broken authentication/session management
3. Sensitive data exposure (secrets, weak crypto)
4. Access control flaws (IDOR, privilege escalation)
5. XSS vulnerabilities
6. Insecure deserialization
7. Security misconfigurations
8. SSRF vulnerabilities
9. Hardcoded secrets/API keys
10. Insecure cryptographic implementations

For each finding, provide:
- file_path: Path to the file
- line_start/line_end: Line numbers (if applicable)
- severity: critical/high/medium/low
- category: injection/auth/crypto/secrets/xss/ssrf/config/etc
- title: Brief issue title
- description: Detailed explanation
- remediation: Specific fix with code example
- cwe: Relevant CWE ID (e.g., CWE-89 for SQLi)
- confidence: high/medium/low based on certainty

Return JSON array of findings. If no issues found, return empty array."""

        schema = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string"},
                    "line_start": {"type": ["integer", "null"]},
                    "line_end": {"type": ["integer", "null"]},
                    "severity": {"enum": ["critical", "high", "medium", "low"]},
                    "category": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "remediation": {"type": "string"},
                    "cwe": {"type": ["string", "null"]},
                    "confidence": {"enum": ["high", "medium", "low"]}
                },
                "required": ["file_path", "severity", "category", "title", "description"]
            }
        }
        
        try:
            response = await self.llm_client.structured_output(
                prompt=prompt,
                output_schema=schema,
                system_prompt="You are an expert security code reviewer. Focus on OWASP Top 10 vulnerabilities.",
                temperature=0.1
            )
            
            return [
                AIFinding(
                    scanner="ai-source-analysis",
                    file_path=f.get("file_path"),
                    line_start=f.get("line_start"),
                    line_end=f.get("line_end"),
                    severity=f.get("severity"),
                    category=f.get("category"),
                    title=f.get("title"),
                    description=f.get("description"),
                    remediation=f.get("remediation"),
                    cwe=f.get("cwe"),
                    confidence=f.get("confidence", "medium"),
                    metadata={
                        "analysis_type": "source_code",
                        "ai_model": response.model
                    }
                )
                for f in response.data
            ]
        except Exception as e:
            # Log error but don't fail the scan
            return []
    
    async def _analyze_cross_file_patterns(
        self,
        files: List[SourceFile],
        context: AnalysisContext
    ) -> List[AIFinding]:
        """Analyze patterns across multiple files (auth flows, data flow)."""
        
        # Extract key code signatures for analysis
        auth_files = [f for f in files if 'auth' in f.relative_path.lower()]
        api_files = [f for f in files if any(x in f.relative_path.lower() for x in ['api', 'route', 'controller'])]
        
        if not auth_files or not api_files:
            return []
        
        # Build focused prompt
        auth_summary = "\n".join([f"- {f.relative_path}" for f in auth_files[:5]])
        api_summary = "\n".join([f"- {f.relative_path}" for f in api_files[:5]])
        
        prompt = f"""Analyze authentication flow security across these files:

Authentication Files:
{auth_summary}

API/Route Files:
{api_summary}

Look for:
1. Missing authentication checks on sensitive endpoints
2. Inconsistent authorization patterns
3. Session/token validation gaps
4. Privilege escalation paths
5. Authentication bypass possibilities

Provide findings as JSON array."""

        # Similar schema and processing as _analyze_batch
        # ... implementation ...
        return []
```

---

## Dockerfile Security Analyzer

### Purpose
Analyze Dockerfiles for container security misconfigurations, CIS Docker Benchmark violations, and supply chain risks.

### Analysis Categories

| Category | Severity | Description |
|----------|----------|-------------|
| Root User | High | Running containers as root |
| Latest Tag | Medium | Using `:latest` tag (non-reproducible) |
| Secrets in Layers | Critical | Hardcoded secrets in Dockerfile |
| Privileged Mode | Critical | `--privileged` flag usage |
| Sensitive Mounts | High | Mounting Docker socket, /etc, etc. |
| Base Image Risk | Medium | Vulnerable/outdated base images |
| No Health Check | Low | Missing HEALTHCHECK instruction |
| Exposed Ports | Low | Overly broad port exposure |
| ADD vs COPY | Low | Using ADD with remote URLs |
| No User Directive | Medium | Missing USER instruction |

### Code Structure

```python
# backend/src/audit/ai/analyzers/dockerfile.py

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from ..llm_client import BaseLLMClient
from ..models import AIFinding, AnalysisContext

@dataclass
class DockerfileContext:
    content: str
    path: str
    base_image: Optional[str] = None
    exposed_ports: List[int] = None
    user_directive: Optional[str] = None

class DockerfileAnalyzer:
    """AI-powered Dockerfile security analysis."""
    
    def __init__(self, llm_client: BaseLLMClient):
        self.llm_client = llm_client
    
    async def analyze(
        self, 
        dockerfile_path: Path,
        context: AnalysisContext
    ) -> List[AIFinding]:
        """Analyze a Dockerfile for security issues."""
        
        if not dockerfile_path.exists():
            return []
        
        content = dockerfile_path.read_text(encoding='utf-8', errors='ignore')
        
        # Parse basic context for additional metadata
        df_context = self._parse_dockerfile(content, str(dockerfile_path))
        
        prompt = f"""Analyze this Dockerfile for security misconfigurations:

```dockerfile
{content}
```

Repository: {context.repo_url}

Check for:
1. Running as root (no USER directive or USER root)
2. Using :latest tag (non-reproducible builds)
3. Hardcoded secrets (ENV secrets, ARG secrets)
4. Privileged mode capabilities
5. Dangerous volume mounts (docker.sock, /etc, /proc)
6. Using ADD with remote URLs
7. Missing HEALTHCHECK
8. Overly broad EXPOSE
9. Sensitive files copied (private keys, .env)
10. Package installation without version pinning
11. sudo/su usage
12. Writable root filesystem

For each finding, provide:
- line_start: Line number (if applicable)
- severity: critical/high/medium/low
- category: config/secrets/privilege/supply-chain
- title: Brief issue title
- description: Detailed explanation with CIS benchmark reference if applicable
- remediation: Specific fix with code example
- cwe: Relevant CWE ID if applicable
- confidence: high/medium/low

Return JSON array."""

        schema = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "line_start": {"type": ["integer", "null"]},
                    "severity": {"enum": ["critical", "high", "medium", "low"]},
                    "category": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "remediation": {"type": "string"},
                    "cwe": {"type": ["string", "null"]},
                    "confidence": {"enum": ["high", "medium", "low"]}
                },
                "required": ["severity", "category", "title", "description"]
            }
        }
        
        try:
            response = await self.llm_client.structured_output(
                prompt=prompt,
                output_schema=schema,
                system_prompt="You are a container security expert. Analyze Dockerfiles against CIS Docker Benchmark.",
                temperature=0.1
            )
            
            return [
                AIFinding(
                    scanner="ai-dockerfile-analysis",
                    file_path=str(dockerfile_path),
                    line_start=f.get("line_start"),
                    severity=f.get("severity"),
                    category=f.get("category"),
                    title=f.get("title"),
                    description=f.get("description"),
                    remediation=f.get("remediation"),
                    cwe=f.get("cwe"),
                    confidence=f.get("confidence", "high"),
                    metadata={
                        "analysis_type": "dockerfile",
                        "ai_model": response.model,
                        "base_image": df_context.base_image
                    }
                )
                for f in response.data
            ]
        except Exception:
            return []
    
    def _parse_dockerfile(self, content: str, path: str) -> DockerfileContext:
        """Parse basic Dockerfile metadata."""
        lines = content.split('\n')
        
        base_image = None
        user = None
        ports = []
        
        for i, line in enumerate(lines):
            line = line.strip()
            if line.upper().startswith('FROM '):
                base_image = line[5:].split()[0]
            elif line.upper().startswith('USER '):
                user = line[5:].strip()
            elif line.upper().startswith('EXPOSE '):
                port_str = line[7:].strip()
                try:
                    ports.append(int(port_str.split('/')[0]))
                except ValueError:
                    pass
        
        return DockerfileContext(
            content=content,
            path=path,
            base_image=base_image,
            exposed_ports=ports,
            user_directive=user
        )
```

---

## Infrastructure Security Analyzer

### Purpose
Analyze Infrastructure as Code (IaC) configurations for security misconfigurations, compliance violations, and cloud security risks.

### Supported Formats
- Terraform (.tf, .tfvars)
- GitHub Actions (.github/workflows/*.yml)
- Kubernetes Manifests (*.yaml with Deployments/Services)
- CloudFormation (.yaml/.json)
- Docker Compose (docker-compose.yml)

### Analysis Categories

| Platform | Category | Severity | Description |
|----------|----------|----------|-------------|
| Terraform | Public S3 Bucket | Critical | S3 bucket with public access |
| Terraform | Open Security Group | Critical | 0.0.0.0/0 ingress on sensitive ports |
| Terraform | Unencrypted Storage | High | RDS/EBS/S3 without encryption |
| Terraform | Hardcoded Secrets | Critical | API keys in .tf files |
| GitHub Actions | Secrets in Logs | High | Printing secrets in workflow |
| GitHub Actions | Untrusted Checkout | Medium | PR checkout without persist-credentials: false |
| GitHub Actions | Dangerous Permissions | High | permissions: write-all |
| Kubernetes | Privileged Pod | Critical | privileged: true |
| Kubernetes | Root Container | High | runAsNonRoot: false |
| Kubernetes | Host Network | High | hostNetwork: true |
| Docker Compose | Privileged | Critical | privileged: true |
| Docker Compose | Sensitive Mounts | High | /var/run/docker.sock mount |

### Code Structure

```python
# backend/src/audit/ai/analyzers/infrastructure.py

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional
import yaml

from ..llm_client import BaseLLMClient
from ..models import AIFinding, AnalysisContext

class IaCType(Enum):
    TERRAFORM = "terraform"
    GITHUB_ACTIONS = "github_actions"
    KUBERNETES = "kubernetes"
    CLOUDFORMATION = "cloudformation"
    DOCKER_COMPOSE = "docker_compose"

@dataclass
class IaCFile:
    path: Path
    content: str
    iac_type: IaCType
    relative_path: str

class InfrastructureAnalyzer:
    """AI-powered Infrastructure as Code security analysis."""
    
    FILE_PATTERNS = {
        IaCType.TERRAFORM: ["*.tf", "*.tfvars"],
        IaCType.GITHUB_ACTIONS: [".github/workflows/*.yml", ".github/workflows/*.yaml"],
        IaCType.KUBERNETES: ["*.yaml", "*.yml"],
        IaCType.CLOUDFORMATION: ["*.yaml", "*.yml", "*.json"],
        IaCType.DOCKER_COMPOSE: ["docker-compose.yml", "docker-compose.yaml"]
    }
    
    def __init__(self, llm_client: BaseLLMClient):
        self.llm_client = llm_client
        self.max_file_size = 200_000
    
    async def analyze_repository(
        self,
        repo_path: Path,
        context: AnalysisContext
    ) -> List[AIFinding]:
        """Analyze all IaC files in repository."""
        
        findings = []
        
        # Gather IaC files by type
        iac_files = self._gather_iac_files(repo_path)
        
        # Analyze each type
        for iac_type, files in iac_files.items():
            if not files:
                continue
            
            type_findings = await self._analyze_by_type(iac_type, files, context)
            findings.extend(type_findings)
        
        return findings
    
    def _gather_iac_files(self, repo_path: Path) -> Dict[IaCType, List[IaCFile]]:
        """Collect all IaC files organized by type."""
        
        iac_files: Dict[IaCType, List[IaCFile]] = {t: [] for t in IaCType}
        
        for iac_type, patterns in self.FILE_PATTERNS.items():
            for pattern in patterns:
                for file_path in repo_path.rglob(pattern):
                    if file_path.stat().st_size > self.max_file_size:
                        continue
                    
                    try:
                        content = file_path.read_text(encoding='utf-8', errors='ignore')
                        relative = str(file_path.relative_to(repo_path))
                        
                        # Validate file type (e.g., for Kubernetes, check for 'apiVersion')
                        if self._validate_iac_type(content, iac_type):
                            iac_files[iac_type].append(IaCFile(
                                path=file_path,
                                content=content,
                                iac_type=iac_type,
                                relative_path=relative
                            ))
                    except Exception:
                        continue
        
        return iac_files
    
    def _validate_iac_type(self, content: str, iac_type: IaCType) -> bool:
        """Validate that content matches expected IaC type."""
        
        content_lower = content.lower()
        
        if iac_type == IaCType.TERRAFORM:
            return 'resource ' in content or 'module ' in content or 'provider ' in content
        elif iac_type == IaCType.GITHUB_ACTIONS:
            return 'on:' in content and ('jobs:' in content or 'steps:' in content)
        elif iac_type == IaCType.KUBERNETES:
            return 'apiversion:' in content_lower and 'kind:' in content_lower
        elif iac_type == IaCType.DOCKER_COMPOSE:
            return 'services:' in content_lower
        
        return True
    
    async def _analyze_by_type(
        self,
        iac_type: IaCType,
        files: List[IaCFile],
        context: AnalysisContext
    ) -> List[AIFinding]:
        """Analyze files of a specific IaC type."""
        
        # Build type-specific prompts
        prompts = {
            IaCType.TERRAFORM: self._build_terraform_prompt(files, context),
            IaCType.GITHUB_ACTIONS: self._build_github_actions_prompt(files, context),
            IaCType.KUBERNETES: self._build_kubernetes_prompt(files, context),
            IaCType.DOCKER_COMPOSE: self._build_docker_compose_prompt(files, context),
        }
        
        prompt = prompts.get(iac_type)
        if not prompt:
            return []
        
        schemas = self._get_output_schemas()
        
        try:
            response = await self.llm_client.structured_output(
                prompt=prompt,
                output_schema=schemas["iac_finding"],
                system_prompt=f"You are a cloud security expert specializing in {iac_type.value} security.",
                temperature=0.1
            )
            
            return [
                AIFinding(
                    scanner=f"ai-{iac_type.value}-analysis",
                    file_path=f.get("file_path"),
                    line_start=f.get("line_start"),
                    severity=f.get("severity"),
                    category=f.get("category"),
                    title=f.get("title"),
                    description=f.get("description"),
                    remediation=f.get("remediation"),
                    cwe=f.get("cwe"),
                    confidence=f.get("confidence", "high"),
                    metadata={
                        "analysis_type": iac_type.value,
                        "ai_model": response.model
                    }
                )
                for f in response.data
            ]
        except Exception:
            return []
    
    def _build_terraform_prompt(
        self, 
        files: List[IaCFile],
        context: AnalysisContext
    ) -> str:
        """Build prompt for Terraform analysis."""
        
        files_section = "\n\n".join([
            f"=== File: {f.relative_path} ===\n```hcl\n{f.content[:8000]}\n```"
            for f in files[:5]  # Limit to prevent token explosion
        ])
        
        return f"""Analyze these Terraform configurations for security misconfigurations:

{files_section}

Repository: {context.repo_url}

Focus areas:
1. Public S3 buckets (acl = "public-read" or public access blocks disabled)
2. Open security groups (0.0.0.0/0 on sensitive ports like 22, 3389, 3306, 5432)
3. Unencrypted storage (RDS, EBS, S3 without encryption)
4. Hardcoded secrets in .tf files
5. Overly permissive IAM policies
6. Missing encryption in transit
7. Public RDS instances
8. Lambda functions with excessive permissions
9. CloudTrail/logging disabled
10. Secrets Manager without rotation

Return findings as JSON array with fields: file_path, line_start, severity, category, title, description, remediation, cwe, confidence."""
    
    def _build_github_actions_prompt(
        self,
        files: List[IaCFile],
        context: AnalysisContext
    ) -> str:
        """Build prompt for GitHub Actions analysis."""
        
        files_section = "\n\n".join([
            f"=== File: {f.relative_path} ===\n```yaml\n{f.content[:8000]}\n```"
            for f in files[:5]
        ])
        
        return f"""Analyze these GitHub Actions workflows for security issues:

{files_section}

Repository: {context.repo_url}

Focus areas:
1. Printing secrets in logs (echo $SECRET)
2. Untrusted PR checkout (missing persist-credentials: false)
3. Dangerous permissions (permissions: write-all)
4. Using actions from untrusted sources
5. Missing branch protection on push events
6. Script injection via user input (${{ github.event.pull_request.title }})
7. Self-hosted runner security
8. Missing workflow pin (using @main instead of @sha)
9. Cache poisoning vulnerabilities
10. OIDC token misuse

Return findings as JSON array."""
    
    def _build_kubernetes_prompt(
        self,
        files: List[IaCFile],
        context: AnalysisContext
    ) -> str:
        """Build prompt for Kubernetes analysis."""
        
        files_section = "\n\n".join([
            f"=== File: {f.relative_path} ===\n```yaml\n{f.content[:8000]}\n```"
            for f in files[:5]
        ])
        
        return f"""Analyze these Kubernetes manifests for security issues:

{files_section}

Repository: {context.repo_url}

Focus areas:
1. Privileged containers (privileged: true)
2. Running as root (runAsNonRoot: false or missing)
3. Host namespace sharing (hostNetwork, hostPID, hostIPC)
4. Dangerous volume mounts (docker.sock, /etc, /proc)
5. Overly permissive RBAC
6. Missing resource limits
7. Secrets in environment variables
8. Using :latest tag
9. No network policies
10. Writable root filesystem (readOnlyRootFilesystem: false)

Return findings as JSON array."""
    
    def _build_docker_compose_prompt(
        self,
        files: List[IaCFile],
        context: AnalysisContext
    ) -> str:
        """Build prompt for Docker Compose analysis."""
        
        files_section = "\n\n".join([
            f"=== File: {f.relative_path} ===\n```yaml\n{f.content[:8000]}\n```"
            for f in files[:3]
        ])
        
        return f"""Analyze these Docker Compose files for security issues:

{files_section}

Repository: {context.repo_url}

Focus areas:
1. Privileged mode (privileged: true)
2. Docker socket mounts (/var/run/docker.sock)
3. Sensitive host mounts (/etc, /proc, /root)
4. Hardcoded secrets in environment
5. Exposing sensitive ports
6. No resource limits
7. Running as root (user: root)
8. Network mode host
9. Capabilities added (cap_add)
10. Writable root filesystem

Return findings as JSON array."""
    
    def _get_output_schemas(self) -> Dict[str, any]:
        """Get JSON schemas for structured output."""
        
        return {
            "iac_finding": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "file_path": {"type": "string"},
                        "line_start": {"type": ["integer", "null"]},
                        "severity": {"enum": ["critical", "high", "medium", "low"]},
                        "category": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "remediation": {"type": "string"},
                        "cwe": {"type": ["string", "null"]},
                        "confidence": {"enum": ["high", "medium", "low"]}
                    },
                    "required": ["file_path", "severity", "category", "title", "description"]
                }
            }
        }
```

---

## Unified AI Analysis Orchestrator

### Purpose
Coordinate all AI analyzers, manage context sharing, and consolidate findings into the standardized format.

### Code Structure

```python
# backend/src/audit/ai/orchestrator.py

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional
import os

from .llm_client import BaseLLMClient, LLMClientFactory, LLMProvider
from .analyzers.source_code import SourceCodeAnalyzer
from .analyzers.dockerfile import DockerfileAnalyzer
from .analyzers.infrastructure import InfrastructureAnalyzer
from .models import AIFinding, AnalysisContext

@dataclass
class AIAnalyzerConfig:
    """Configuration for AI analysis."""
    provider: LLMProvider
    api_key: str
    model: Optional[str] = None
    enabled_analyzers: List[str] = None  # ["source", "dockerfile", "infrastructure"]
    max_tokens_per_request: int = 8000
    
    def __post_init__(self):
        if self.enabled_analyzers is None:
            self.enabled_analyzers = ["source", "dockerfile", "infrastructure"]

class AIAnalysisOrchestrator:
    """Orchestrates all AI-powered security analyzers."""
    
    def __init__(self, config: AIAnalyzerConfig):
        self.config = config
        self.llm_client = LLMClientFactory.create(
            provider=config.provider,
            api_key=config.api_key,
            model=config.model
        )
        
        # Initialize analyzers based on configuration
        self.analyzers = {}
        if "source" in config.enabled_analyzers:
            self.analyzers["source"] = SourceCodeAnalyzer(self.llm_client)
        if "dockerfile" in config.enabled_analyzers:
            self.analyzers["dockerfile"] = DockerfileAnalyzer(self.llm_client)
        if "infrastructure" in config.enabled_analyzers:
            self.analyzers["infrastructure"] = InfrastructureAnalyzer(self.llm_client)
    
    async def analyze_repository(
        self,
        repo_path: Path,
        languages: List[str],
        dockerfile_path: Optional[Path] = None,
        context: Optional[AnalysisContext] = None
    ) -> List[AIFinding]:
        """
        Run all enabled AI analyzers on the repository.
        
        Returns findings in standardized format compatible with tool-based findings.
        """
        
        if context is None:
            context = AnalysisContext(
                repo_url="unknown",
                branch="main"
            )
        
        all_findings = []
        
        # Run source code analysis
        if "source" in self.analyzers:
            source_findings = await self.analyzers["source"].analyze_repository(
                repo_path=repo_path,
                languages=languages,
                context=context
            )
            all_findings.extend(source_findings)
        
        # Run Dockerfile analysis
        if "dockerfile" in self.analyzers and dockerfile_path:
            dockerfile_findings = await self.analyzers["dockerfile"].analyze(
                dockerfile_path=dockerfile_path,
                context=context
            )
            all_findings.extend(dockerfile_findings)
        
        # Run infrastructure analysis
        if "infrastructure" in self.analyzers:
            infra_findings = await self.analyzers["infrastructure"].analyze_repository(
                repo_path=repo_path,
                context=context
            )
            all_findings.extend(infra_findings)
        
        # Deduplicate findings (same file + similar title)
        deduplicated = self._deduplicate_findings(all_findings)
        
        return deduplicated
    
    def _deduplicate_findings(self, findings: List[AIFinding]) -> List[AIFinding]:
        """Remove duplicate findings based on file path and title similarity."""
        
        seen = set()
        unique = []
        
        for finding in findings:
            # Create key from file path and normalized title
            title_normalized = finding.title.lower().replace(" ", "")
            key = f"{finding.file_path}:{title_normalized}"
            
            if key not in seen:
                seen.add(key)
                unique.append(finding)
        
        return unique

# Factory function for easy instantiation
def create_ai_orchestrator_from_env() -> Optional[AIAnalysisOrchestrator]:
    """Create AI orchestrator from environment variables."""
    
    # Check if AI analysis is enabled
    if os.getenv("AI_ANALYSIS_ENABLED", "false").lower() != "true":
        return None
    
    # Determine provider
    provider_str = os.getenv("AI_PROVIDER", "anthropic").lower()
    provider_map = {
        "anthropic": LLMProvider.ANTHROPIC,
        "openai": LLMProvider.OPENAI,
        "kimi": LLMProvider.KIMI
    }
    provider = provider_map.get(provider_str, LLMProvider.ANTHROPIC)
    
    # Get API key
    api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("KIMI_API_KEY")
    if not api_key:
        return None
    
    # Get optional model
    model = os.getenv("AI_MODEL")
    
    # Get enabled analyzers
    enabled = os.getenv("AI_ENABLED_ANALYZERS", "source,dockerfile,infrastructure").split(",")
    
    config = AIAnalyzerConfig(
        provider=provider,
        api_key=api_key,
        model=model,
        enabled_analyzers=enabled
    )
    
    return AIAnalysisOrchestrator(config)
```

---

## Shared Models

```python
# backend/src/audit/ai/models.py

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

@dataclass
class AnalysisContext:
    """Context for AI analysis."""
    repo_url: str
    branch: str
    commit_hash: Optional[str] = None
    scan_id: Optional[str] = None

@dataclass
class AIFinding:
    """
    AI-generated security finding.
    Compatible with normalized findings from tool-based scanners.
    """
    scanner: str  # e.g., "ai-source-analysis", "ai-dockerfile-analysis"
    severity: str  # critical, high, medium, low, info
    category: str  # injection, auth, crypto, config, secrets, etc.
    title: str
    description: str
    file_path: Optional[str] = None
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    remediation: Optional[str] = None
    cwe: Optional[str] = None
    confidence: str = "medium"  # high, medium, low
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_db_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database storage."""
        return {
            "scanner": self.scanner,
            "severity": self.severity,
            "category": self.category,
            "title": self.title,
            "description": self.description,
            "file_path": self.file_path,
            "line_start": self.line_start,
            "line_end": self.line_end,
            "remediation": self.remediation,
            "cwe": self.cwe,
            "confidence": self.confidence,
            "metadata": self.metadata
        }
```

---

## Integration with Scan Worker

```python
# tasks/scan_worker.py (additions for v0.5)

from sec_audit.ai.orchestrator import create_ai_orchestrator_from_env

async def run_ai_analysis(
    repo_path: Path,
    languages: List[str],
    dockerfile_path: Optional[Path],
    context: AnalysisContext
) -> List[Dict]:
    """Run AI-powered security analysis."""
    
    orchestrator = create_ai_orchestrator_from_env()
    if not orchestrator:
        return []
    
    findings = await orchestrator.analyze_repository(
        repo_path=repo_path,
        languages=languages,
        dockerfile_path=dockerfile_path,
        context=context
    )
    
    # Convert to database-compatible format
    return [f.to_db_dict() for f in findings]

# In the main scan pipeline:
# After tool-based scans, add:

# Step X: AI Security Analysis
ai_findings = await run_ai_analysis(
    repo_path=repo_path,
    languages=detected_languages,
    dockerfile_path=dockerfile_path,
    context=AnalysisContext(
        repo_url=repo_url,
        branch=branch,
        commit_hash=commit_hash,
        scan_id=scan_id
    )
)

# Combine with tool findings
all_findings = tool_findings + ai_findings

# Store all findings (AI findings use same schema)
await store_findings(conn, scan_id, all_findings)
```

---

## Environment Configuration

```bash
# AI Analysis Configuration
AI_ANALYSIS_ENABLED=true
AI_PROVIDER=anthropic  # anthropic | openai | kimi

# Provider-specific settings
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
KIMI_API_KEY=...

# Optional model override
AI_MODEL=claude-3-sonnet-20240229  # or gpt-4o, kimi-k2.5

# Enable specific analyzers (comma-separated)
AI_ENABLED_ANALYZERS=source,dockerfile,infrastructure

# Cost control
AI_MAX_FILES_PER_ANALYSIS=100
AI_MAX_TOKENS_PER_REQUEST=8000
```

---

## Cost and Performance Considerations

### Token Estimates by Analyzer

| Analyzer | Input Tokens | Output Tokens | Cost (Claude Sonnet) |
|----------|-------------|---------------|---------------------|
| Source Code (per batch of 5 files) | ~10,000 | ~2,000 | ~$0.15 |
| Dockerfile (per file) | ~2,000 | ~500 | ~$0.03 |
| Terraform (per batch) | ~8,000 | ~1,500 | ~$0.12 |
| GitHub Actions (per workflow) | ~3,000 | ~800 | ~$0.05 |

### Optimization Strategies

1. **File Prioritization**: Analyze high-risk files first (auth, crypto, config)
2. **Batch Processing**: Group related files to reduce API calls
3. **Caching**: Cache analysis results for unchanged files
4. **Selective Analysis**: Skip files with no security-relevant patterns
5. **Provider Selection**: Use cheaper models (Sonnet vs Opus) for initial screening

---

## Token Limit Management for Large Codebases

### The Problem

Large repositories (10K+ files, monorepos) cannot be analyzed in a single LLM request:

| Provider | Context Window | Practical Limit |
|----------|---------------|-----------------|
| Claude 3 Opus | 200K tokens | ~150K tokens for prompt |
| Claude 3 Sonnet | 200K tokens | ~150K tokens for prompt |
| GPT-4o | 128K tokens | ~100K tokens for prompt |
| Kimi K2.5 | 256K tokens | ~200K tokens for prompt |

**Example**: A typical Python file = ~500 tokens. 300 files = 150K tokens (at limit).

### Solution Strategy: Multi-Layer Smart Analysis

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Token-Aware Analysis Pipeline                        │
│                                                                         │
│  Layer 1: Security-Critical File Detection (Fast, Rule-based)          │
│  ├── Auth files (login, auth, session, password)                       │
│  ├── API endpoints (routes, controllers, handlers)                     │
│  ├── Input handling (forms, parsers, validators)                       │
│  ├── Crypto (encryption, hashing, signing)                             │
│  ├── Database access (models, queries, ORM)                            │
│  └── Config (secrets, env, credentials)                                │
│  → Priority Score: 100 (Always analyze)                                │
│                                                                         │
│  Layer 2: Semgrep-Flagged Files (Tool-Assisted)                        │
│  ├── Files with existing Semgrep findings                              │
│  ├── Files with suspicious patterns                                    │
│  └── Files importing vulnerable dependencies                           │
│  → Priority Score: 80 (High priority)                                  │
│                                                                         │
│  Layer 3: Recently Modified (Git-Based)                                │
│  ├── Files changed in last commit                                      │
│  └── Files in PR diff                                                  │
│  → Priority Score: 60 (Medium priority)                                │
│                                                                         │
│  Layer 4: Heuristic Scoring (ML/Statistical)                           │
│  ├── File complexity metrics                                           │
│  ├── Import of security-sensitive libraries                            │
│  └── Function/line count                                               │
│  → Priority Score: 40 (Low priority)                                   │
│                                                                         │
│  Analysis Budget (per scan):                                            │
│  ├── Pro tier: 50 files (~$5-10 per scan)                              │
│  ├── Team tier: 100 files (~$10-20 per scan)                           │
│  └── Enterprise: 200 files + incremental (~$20-40 per scan)            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation: Smart File Prioritizer

```python
# backend/src/audit/ai/token_manager.py

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set
import re
import subprocess

@dataclass
class FilePriority:
    path: Path
    priority_score: int  # 0-100
    reason: str
    estimated_tokens: int

class SmartFilePrioritizer:
    """
    Intelligent file prioritization for token-limited AI analysis.
    Ensures most security-critical files are analyzed within budget.
    """
    
    # Security-critical file patterns (highest priority)
    CRITICAL_PATTERNS = [
        (r".*auth.*\.(py|js|ts|go|java|rb|php)$", "authentication"),
        (r".*login.*\.(py|js|ts|go|java|rb|php)$", "login"),
        (r".*password.*\.(py|js|ts|go|java|rb|php)$", "password"),
        (r".*crypto.*\.(py|js|ts|go|java|rb|php)$", "cryptography"),
        (r".*secret.*\.(py|js|ts|go|java|rb|php)$", "secrets"),
        (r".*jwt.*\.(py|js|ts|go|java|rb|php)$", "jwt"),
        (r".*oauth.*\.(py|js|ts|go|java|rb|php)$", "oauth"),
        (r".*session.*\.(py|js|ts|go|java|rb|php)$", "session"),
        (r".*permission.*\.(py|js|ts|go|java|rb|php)$", "permissions"),
        (r".*rbac.*\.(py|js|ts|go|java|rb|php)$", "rbac"),
        (r".*middleware.*\.(py|js|ts|go|rb)$", "middleware"),
        (r".*route.*\.(py|js|ts|go|rb|php)$", "routing"),
        (r".*api.*\.(py|js|ts|go|rb|php)$", "api"),
        (r".*controller.*\.(py|js|ts|java|rb|php)$", "controller"),
        (r".*handler.*\.(py|js|ts|go|java|rb|php)$", "handler"),
        (r".*input.*\.(py|js|ts|go|java|rb|php)$", "input"),
        (r".*form.*\.(py|js|ts|php)$", "forms"),
        (r".*upload.*\.(py|js|ts|go|java|rb|php)$", "file_upload"),
        (r".*sql.*\.(py|js|ts|go|java|rb|php)$", "sql"),
        (r".*query.*\.(py|js|ts|go|java|rb|php)$", "queries"),
        (r".*db.*\.(py|js|ts|go|java|rb|php)$", "database"),
        (r".*model.*\.(py|js|ts|go|java|rb|php)$", "models"),
        (r".*config.*\.(py|js|ts|json|yaml|yml)$", "config"),
        (r".*setting.*\.(py|js|ts|json|yaml|yml)$", "settings"),
        (r".*env.*\.(py|js|ts|yaml|yml)$", "environment"),
        (r".*dockerfile", "dockerfile"),
        (r"docker-compose", "docker_compose"),
        (r"\.github/workflows", "github_actions"),
        (r".*\.tf$", "terraform"),
        (r".*\.tfvars$", "terraform_vars"),
        (r"k8s/.*\.ya?ml$", "kubernetes"),
        (r"manifests/.*\.ya?ml$", "kubernetes"),
    ]
    
    # Security-sensitive imports/patterns (boost priority)
    SECURITY_IMPORTS = {
        "python": [
            "hashlib", "hmac", "secrets", "cryptography", "bcrypt", "passlib",
            "jwt", "authlib", "oauthlib", "requests_oauthlib",
            "sqlalchemy", "psycopg2", "pymongo", "sqlite3",
            "subprocess", "os.system", "eval", "exec", "pickle", "yaml.load",
            "lxml", "xml.etree", "xml.dom",
        ],
        "javascript": [
            "bcrypt", "jsonwebtoken", "passport", "auth0", "aws-sdk",
            "crypto", "tls", "https",
            "mongoose", "sequelize", "typeorm", "prisma",
            "child_process", "eval", "Function",
        ],
        "typescript": [
            "bcrypt", "jsonwebtoken", "passport", "auth0", "aws-sdk",
            "crypto", "tls", "https",
        ],
        "go": [
            "crypto/", "golang.org/x/crypto", "github.com/dgrijalva/jwt-go",
            "database/sql", "gorm.io", "github.com/jinzhu/gorm",
            "os/exec", "syscall", "unsafe",
        ],
    }
    
    def __init__(self, max_files: int = 50, max_tokens_per_file: int = 5000):
        self.max_files = max_files
        self.max_tokens_per_file = max_tokens_per_file
        self.tokens_per_char = 0.25  # Rough estimate: 4 chars = 1 token
    
    def prioritize_files(
        self,
        repo_path: Path,
        languages: List[str],
        semgrep_findings: Optional[Dict[str, List]] = None,
        base_commit: Optional[str] = None
    ) -> List[FilePriority]:
        """
        Prioritize files for AI analysis within token budget.
        
        Returns files sorted by priority (highest first), limited to max_files.
        """
        
        # Gather all source files
        all_files = self._gather_files(repo_path, languages)
        
        # Score each file
        scored_files: Dict[Path, int] = {}
        reasons: Dict[Path, List[str]] = {}
        
        for file_path in all_files:
            score = 0
            file_reasons = []
            
            # Layer 1: Critical file patterns
            critical_score, critical_reason = self._check_critical_patterns(file_path)
            if critical_score > 0:
                score += critical_score
                file_reasons.append(critical_reason)
            
            # Layer 2: Semgrep findings
            if semgrep_findings and str(file_path) in semgrep_findings:
                score += 30
                file_reasons.append("has_semgrep_findings")
            
            # Layer 3: Recently modified
            if base_commit and self._is_recently_modified(repo_path, file_path, base_commit):
                score += 20
                file_reasons.append("recently_modified")
            
            # Layer 4: Security imports
            import_score, import_reason = self._check_security_imports(file_path)
            if import_score > 0:
                score += import_score
                file_reasons.append(import_reason)
            
            if score > 0:
                scored_files[file_path] = score
                reasons[file_path] = file_reasons
        
        # Sort by score descending
        sorted_files = sorted(scored_files.items(), key=lambda x: x[1], reverse=True)
        
        # Build FilePriority objects
        result = []
        for file_path, score in sorted_files[:self.max_files]:
            estimated_tokens = self._estimate_tokens(file_path)
            
            # Skip files that are too large
            if estimated_tokens > self.max_tokens_per_file:
                continue
            
            result.append(FilePriority(
                path=file_path,
                priority_score=score,
                reason=";".join(reasons[file_path]),
                estimated_tokens=estimated_tokens
            ))
        
        return result
    
    def _gather_files(self, repo_path: Path, languages: List[str]) -> List[Path]:
        """Gather all source files."""
        files = []
        
        patterns = {
            "python": ["*.py"],
            "javascript": ["*.js", "*.mjs"],
            "typescript": ["*.ts", "*.tsx"],
            "go": ["*.go"],
            "java": ["*.java"],
            "rust": ["*.rs"],
            "ruby": ["*.rb"],
            "php": ["*.php"],
        }
        
        for lang in languages:
            for pattern in patterns.get(lang, []):
                files.extend(repo_path.rglob(pattern))
        
        return files
    
    def _check_critical_patterns(self, file_path: Path) -> tuple:
        """Check if file matches critical security patterns."""
        path_str = str(file_path).lower()
        
        for pattern, reason in self.CRITICAL_PATTERNS:
            if re.match(pattern, path_str, re.I):
                return (100, reason)
        
        return (0, "")
    
    def _is_recently_modified(self, repo_path: Path, file_path: Path, base_commit: str) -> bool:
        """Check if file was modified since base commit."""
        try:
            result = subprocess.run(
                ["git", "diff", "--name-only", base_commit, "--", str(file_path)],
                cwd=repo_path,
                capture_output=True,
                text=True
            )
            return bool(result.stdout.strip())
        except Exception:
            return False
    
    def _check_security_imports(self, file_path: Path) -> tuple:
        """Check if file imports security-sensitive libraries."""
        
        # Detect language
        ext = file_path.suffix.lower()
        lang = None
        
        if ext == ".py":
            lang = "python"
        elif ext in [".js", ".ts", ".tsx"]:
            lang = "javascript" if ext == ".js" else "typescript"
        elif ext == ".go":
            lang = "go"
        
        if not lang or lang not in self.SECURITY_IMPORTS:
            return (0, "")
        
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')[:5000]
            
            for import_pattern in self.SECURITY_IMPORTS[lang]:
                if import_pattern in content:
                    return (15, f"imports_{import_pattern}")
        except Exception:
            pass
        
        return (0, "")
    
    def _estimate_tokens(self, file_path: Path) -> int:
        """Estimate token count for a file."""
        try:
            size = file_path.stat().st_size
            return int(size * self.tokens_per_char)
        except Exception:
            return 0


class CodeChunker:
    """
    Intelligent code chunking for large files that exceed token limits.
    """
    
    def __init__(self, max_chunk_tokens: int = 4000):
        self.max_chunk_tokens = max_chunk_tokens
        self.tokens_per_char = 0.25
    
    def chunk_file(self, file_path: Path, language: str) -> List[dict]:
        """
        Split a large file into analyzable chunks.
        
        Returns list of chunks with metadata:
        - content: The chunk content
        - start_line: Starting line number
        - end_line: Ending line number
        - is_function: Whether this is a function/method boundary
        """
        
        content = file_path.read_text(encoding='utf-8', errors='ignore')
        lines = content.split('\n')
        
        # If file is small enough, return as single chunk
        estimated_tokens = len(content) * self.tokens_per_char
        if estimated_tokens <= self.max_chunk_tokens:
            return [{
                "content": content,
                "start_line": 1,
                "end_line": len(lines),
                "is_complete_file": True
            }]
        
        # For large files, chunk by functions/classes
        chunks = []
        
        if language == "python":
            chunks = self._chunk_python(content, lines)
        elif language in ["javascript", "typescript"]:
            chunks = self._chunk_js_ts(content, lines)
        elif language == "go":
            chunks = self._chunk_go(content, lines)
        else:
            # Fallback: chunk by line count
            chunks = self._chunk_by_lines(content, lines)
        
        return chunks
    
    def _chunk_python(self, content: str, lines: List[str]) -> List[dict]:
        """Chunk Python files by function/class definitions."""
        chunks = []
        
        # Find function/class boundaries
        pattern = re.compile(r'^(def |class |async def )')
        
        boundaries = [0]  # Start of file
        for i, line in enumerate(lines):
            if pattern.match(line):
                boundaries.append(i)
        boundaries.append(len(lines))  # End of file
        
        # Create chunks at boundaries
        for i in range(len(boundaries) - 1):
            start = boundaries[i]
            end = boundaries[i + 1]
            
            chunk_lines = lines[start:end]
            chunk_content = '\n'.join(chunk_lines)
            
            # Skip if chunk is too small (just whitespace/comments)
            if len(chunk_content.strip()) < 100:
                continue
            
            # If chunk is still too large, split by simpler method
            if len(chunk_content) * self.tokens_per_char > self.max_chunk_tokens:
                sub_chunks = self._chunk_by_lines(chunk_content, chunk_lines, start)
                chunks.extend(sub_chunks)
            else:
                chunks.append({
                    "content": chunk_content,
                    "start_line": start + 1,
                    "end_line": end,
                    "is_function": bool(pattern.match(lines[start]) if start < len(lines) else False)
                })
        
        return chunks
    
    def _chunk_by_lines(self, content: str, lines: List[str], start_offset: int = 0) -> List[dict]:
        """Fallback: chunk by line count."""
        chunks = []
        
        max_lines = int(self.max_chunk_tokens / self.tokens_per_char / 50)  # ~50 chars per line avg
        
        for i in range(0, len(lines), max_lines):
            chunk_lines = lines[i:i + max_lines]
            chunk_content = '\n'.join(chunk_lines)
            
            chunks.append({
                "content": chunk_content,
                "start_line": start_offset + i + 1,
                "end_line": start_offset + min(i + max_lines, len(lines)),
                "is_function": False
            })
        
        return chunks


class AnalysisCache:
    """
    Cache AI analysis results to avoid re-analyzing unchanged files.
    Redis-backed with file content hash as key.
    """
    
    def __init__(self, redis_client, ttl_hours: int = 168):  # 7 days
        self.redis = redis_client
        self.ttl = ttl_hours * 3600
    
    def _get_cache_key(self, repo_url: str, file_path: str, content_hash: str) -> str:
        """Generate cache key from repo, file, and content hash."""
        import hashlib
        key = f"ai_analysis:{repo_url}:{file_path}:{content_hash}"
        return hashlib.sha256(key.encode()).hexdigest()
    
    async def get_cached_analysis(self, repo_url: str, file_path: Path) -> Optional[List[dict]]:
        """Get cached analysis if file hasn't changed."""
        import hashlib
        
        content = file_path.read_bytes()
        content_hash = hashlib.sha256(content).hexdigest()[:16]
        
        cache_key = self._get_cache_key(repo_url, str(file_path), content_hash)
        
        cached = await self.redis.get(cache_key)
        if cached:
            import json
            return json.loads(cached)
        
        return None
    
    async def cache_analysis(
        self,
        repo_url: str,
        file_path: Path,
        findings: List[dict]
    ):
        """Cache analysis results."""
        import hashlib
        import json
        
        content = file_path.read_bytes()
        content_hash = hashlib.sha256(content).hexdigest()[:16]
        
        cache_key = self._get_cache_key(repo_url, str(file_path), content_hash)
        
        await self.redis.setex(
            cache_key,
            self.ttl,
            json.dumps(findings)
        )
```

### Tier-Based Analysis Limits

```python
# backend/src/audit/ai/tier_config.py

from dataclasses import dataclass
from typing import Optional

@dataclass
class TierLimits:
    """AI analysis limits per subscription tier."""
    
    name: str
    max_files_per_scan: int
    max_tokens_per_file: int
    enable_incremental: bool
    enable_caching: bool
    enable_cross_file_analysis: bool
    monthly_ai_scans: Optional[int]  # None = unlimited
    
    # Cost estimates (Claude Sonnet pricing)
    @property
    def estimated_cost_per_scan(self) -> float:
        """Estimated cost per scan in USD."""
        avg_tokens_per_file = 3000  # Input + output
        cost_per_1k_tokens = 0.008  # Sonnet input + output avg
        
        total_tokens = self.max_files_per_scan * avg_tokens_per_file
        return (total_tokens / 1000) * cost_per_1k_tokens

# Tier configurations
TIER_CONFIGS = {
    "free": None,  # No AI analysis
    
    "basic": None,  # No AI analysis
    
    "pro": TierLimits(
        name="Pro",
        max_files_per_scan=50,
        max_tokens_per_file=5000,
        enable_incremental=False,
        enable_caching=True,
        enable_cross_file_analysis=False,
        monthly_ai_scans=100,
        estimated_cost_per_scan=1.20
    ),
    
    "team": TierLimits(
        name="Team",
        max_files_per_scan=100,
        max_tokens_per_file=8000,
        enable_incremental=True,
        enable_caching=True,
        enable_cross_file_analysis=True,
        monthly_ai_scans=500,
        estimated_cost_per_scan=2.40
    ),
    
    "enterprise": TierLimits(
        name="Enterprise",
        max_files_per_scan=200,
        max_tokens_per_file=12000,
        enable_incremental=True,
        enable_caching=True,
        enable_cross_file_analysis=True,
        monthly_ai_scans=None,  # Unlimited
        estimated_cost_per_scan=4.80
    )
}

def get_tier_config(tier: str) -> Optional[TierLimits]:
    """Get AI analysis limits for a subscription tier."""
    return TIER_CONFIGS.get(tier.lower())
```

### Usage in Scan Worker

```python
# tasks/scan_worker.py (updated for token management)

async def run_ai_analysis(
    repo_path: Path,
    languages: List[str],
    dockerfile_path: Optional[Path],
    context: AnalysisContext,
    user_tier: str = "free",
    semgrep_results: Optional[Dict] = None
) -> List[Dict]:
    """
    Run AI-powered security analysis with tier-aware limits.
    """
    
    # Check if user has AI access
    tier_config = get_tier_config(user_tier)
    if not tier_config:
        return []  # AI not available for this tier
    
    # Initialize components
    llm_client = create_llm_client_from_env()
    prioritizer = SmartFilePrioritizer(
        max_files=tier_config.max_files_per_scan,
        max_tokens_per_file=tier_config.max_tokens_per_file
    )
    chunker = CodeChunker(max_chunk_tokens=4000)
    cache = AnalysisCache(redis_client) if tier_config.enable_caching else None
    
    # Get prioritized files
    prioritized = prioritizer.prioritize_files(
        repo_path=repo_path,
        languages=languages,
        semgrep_findings=semgrep_results.get("findings_by_file") if semgrep_results else None,
        base_commit=context.commit_hash
    )
    
    findings = []
    
    for file_priority in prioritized:
        # Check cache first
        if cache and tier_config.enable_caching:
            cached = await cache.get_cached_analysis(context.repo_url, file_priority.path)
            if cached:
                findings.extend(cached)
                continue
        
        # Chunk file if too large
        file_findings = []
        
        if file_priority.estimated_tokens > tier_config.max_tokens_per_file:
            # File needs chunking
            chunks = chunker.chunk_file(file_priority.path, detect_language(file_priority.path))
            
            for chunk in chunks:
                chunk_findings = await analyze_code_chunk(
                    llm_client=llm_client,
                    file_path=file_priority.path,
                    chunk=chunk,
                    context=context
                )
                file_findings.extend(chunk_findings)
        else:
            # Analyze whole file
            file_findings = await analyze_whole_file(
                llm_client=llm_client,
                file_path=file_priority.path,
                context=context
            )
        
        # Cache results
        if cache and tier_config.enable_caching:
            await cache.cache_analysis(context.repo_url, file_priority.path, file_findings)
        
        findings.extend(file_findings)
    
    return findings
```

### Key Benefits of This Approach

| Challenge | Solution | Benefit |
|-----------|----------|---------|
| Token limits | Smart prioritization + chunking | Analyze 50-200 most critical files vs. failing on large repos |
| Cost control | Tier-based limits + caching | Predictable costs, $1-5 per scan |
| Speed | Caching + incremental | Re-analyze only changed files |
| Quality | Security-first prioritization | Auth, crypto, input handling always analyzed |
| Scalability | Chunking large files | Handle files of any size |

---

## Secret Scanning with Gitleaks

### Overview

Hardcoded secrets (API keys, passwords, tokens) are the **#1 cause of security breaches**. While AI analysis can find some secrets, dedicated secret scanning tools are faster, more accurate, and essential for every scan tier.

### Why Gitleaks?

| Feature | Gitleaks | Alternative (TruffleHog) |
|---------|----------|-------------------------|
| Speed | Very fast | Slower (deep git history) |
| False Positives | Low | Higher |
| Configurability | Highly configurable | Good |
| License | MIT | AGPL (copyleft) |
| Integration | Simple CLI | More complex |

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Secret Scanning Pipeline                     │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Gitleaks  │───→│   Parser    │───→│  Findings DB        │ │
│  │   Scanner   │    │  (JSON)     │    │  (secrets category) │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
│         │                                                        │
│         └─→ Detects: API keys, passwords, tokens, private keys   │
│                                                                  │
│  Scans: Entire repo + Git history (if enabled)                   │
│  Available: ALL tiers (Free, Basic, Pro, Team, Enterprise)       │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation

```python
# backend/src/audit/scanners.py (addition)

import subprocess
import json
from pathlib import Path
from typing import List, Dict, Optional

async def run_gitleaks_scan(
    repo_path: Path,
    scan_id: str,
    scan_history: bool = False
) -> List[Dict]:
    """
    Run gitleaks secret detection scan.
    
    Args:
        repo_path: Path to cloned repository
        scan_id: Unique scan identifier
        scan_history: Whether to scan full git history (slower)
    
    Returns:
        List of secret findings in normalized format
    """
    
    output_file = repo_path / f"gitleaks_{scan_id}.json"
    
    cmd = [
        "gitleaks",
        "detect",
        "--source", str(repo_path),
        "--report-format", "json",
        "--report-path", str(output_file),
        "--no-banner",
        "--verbose"
    ]
    
    # Scan git history for deeper detection (optional, slower)
    if scan_history:
        cmd.append("--log-opts")
        cmd.append("--all")  # Scan all commits
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        # gitleaks returns exit code 1 when secrets found (expected)
        if result.returncode not in [0, 1]:
            raise RuntimeError(f"Gitleaks failed: {result.stderr}")
        
        # Parse results
        if not output_file.exists():
            return []
        
        with open(output_file) as f:
            data = json.load(f)
        
        findings = []
        for item in data:
            finding = {
                "scanner": "gitleaks",
                "severity": _classify_secret_severity(item),
                "category": "secrets",
                "title": f"Hardcoded {item.get('Description', 'Secret')}",
                "description": _build_secret_description(item),
                "file_path": item.get("File"),
                "line_start": item.get("StartLine"),
                "line_end": item.get("EndLine"),
                "cwe": "CWE-798",  # Use of Hard-coded Credentials
                "confidence": "high",
                "metadata": {
                    "rule_id": item.get("RuleID"),
                    "secret_type": item.get("Tags", []),
                    "commit": item.get("Commit"),
                    "author": item.get("Author"),
                    "email": item.get("Email"),
                    "date": item.get("Date"),
                    # NEVER store the actual secret
                    "fingerprint": item.get("Fingerprint")
                }
            }
            findings.append(finding)
        
        return findings
        
    except subprocess.TimeoutExpired:
        return [{"error": "Gitleaks scan timed out"}]
    except Exception as e:
        return [{"error": f"Gitleaks scan failed: {str(e)}"}]


def _classify_secret_severity(item: Dict) -> str:
    """Classify severity based on secret type."""
    
    description = item.get("Description", "").lower()
    tags = [t.lower() for t in item.get("Tags", [])]
    
    # Critical: Cloud provider keys, private keys
    critical_patterns = [
        "aws", "azure", "gcp", "google cloud",
        "private key", "rsa private", "ssh private",
        "github token", "gitlab token"
    ]
    
    for pattern in critical_patterns:
        if pattern in description or any(pattern in t for t in tags):
            return "critical"
    
    # High: API keys, database passwords
    high_patterns = [
        "api key", "apikey", "api_secret",
        "database", "db_password", "postgres", "mysql",
        "slack token", "discord token"
    ]
    
    for pattern in high_patterns:
        if pattern in description or any(pattern in t for t in tags):
            return "high"
    
    # Medium: Other secrets
    return "medium"


def _build_secret_description(item: Dict) -> str:
    """Build human-readable description."""
    
    secret_type = item.get("Description", "Secret")
    file_path = item.get("File", "unknown")
    line = item.get("StartLine", "?")
    commit = item.get("Commit", "current")
    
    description = f"""Detected hardcoded {secret_type} in {file_path} (line {line}).

**Risk**: Hardcoded credentials can be exposed through:
- Source code leaks
- Repository forks
- CI/CD logs
- Developer machine compromises

**Recommendation**:
1. Immediately revoke the exposed credential
2. Generate new credentials
3. Store secrets in environment variables or a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
4. Use tools like git-secrets or pre-commit hooks to prevent future commits

**Commit**: {commit[:8] if commit != 'current' else 'working directory'}"""
    
    return description


# Gitleaks configuration file (optional, for customization)
GITLEAKS_CONFIG = """
# Custom gitleaks rules for additional secret detection
title = "Custom Secret Detection"

[[rules]]
id = "custom-api-key"
description = "Custom API Key Pattern"
regex = '''(?i)(api[_-]?key\s*[=:]\s*)['\"][a-zA-Z0-9_\-]{20,}['\"]'''
tags = ["apikey", "custom"]

[[rules]]
id = "internal-token"
description = "Internal Service Token"
regex = '''(?i)(internal[_-]?token\s*[=:]\s*)['\"][a-f0-9]{32,}['\"]'''
tags = ["token", "internal"]
"""
```

### Secret Types Detected

| Category | Examples | Severity |
|----------|----------|----------|
| **Cloud Provider** | AWS Access Key, Azure Key, GCP Service Account | Critical |
| **Version Control** | GitHub Token, GitLab Token, Bitbucket Token | Critical |
| **Private Keys** | RSA Private Key, SSH Key, PEM files | Critical |
| **Database** | PostgreSQL URI, MySQL Password, MongoDB URI | High |
| **API Keys** | Generic API keys, Slack tokens, Discord tokens | High |
| **Credentials** | Basic Auth in URLs, Hardcoded passwords | High |
| **Certificates** | .p12 files, .pfx files, certificate data | Medium |

### Scanning Strategy by Tier

| Tier | Secret Scanning | Git History | Notes |
|------|-----------------|-------------|-------|
| **Free** | ✅ Current files only | ❌ | Fast, catches recent secrets |
| **Basic** | ✅ Current files only | ❌ | Same as Free |
| **Pro** | ✅ Current files | ✅ Last 10 commits | Deeper scan for recent history |
| **Team** | ✅ Current files | ✅ Full history | Complete repository audit |
| **Enterprise** | ✅ Current files | ✅ Full history | Complete audit + custom rules |

### Integration with AI Analysis

Secret scanning findings are used to **boost AI analysis priority**:

```python
# In SmartFilePrioritizer:

async def prioritize_files(self, repo_path: Path, ...):
    # ... existing prioritization logic ...
    
    # Boost priority for files with secrets
    gitleaks_findings = await run_gitleaks_scan(repo_path, scan_id)
    
    for finding in gitleaks_findings:
        file_path = repo_path / finding["file_path"]
        if file_path in scored_files:
            scored_files[file_path] += 50  # High boost for secret-containing files
            reasons[file_path].append("contains_hardcoded_secrets")
    
    # This ensures files with secrets get AI analysis attention
```

### Docker Installation

```dockerfile
# Dockerfile (add gitleaks to scanner image)

# Install gitleaks
ARG GITLEAKS_VERSION=8.18.2
RUN curl -L -o gitleaks.tar.gz \
    https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz && \
    tar -xzf gitleaks.tar.gz -C /usr/local/bin gitleaks && \
    rm gitleaks.tar.gz && \
    chmod +x /usr/local/bin/gitleaks

# Verify installation
RUN gitleaks version
```

### Environment Variables

```bash
# Enable/disable secret scanning
SECRET_SCANNING_ENABLED=true

# Enable git history scanning (more thorough but slower)
SECRET_SCAN_HISTORY=false  # Set to true for Team/Enterprise tiers

# Custom config path (optional)
GITLEAKS_CONFIG_PATH=/config/gitleaks.toml
```

---

## Implementation Phases

### Phase 0: Secret Scanning (Priority - Week 0)
- [ ] Install gitleaks in Docker image
- [ ] Implement `run_gitleaks_scan()` function
- [ ] Create parser for gitleaks JSON output
- [ ] Add secret findings to database schema
- [ ] Integrate with scan worker (ALL tiers)
- [ ] Test with repositories containing secrets
- [ ] Add secret scanning to UI findings display

### Phase 1: Core Infrastructure (Week 1)
- [ ] Implement unified LLM client with factory pattern
- [ ] Create Anthropic, OpenAI, Kimi adapters
- [ ] Define shared models (AIFinding, AnalysisContext)
- [ ] Add environment configuration

### Phase 2: Source Code Analyzer (Week 2)
- [ ] Implement SourceCodeAnalyzer
- [ ] File gathering and prioritization logic
- [ ] OWASP-focused prompts
- [ ] Batch processing with token limits
- [ ] Integrate gitleaks findings for priority boost

### Phase 3: Dockerfile Analyzer (Week 3)
- [ ] Implement DockerfileAnalyzer
- [ ] CIS Benchmark-aligned prompts
- [ ] Dockerfile parsing utilities

### Phase 4: Infrastructure Analyzer (Week 4)
- [ ] Implement InfrastructureAnalyzer
- [ ] Terraform, GitHub Actions, Kubernetes support
- [ ] Platform-specific security checks

### Phase 5: Integration & Testing (Week 5)
- [ ] Create AIAnalysisOrchestrator
- [ ] Integrate with scan worker
- [ ] Add deduplication logic
- [ ] Test with real repositories
- [ ] Performance optimization

---

## Security Considerations

1. **API Key Management**: Store provider API keys in environment variables, rotate regularly
2. **Code Privacy**: For sensitive repositories, document that code is sent to external APIs
3. **Data Retention**: Configure provider data retention policies (Anthropic doesn't train on API data)
4. **Rate Limiting**: Implement rate limiting to prevent abuse and control costs
5. **Prompt Injection**: Sanitize file contents to prevent prompt injection attacks
6. **Tier Enforcement**: Strictly enforce tier-based limits in API layer, not just UI

### Tier Enforcement Implementation

```python
# backend/src/api/dependencies.py

from fastapi import HTTPException, Depends
from typing import Optional

async def require_ai_access(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> TierLimits:
    """
    Dependency to enforce AI analysis tier access.
    
    Usage:
        @router.post("/scan")
        async def create_scan(
            ...,
            tier_config: TierLimits = Depends(require_ai_access)
        ):
            # User has AI access, tier_config contains their limits
            pass
    """
    
    tier_config = get_tier_config(user.subscription_tier)
    
    if not tier_config:
        raise HTTPException(
            status_code=403,
            detail="AI analysis is not available on your current plan. Upgrade to Pro to enable AI-powered security analysis."
        )
    
    # Check monthly scan limit
    if tier_config.monthly_ai_scans is not None:
        scans_this_month = await get_ai_scan_count(db, user.id, this_month=True)
        if scans_this_month >= tier_config.monthly_ai_scans:
            raise HTTPException(
                status_code=429,
                detail=f"Monthly AI analysis limit reached ({tier_config.monthly_ai_scans} scans). Upgrade your plan or wait until next month."
            )
    
    return tier_config
```

---

## Monitoring and Observability

```python
# Metrics to track
ai_analysis_metrics = {
    "tokens_used_by_provider": Counter,
    "analysis_duration_by_type": Histogram,
    "findings_generated_by_analyzer": Counter,
    "api_errors_by_provider": Counter,
    "cost_per_scan": Gauge
}
```

---

**Document Version:** 0.5  
**Last Updated:** 2026-02-04  
**Author:** Architecture Team  
**Related Documents:** 
- DESIGN_v0.md (Base Architecture)
- DESIGN_v0-AI.md (Original AI Integration)

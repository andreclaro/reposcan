"""LLM client abstraction supporting multiple providers."""
import os
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

try:
    from openai import OpenAI
    import httpx  # openai depends on it; used for Kimi to avoid proxies kwarg issue
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    httpx = None


class LLMClient(ABC):
    """Abstract base class for LLM clients."""
    
    @abstractmethod
    async def generate(
        self,
        prompt: str,
        max_tokens: int = 4000,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """
        Generate a response from the LLM.
        
        Args:
            prompt: Input prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
        
        Returns:
            Dictionary with 'content', 'tokens_used', 'model', 'model_version'
        """
        pass


class AnthropicClient(LLMClient):
    """Anthropic Claude client."""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "claude-3-opus-20240229"):
        if not ANTHROPIC_AVAILABLE:
            raise ImportError("anthropic package not installed. Install with: pip install anthropic")
        
        self.client = Anthropic(api_key=api_key or os.getenv("ANTHROPIC_API_KEY"))
        self.model = model
        self.model_version = "2024-02-29"  # API version
    
    async def generate(
        self,
        prompt: str,
        max_tokens: int = 4000,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """Generate response using Anthropic Claude."""
        import asyncio
        
        # Anthropic SDK is synchronous, run in thread pool to avoid blocking
        def _call_api():
            return self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[{
                    "role": "user",
                    "content": prompt
                }]
            )
        
        response = await asyncio.to_thread(_call_api)
        
        content = response.content[0].text if response.content else ""
        tokens_used = response.usage.input_tokens + response.usage.output_tokens
        
        return {
            'content': content,
            'tokens_used': tokens_used,
            'model': self.model,
            'model_version': self.model_version
        }


class OpenAIClient(LLMClient):
    """OpenAI GPT client."""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4-turbo-preview"):
        if not OPENAI_AVAILABLE:
            raise ImportError("openai package not installed. Install with: pip install openai")
        
        self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
        self.model = model
        self.model_version = "2024-01-01"  # API version
    
    async def generate(
        self,
        prompt: str,
        max_tokens: int = 4000,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """Generate response using OpenAI GPT."""
        import asyncio
        
        # OpenAI SDK is synchronous, run in thread pool to avoid blocking
        def _call_api():
            return self.client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[{
                    "role": "user",
                    "content": prompt
                }]
            )
        
        response = await asyncio.to_thread(_call_api)
        
        content = response.choices[0].message.content if response.choices else ""
        tokens_used = response.usage.total_tokens if response.usage else 0
        
        return {
            'content': content,
            'tokens_used': tokens_used,
            'model': self.model,
            'model_version': self.model_version
        }


# Moonshot Kimi API base URL (OpenAI-compatible)
KIMI_API_BASE_URL = "https://api.moonshot.ai/v1"


class KimiClient(LLMClient):
    """Kimi (Moonshot) client using OpenAI-compatible API. Supports Kimi K2.5."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "kimi-k2.5",
        base_url: Optional[str] = None,
    ):
        if not OPENAI_AVAILABLE:
            raise ImportError("openai package not installed. Install with: pip install openai")

        key = api_key or os.getenv("KIMI_API_KEY") or os.getenv("MOONSHOT_API_KEY")
        if not key or not str(key).strip():
            raise ValueError(
                "Kimi API key is missing. Set KIMI_API_KEY or MOONSHOT_API_KEY in your environment "
                "(e.g. in webapp/.env.local when using docker-compose). Get a key at https://platform.moonshot.ai/console/api-keys"
            )
        key = str(key).strip()
        base = base_url or os.getenv("KIMI_API_BASE_URL", KIMI_API_BASE_URL)
        # Use a custom httpx client to avoid openai→httpx passing deprecated 'proxies' kwarg
        # (httpx 0.28+ removed it; openai can still pass it when building the client)
        if httpx is not None:
            http_client = httpx.Client(trust_env=False)
            self.client = OpenAI(
                api_key=key,
                base_url=base,
                http_client=http_client,
            )
        else:
            self.client = OpenAI(api_key=key, base_url=base)
        self.model = model
        self.model_version = "k2.5"

    async def generate(
        self,
        prompt: str,
        max_tokens: int = 4000,
        temperature: float = 0.7,
    ) -> Dict[str, Any]:
        """Generate response using Kimi (Moonshot) API. Uses non-thinking mode for compatibility."""
        import asyncio

        # Kimi K2.5 non-thinking mode uses fixed temperature 0.6; use it for text summarization
        kimi_temperature = 0.6

        def _call_api():
            # Only pass params the OpenAI client accepts. Do not pass "thinking" or extra_body:
            # some client versions merge extra_body and then reject unknown kwargs at create().
            # Kimi API uses temperature 0.6 for non-thinking; omit thinking and let the API default.
            try:
                return self.client.chat.completions.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    temperature=kimi_temperature,
                    messages=[{"role": "user", "content": prompt}],
                )
            except Exception as e:
                err_str = str(e).lower()
                if "401" in err_str or "invalid_authentication" in err_str or "invalid authentication" in err_str:
                    raise ValueError(
                        "Kimi API key was rejected (401). Check that KIMI_API_KEY or MOONSHOT_API_KEY is correct, "
                        "not expired, and that your Moonshot account has API access. Get a key at https://platform.moonshot.ai/console/api-keys"
                    ) from e
                raise

        response = await asyncio.to_thread(_call_api)

        content = response.choices[0].message.content if response.choices else ""
        tokens_used = response.usage.total_tokens if response.usage else 0

        return {
            "content": content,
            "tokens_used": tokens_used,
            "model": self.model,
            "model_version": self.model_version,
        }


# OpenRouter API base URL (OpenAI-compatible)
OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1"


class OpenRouterClient(LLMClient):
    """OpenRouter client using OpenAI-compatible API. Routes to hundreds of models."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "anthropic/claude-sonnet-4",
        base_url: Optional[str] = None,
    ):
        if not OPENAI_AVAILABLE:
            raise ImportError("openai package not installed. Install with: pip install openai")

        key = api_key or os.getenv("OPENROUTER_API_KEY")
        if not key or not str(key).strip():
            raise ValueError(
                "OpenRouter API key is missing. Set OPENROUTER_API_KEY in your environment. "
                "Get a key at https://openrouter.ai/keys"
            )
        key = str(key).strip()
        base = base_url or os.getenv("OPENROUTER_BASE_URL", OPENROUTER_API_BASE_URL)
        # Use a custom httpx client to avoid openai→httpx passing deprecated 'proxies' kwarg
        default_headers = {
            "HTTP-Referer": "https://github.com/sec-audit-repos",
            "X-Title": "sec-audit-repos",
        }
        if httpx is not None:
            http_client = httpx.Client(trust_env=False)
            self.client = OpenAI(
                api_key=key,
                base_url=base,
                default_headers=default_headers,
                http_client=http_client,
            )
        else:
            self.client = OpenAI(
                api_key=key,
                base_url=base,
                default_headers=default_headers,
            )
        self.model = model
        self.model_version = "openrouter"

    async def generate(
        self,
        prompt: str,
        max_tokens: int = 4000,
        temperature: float = 0.7,
    ) -> Dict[str, Any]:
        """Generate response using OpenRouter API."""
        import asyncio

        def _call_api():
            return self.client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[{"role": "user", "content": prompt}],
            )

        response = await asyncio.to_thread(_call_api)

        content = response.choices[0].message.content if response.choices else ""
        tokens_used = response.usage.total_tokens if response.usage else 0

        return {
            "content": content,
            "tokens_used": tokens_used,
            "model": self.model,
            "model_version": self.model_version,
        }


def create_llm_client(provider: Optional[str] = None, model: Optional[str] = None) -> LLMClient:
    """
    Create an LLM client based on configuration.

    Args:
        provider: Provider name ('anthropic', 'openai', 'kimi', or 'openrouter'). Auto-detects if None.
        model: Model name. Uses defaults if None.

    Returns:
        LLMClient instance
    """
    provider = provider or os.getenv("AI_PROVIDER", "anthropic").lower()

    if provider == "anthropic":
        if not ANTHROPIC_AVAILABLE:
            raise ImportError("anthropic package not installed")
        model = model or os.getenv("AI_MODEL", "claude-3-opus-20240229")
        return AnthropicClient(model=model)

    elif provider == "openai":
        if not OPENAI_AVAILABLE:
            raise ImportError("openai package not installed")
        model = model or os.getenv("AI_MODEL", "gpt-4-turbo-preview")
        return OpenAIClient(model=model)

    elif provider == "kimi":
        if not OPENAI_AVAILABLE:
            raise ImportError("openai package not installed (required for Kimi API)")
        model = model or os.getenv("AI_MODEL", "kimi-k2.5")
        return KimiClient(model=model)

    elif provider == "openrouter":
        if not OPENAI_AVAILABLE:
            raise ImportError("openai package not installed (required for OpenRouter API)")
        model = model or os.getenv("AI_MODEL", "anthropic/claude-sonnet-4")
        return OpenRouterClient(model=model)

    else:
        raise ValueError(f"Unknown LLM provider: {provider}. Use: anthropic, openai, kimi, openrouter")

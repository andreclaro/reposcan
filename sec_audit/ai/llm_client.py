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
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


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


def create_llm_client(provider: Optional[str] = None, model: Optional[str] = None) -> LLMClient:
    """
    Create an LLM client based on configuration.
    
    Args:
        provider: Provider name ('anthropic' or 'openai'). Auto-detects if None.
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
    
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")

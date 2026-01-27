"""Storage backend abstraction for local and S3 storage."""
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional


class StorageBackend(ABC):
    """Abstract storage backend interface."""
    
    @abstractmethod
    def upload_file(self, local_path: Path, remote_path: str) -> str:
        """
        Upload a file to storage.
        
        Args:
            local_path: Local file path
            remote_path: Remote storage path (e.g., 'scans/{scan_id}/raw/semgrep.json')
        
        Returns:
            URL or path to uploaded file
        """
        pass
    
    @abstractmethod
    def get_url(self, remote_path: str, expires_in: int = 3600) -> str:
        """
        Get a URL to access a stored file.
        
        Args:
            remote_path: Remote storage path
            expires_in: URL expiration time in seconds (for pre-signed URLs)
        
        Returns:
            URL to access the file
        """
        pass
    
    @abstractmethod
    def delete_file(self, remote_path: str) -> bool:
        """
        Delete a file from storage.
        
        Args:
            remote_path: Remote storage path
        
        Returns:
            True if successful, False otherwise
        """
        pass


class LocalStorageBackend(StorageBackend):
    """Local filesystem storage backend (for development)."""
    
    def __init__(self, base_path: Optional[str] = None):
        self.base_path = Path(base_path or os.getenv("STORAGE_BASE_PATH", "./results"))
        self.base_path.mkdir(parents=True, exist_ok=True)
    
    def upload_file(self, local_path: Path, remote_path: str) -> str:
        """Copy file to local storage directory."""
        remote_full_path = self.base_path / remote_path
        remote_full_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Copy file
        import shutil
        shutil.copy2(local_path, remote_full_path)
        
        return str(remote_full_path)
    
    def get_url(self, remote_path: str, expires_in: int = 3600) -> str:
        """Return absolute file path."""
        remote_full_path = self.base_path / remote_path
        return str(remote_full_path.resolve())
    
    def delete_file(self, remote_path: str) -> bool:
        """Delete file from local storage."""
        remote_full_path = self.base_path / remote_path
        try:
            if remote_full_path.exists():
                remote_full_path.unlink()
            return True
        except Exception:
            return False


class S3StorageBackend(StorageBackend):
    """S3-compatible storage backend (for production)."""
    
    def __init__(self, bucket: Optional[str] = None):
        try:
            import boto3
        except ImportError:
            raise ImportError("boto3 package not installed. Install with: pip install boto3")
        
        self.bucket = bucket or os.getenv("S3_BUCKET")
        if not self.bucket:
            raise ValueError("S3_BUCKET environment variable required for S3 storage")
        
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            endpoint_url=os.getenv("S3_ENDPOINT_URL")  # For S3-compatible services
        )
    
    def upload_file(self, local_path: Path, remote_path: str) -> str:
        """Upload file to S3."""
        self.s3_client.upload_file(
            str(local_path),
            self.bucket,
            remote_path
        )
        return f"s3://{self.bucket}/{remote_path}"
    
    def get_url(self, remote_path: str, expires_in: int = 3600) -> str:
        """Generate pre-signed URL for S3 object."""
        return self.s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': self.bucket, 'Key': remote_path},
            ExpiresIn=expires_in
        )
    
    def delete_file(self, remote_path: str) -> bool:
        """Delete file from S3."""
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=remote_path)
            return True
        except Exception:
            return False


def create_storage_backend(backend_type: Optional[str] = None) -> StorageBackend:
    """
    Create a storage backend based on configuration.
    
    Args:
        backend_type: Backend type ('local' or 's3'). Auto-detects if None.
    
    Returns:
        StorageBackend instance
    """
    backend_type = backend_type or os.getenv("STORAGE_BACKEND", "local").lower()
    
    if backend_type == "local":
        return LocalStorageBackend()
    elif backend_type == "s3":
        return S3StorageBackend()
    else:
        raise ValueError(f"Unknown storage backend: {backend_type}")

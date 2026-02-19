#!/usr/bin/env python3
"""
Simple Redis connectivity check (TCP + optional PING).

Usage:
  python3 redis_check.py --host 46.224.224.93 --port 6379
  python3 redis_check.py --host 46.224.224.93 --port 6379 --password "..."
"""

from __future__ import annotations

import argparse
import socket
import ssl
import sys


def build_ping(password: str | None) -> bytes:
    if password:
        # AUTH then PING
        auth_cmd = f"*2\r\n$4\r\nAUTH\r\n${len(password)}\r\n{password}\r\n"
        ping_cmd = "*1\r\n$4\r\nPING\r\n"
        return (auth_cmd + ping_cmd).encode("ascii")
    return b"*1\r\n$4\r\nPING\r\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Redis TCP connectivity check")
    parser.add_argument("--host", required=True, help="Redis host or IP")
    parser.add_argument("--port", type=int, default=6379, help="Redis port")
    parser.add_argument("--timeout", type=float, default=3.0, help="Socket timeout in seconds")
    parser.add_argument("--password", default=None, help="Password for AUTH (optional)")
    parser.add_argument(
        "--tls",
        action="store_true",
        help="Enable TLS (use with --port 6380 or custom TLS port)",
    )
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="Disable TLS cert verification (only with --tls)",
    )
    args = parser.parse_args()

    addr = (args.host, args.port)
    payload = build_ping(args.password)

    try:
        with socket.create_connection(addr, timeout=args.timeout) as sock:
            conn = sock
            if args.tls:
                if args.insecure:
                    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                    context.check_hostname = False
                    context.verify_mode = ssl.CERT_NONE
                else:
                    context = ssl.create_default_context()
                conn = context.wrap_socket(sock, server_hostname=args.host)
            conn.sendall(payload)
            conn.settimeout(args.timeout)
            data = conn.recv(4096)
            if not data:
                print("Connected, but no response received.")
                return 1
            print(f"Connected. Response: {data!r}")
            return 0
    except socket.timeout:
        print("Connection timed out.")
        return 2
    except ConnectionRefusedError:
        print("Connection refused.")
        return 3
    except OSError as exc:
        print(f"Connection failed: {exc}")
        return 4


if __name__ == "__main__":
    sys.exit(main())

"""
Request logging middleware for ViewVault.

Logs every request with: timestamp, user_id (from JWT if present),
method, path, status_code, and latency in milliseconds.

Usage:
    from middleware import RequestLoggingMiddleware
    app.add_middleware(RequestLoggingMiddleware)
"""

import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("viewvault.requests")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that logs every HTTP request with timing and user info."""

    # Paths to skip logging (health checks, static assets)
    SKIP_PATHS = frozenset({"/health", "/favicon.ico"})
    SKIP_PREFIXES = ("/static/",)

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Don't log noise from health checks and static files
        if path in self.SKIP_PATHS or path.startswith(self.SKIP_PREFIXES):
            return await call_next(request)

        start = time.perf_counter()
        response: Response = await call_next(request)
        latency_ms = (time.perf_counter() - start) * 1000

        # Try to extract user_id from the authorization header (best-effort)
        user_id = self._extract_user_id(request)

        logger.info(
            "%(method)s %(path)s %(status)s %(latency).0fms%(user)s",
            {
                "method": request.method,
                "path": path,
                "status": response.status_code,
                "latency": latency_ms,
                "user": f" user={user_id}" if user_id else "",
            },
        )

        return response

    @staticmethod
    def _extract_user_id(request: Request) -> str | None:
        """Best-effort extraction of user identifier from JWT.

        Decodes the payload without verification — this is purely for logging,
        not for auth. If anything fails we just return None.
        """
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            return None

        token = auth[7:]
        try:
            import base64
            import json

            # JWT is header.payload.signature — grab the payload
            parts = token.split(".")
            if len(parts) < 2:
                return None

            # Add padding if needed
            payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
            payload = json.loads(base64.urlsafe_b64decode(payload_b64))
            return payload.get("sub")
        except Exception:
            return None

"""
Auth0 Bridge Service
Handles Auth0 authentication and JWT creation for ViewVault
"""

import os
import logging
from typing import Optional, Dict, Any
from authlib.integrations.requests_client import OAuth2Session
from authlib.jose import jwt
import requests
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class Auth0Bridge:
    def __init__(self):
        self.domain = os.getenv('AUTH0_DOMAIN')
        self.client_id = os.getenv('AUTH0_CLIENT_ID')
        self.client_secret = os.getenv('AUTH0_CLIENT_SECRET')
        self.audience = os.getenv('AUTH0_AUDIENCE')
        self.secret_key = os.getenv('SECRET_KEY')
        
        # Debug logging
        logger.info(f"🔍 AUTH0 DEBUG: AUTH0_DOMAIN = {self.domain}")
        logger.info(f"🔍 AUTH0 DEBUG: AUTH0_CLIENT_ID = {self.client_id}")
        logger.info(f"🔍 AUTH0 DEBUG: AUTH0_CLIENT_SECRET = {'***' if self.client_secret else None}")
        logger.info(f"🔍 AUTH0 DEBUG: AUTH0_AUDIENCE = {self.audience}")
        
        self.is_available = bool(self.domain and self.client_id and self.client_secret and self.audience)
        
        if self.is_available:
            logger.info("Auth0 bridge initialized successfully")
        else:
            logger.warning("Auth0 not configured - missing required environment variables")
    
    def get_authorization_url(self, provider: str = 'google') -> Optional[str]:
        """
        Get Auth0 authorization URL for OAuth provider
        """
        if not self.is_available:
            logger.error("Auth0 not configured")
            return None
        
        try:
            # Auth0 connection names (these need to be configured in Auth0 dashboard)
            connection_map = {
                'google': 'google-oauth2',
                'github': 'github',
                'facebook': 'facebook',
                'twitter': 'twitter-oauth2'
            }
            
            connection = connection_map.get(provider.lower())
            if not connection:
                logger.error(f"Unsupported provider: {provider}")
                return None
            
            # Build authorization URL
            auth_url = f"https://{self.domain}/authorize"
            base_url = os.getenv('BASE_URL', 'http://localhost:8008')
            params = {
                'response_type': 'code',
                'client_id': self.client_id,
                'redirect_uri': f"{base_url}/auth0/callback",
                'scope': 'openid profile email',
                'connection': connection
            }
            
            # Add query parameters
            query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
            full_url = f"{auth_url}?{query_string}"
            
            logger.info(f"Generated Auth0 authorization URL for {provider}")
            logger.info(f"OAuth URL: {full_url}")
            logger.info(f"Params: {params}")
            return full_url
            
        except Exception as e:
            logger.error(f"Error generating Auth0 authorization URL: {e}")
            return None
    
    def exchange_code_for_token(self, code: str, redirect_uri: str) -> Optional[Dict[str, Any]]:
        """
        Exchange authorization code for access token
        """
        if not self.is_available:
            logger.error("Auth0 not configured")
            return None
        
        try:
            token_url = f"https://{self.domain}/oauth/token"
            
            data = {
                'grant_type': 'authorization_code',
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'code': code,
                'redirect_uri': redirect_uri
            }
            
            response = requests.post(token_url, data=data)
            response.raise_for_status()
            
            token_data = response.json()
            logger.info("Successfully exchanged code for token")
            return token_data
            
        except Exception as e:
            logger.error(f"Error exchanging code for token: {e}")
            return None
    
    def get_user_info(self, access_token: str) -> Optional[Dict[str, Any]]:
        """
        Get user information from Auth0 using access token
        """
        if not self.is_available:
            logger.error("Auth0 not configured")
            return None
        
        try:
            user_url = f"https://{self.domain}/userinfo"
            headers = {'Authorization': f'Bearer {access_token}'}
            
            response = requests.get(user_url, headers=headers)
            response.raise_for_status()
            
            user_data = response.json()
            logger.info(f"Retrieved user info for: {user_data.get('email', 'unknown')}")
            return user_data
            
        except Exception as e:
            logger.error(f"Error getting user info: {e}")
            return None
    
    def create_jwt_for_auth0_user(self, user_data: Dict[str, Any]) -> Optional[str]:
        """
        Create ViewVault JWT token from Auth0 user data
        """
        if not self.secret_key:
            logger.error("SECRET_KEY not configured")
            return None
        
        try:
            # Extract user information
            user_id = user_data.get('sub')  # Auth0 user ID
            email = user_data.get('email')
            name = user_data.get('name', '')
            picture = user_data.get('picture', '')
            
            if not user_id or not email:
                logger.error("Missing required user data")
                return None
            
            # Create JWT payload
            now = datetime.utcnow()
            payload = {
                'sub': user_id,
                'email': email,
                'name': name,
                'picture': picture,
                'iat': now,
                'exp': now + timedelta(days=7),  # 7 day expiration
                'iss': 'viewvault',
                'auth_provider': 'auth0'
            }
            
            # Create JWT token
            token = jwt.encode({'alg': 'HS256'}, payload, self.secret_key)
            logger.info(f"Created JWT for Auth0 user: {email}")
            return token
            
        except Exception as e:
            logger.error(f"Error creating JWT for Auth0 user: {e}")
            return None
    
    def sync_user_from_auth0(self, user_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Sync Auth0 user to local database
        """
        try:
            # This would integrate with your existing user management
            # For now, just return the user data
            logger.info(f"Syncing Auth0 user: {user_data.get('email', 'unknown')}")
            return user_data
            
        except Exception as e:
            logger.error(f"Error syncing Auth0 user: {e}")
            return None

# Global instance
auth0_bridge = Auth0Bridge()

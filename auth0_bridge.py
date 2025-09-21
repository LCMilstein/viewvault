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
        self.web_client_id = os.getenv('AUTH0_WEB_CLIENT_ID') or os.getenv('AUTH0_CLIENT_ID')
        self.mobile_client_id = os.getenv('AUTH0_MOBILE_CLIENT_ID')
        self.client_secret = os.getenv('AUTH0_CLIENT_SECRET')
        self.audience = os.getenv('AUTH0_AUDIENCE')
        self.secret_key = os.getenv('SECRET_KEY')
        
        
        # Debug logging
        logger.info(f"🔍 AUTH0 DEBUG: AUTH0_DOMAIN = {self.domain}")
        logger.info(f"🔍 AUTH0 DEBUG: AUTH0_WEB_CLIENT_ID = {self.web_client_id}")
        logger.info(f"🔍 AUTH0 DEBUG: AUTH0_MOBILE_CLIENT_ID = {self.mobile_client_id}")
        logger.info(f"🔍 AUTH0 DEBUG: AUTH0_CLIENT_SECRET = {'***' if self.client_secret else None}")
        logger.info(f"🔍 AUTH0 DEBUG: AUTH0_AUDIENCE = {self.audience}")
        
        # Available if we have domain, at least one client ID, secret, and audience
        self.is_available = bool(
            self.domain and 
            (self.web_client_id or self.mobile_client_id) and 
            self.client_secret and 
            self.audience
        )
        
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
            base_url = os.getenv('BASE_URL', 'https://app.viewvault.app')
            params = {
                'response_type': 'code',
                'client_id': self.web_client_id,
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
                'client_id': self.web_client_id,
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
                'exp': now + timedelta(days=90),  # 90 day expiration
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
    
    def handle_mobile_callback(self, access_token: str) -> Optional[str]:
        """
        Handle mobile Auth0 callback with direct access token
        """
        if not self.is_available:
            logger.error("Auth0 not configured")
            return None
        
        try:
            # Get user info using the access token
            user_data = self.get_user_info(access_token)
            if not user_data:
                logger.error("Failed to get user info from access token")
                return None
            
            # Create JWT token for the user
            jwt_token = self.create_jwt_for_auth0_user(user_data)
            if not jwt_token:
                logger.error("Failed to create JWT token for mobile user")
                return None
            
            logger.info(f"Successfully handled mobile callback for: {user_data.get('email', 'unknown')}")
            return jwt_token
            
        except Exception as e:
            logger.error(f"Error handling mobile callback: {e}")
            return None
    
    def validate_token_client_id(self, token_data: Dict[str, Any]) -> bool:
        """
        Validate that the token was issued for a supported client ID
        """
        try:
            # Decode the JWT token to get the client_id claim
            import base64
            import json
            
            # Split the token and decode the payload
            token_parts = token_data.get('access_token', '').split('.')
            if len(token_parts) != 3:
                return False
            
            # Decode the payload (add padding if needed)
            payload = token_parts[1]
            payload += '=' * (4 - len(payload) % 4)  # Add padding
            decoded_payload = base64.urlsafe_b64decode(payload)
            claims = json.loads(decoded_payload)
            
            # Check if the client_id is one of our supported clients
            client_id = claims.get('aud')  # Auth0 uses 'aud' for audience/client_id
            supported_clients = [self.web_client_id, self.mobile_client_id]
            supported_clients = [c for c in supported_clients if c]  # Remove None values
            
            if client_id in supported_clients:
                logger.info(f"Token validated for client: {client_id}")
                return True
            else:
                logger.warning(f"Token from unsupported client: {client_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error validating token client ID: {e}")
            return False
    
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

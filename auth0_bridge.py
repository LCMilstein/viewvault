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
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

class Auth0Bridge:
    def __init__(self):
        self.domain = os.getenv('AUTH0_DOMAIN')
        self.web_client_id = os.getenv('AUTH0_WEB_CLIENT_ID')
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
    
    def get_universal_login_url(self, mode: str = 'login') -> Optional[str]:
        """
        Get Auth0 Universal Login URL for login or signup
        
        Args:
            mode: 'login' or 'signup'
        """
        if not self.is_available:
            logger.error("Auth0 not configured")
            return None
        
        try:
            base_url = os.getenv('BASE_URL', 'https://app.viewvault.app')
            auth_url = f"https://{self.domain}/authorize"
            
            # Universal Login parameters - let Auth0 handle the UI
            params = {
                'response_type': 'code',
                'client_id': self.web_client_id,
                'redirect_uri': f"{base_url}/auth0/callback",
                'scope': 'openid profile email',
                'screen_hint': mode  # 'login' or 'signup'
            }
            
            # Add query parameters
            query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
            full_url = f"{auth_url}?{query_string}"
            
            logger.info(f"Generated Auth0 Universal Login URL for {mode}")
            logger.info(f"Auth URL: {full_url}")
            logger.info(f"Params: {params}")
            return full_url
            
        except Exception as e:
            logger.error(f"Error generating Auth0 Universal Login URL: {e}")
            return None

    def get_authorization_url(self, provider: str = 'google', mode: str = 'login') -> Optional[str]:
        """
        Get Auth0 authorization URL for OAuth provider or email/password
        
        Args:
            provider: 'google', 'github', 'facebook', 'twitter', or 'signup'
            mode: 'login' or 'signup' (for email/password)
        """
        if not self.is_available:
            logger.error("Auth0 not configured")
            return None
        
        try:
            base_url = os.getenv('BASE_URL', 'https://app.viewvault.app')
            auth_url = f"https://{self.domain}/authorize"
            
            # Handle email/password signup
            if provider.lower() == 'signup':
                params = {
                    'response_type': 'code',
                    'client_id': self.web_client_id,
                    'redirect_uri': f"{base_url}/auth0/callback",
                    'scope': 'openid profile email',
                    'connection': 'Username-Password-Authentication'
                    # Removed screen_hint - let Auth0 handle the flow naturally
                }
            else:
                # Auth0 connection names (these need to be configured in Auth0 dashboard)
                connection_map = {
                    'google': 'google-oauth2',
                    'github': 'github',
                    'email': 'email',  # Auth0 Passwordless OTP
                    'facebook': 'facebook',
                    'twitter': 'twitter-oauth2'
                }
                
                connection = connection_map.get(provider.lower())
                if not connection:
                    logger.error(f"Unsupported provider: {provider}")
                    return None
                
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
            
            logger.info(f"Generated Auth0 authorization URL for {provider} (mode: {mode})")
            logger.info(f"Auth URL: {full_url}")
            logger.info(f"Params: {params}")
            return full_url
            
        except Exception as e:
            logger.error(f"Error generating Auth0 authorization URL: {e}")
            return None
    
    def exchange_code_for_token(self, code: str, redirect_uri: str) -> Optional[Dict[str, Any]]:
        """
        Exchange authorization code for access token using web client ID
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
            logger.info("Successfully exchanged code for token using web client")
            return token_data
            
        except Exception as e:
            logger.error(f"Error exchanging code for token with web client: {e}")
            return None
    
    def exchange_code_for_token_mobile(self, code: str, redirect_uri: str) -> Optional[Dict[str, Any]]:
        """
        Exchange authorization code for access token using mobile client ID
        """
        if not self.is_available or not self.mobile_client_id:
            logger.error("Mobile Auth0 not configured - missing mobile client ID")
            return None
        
        try:
            token_url = f"https://{self.domain}/oauth/token"
            
            data = {
                'grant_type': 'authorization_code',
                'client_id': self.mobile_client_id,  # Use mobile client ID
                'client_secret': self.client_secret,
                'code': code,
                'redirect_uri': redirect_uri
            }
            
            logger.info(f"Exchanging code for token using mobile client ID: {self.mobile_client_id}")
            response = requests.post(token_url, data=data)
            response.raise_for_status()
            
            token_data = response.json()
            logger.info("Successfully exchanged code for token using mobile client")
            return token_data
            
        except Exception as e:
            logger.error(f"Error exchanging code for token with mobile client: {e}")
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
        Also creates/updates user in database and handles first-user admin logic
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
            
            logger.info(f"Creating JWT for Auth0 user - ID: {user_id}, Email: {email}")
            
            if not user_id or not email:
                logger.error(f"Missing required user data - user_id: {user_id}, email: {email}")
                return None
            
            # Create or update user in database
            db_user = self._create_or_update_auth0_user(user_id, email, name, picture)
            if not db_user:
                logger.error("Failed to create/update user in database")
                return None
            
            # Create JWT payload with proper timezone handling
            now = datetime.utcnow()
            exp_time = now + timedelta(days=90)  # 90 day expiration
            
            payload = {
                'sub': user_id,
                'email': email,
                'name': name,
                'picture': picture,
                'iat': int(now.timestamp()),  # Convert to Unix timestamp
                'exp': int(exp_time.timestamp()),  # Convert to Unix timestamp
                'iss': 'viewvault',
                'auth_provider': 'auth0'
            }
            
            logger.info(f"JWT payload created: {payload}")
            
            # Create JWT token with proper header
            token = jwt.encode({'alg': 'HS256'}, payload, self.secret_key)
            logger.info(f"Successfully created JWT for Auth0 user: {email}")
            
            # Ensure token is returned as string, not bytes
            if isinstance(token, bytes):
                token = token.decode('utf-8')
            return token
            
        except Exception as e:
            logger.error(f"Error creating JWT for Auth0 user: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return None
    
    def _create_or_update_auth0_user(self, auth0_user_id: str, email: str, name: str, picture: str):
        """
        Create or update user in database for Auth0 authentication
        Handles first-user admin logic
        """
        try:
            from sqlmodel import Session, select
            from database import engine
            from models import User
            
            with Session(engine) as session:
                # Check if user already exists by Auth0 ID
                existing_user = session.exec(
                    select(User).where(User.auth0_user_id == auth0_user_id)
                ).first()
                
                if existing_user:
                    # Update existing user
                    existing_user.email = email
                    existing_user.full_name = name
                    existing_user.oauth_enabled = True
                    existing_user.auth_provider = "auth0"
                    existing_user.last_login = datetime.now(timezone.utc)
                    session.add(existing_user)
                    session.commit()
                    session.refresh(existing_user)
                    logger.info(f"Updated existing Auth0 user: {email}")
                    return existing_user
                
                # Create new user
                # Generate username from email (before @)
                username = email.split('@')[0] if email else f"user_{auth0_user_id[:8]}"
                
                # Ensure username is unique
                original_username = username
                counter = 1
                while session.exec(select(User).where(User.username == username)).first():
                    username = f"{original_username}_{counter}"
                    counter += 1
                
                # Check if this is a self-hosted instance where first user should be admin
                # For multi-tenant/shared instances, we don't want automatic admin assignment
                is_self_hosted = os.getenv("SELF_HOSTED_INSTANCE", "false").lower() == "true"
                is_admin = False
                
                if is_self_hosted:
                    # Only in self-hosted instances: make first user admin
                    admin_count = len(session.exec(select(User).where(User.is_admin == True)).all())
                    is_admin = (admin_count == 0)
                    logger.info(f"🔍 Self-hosted instance: admin_count={admin_count}, will_be_admin={is_admin}")
                else:
                    logger.info(f"🔍 Multi-tenant instance: new user will NOT be admin")
                
                new_user = User(
                    username=username,
                    email=email,
                    full_name=name,
                    hashed_password=None,  # Auth0 users don't have local passwords
                    auth0_user_id=auth0_user_id,
                    auth_provider="auth0",
                    oauth_enabled=True,
                    password_enabled=False,
                    email_verified=True,  # Auth0 users are pre-verified
                    is_admin=is_admin  # Only admin if self-hosted AND first user
                )
                
                session.add(new_user)
                session.commit()
                session.refresh(new_user)
                
                if is_admin:
                    logger.info(f"✅ Created first Auth0 user as admin (self-hosted): {email}")
                else:
                    logger.info(f"✅ Created new Auth0 user (regular): {email}")
                
                return new_user
                
        except Exception as e:
            logger.error(f"Error creating/updating Auth0 user: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return None
    
    def link_oauth_to_existing_user(self, auth0_user_data: Dict[str, Any], existing_user_id: int) -> bool:
        """
        Link OAuth account to existing password-based user
        """
        try:
            from sqlmodel import Session, select
            from database import engine
            from models import User
            
            with Session(engine) as session:
                # Get the existing user
                existing_user = session.get(User, existing_user_id)
                if not existing_user:
                    logger.error(f"User with ID {existing_user_id} not found for linking")
                    return False
                
                # Check if email matches (for security)
                auth0_email = auth0_user_data.get('email')
                if existing_user.email != auth0_email:
                    logger.error(f"Email mismatch: existing user email {existing_user.email} != Auth0 email {auth0_email}")
                    return False
                
                # Check if user already has OAuth enabled
                if existing_user.oauth_enabled:
                    logger.error(f"User {existing_user_id} already has OAuth enabled")
                    return False
                
                # Link the OAuth account
                auth0_user_id = auth0_user_data.get('sub')
                existing_user.auth0_user_id = auth0_user_id
                existing_user.oauth_enabled = True
                existing_user.email_verified = True  # Auth0 users are pre-verified
                
                # Update auth provider
                if existing_user.password_enabled and existing_user.oauth_enabled:
                    existing_user.auth_provider = "both"
                else:
                    existing_user.auth_provider = "auth0"
                
                session.add(existing_user)
                session.commit()
                
                logger.info(f"Successfully linked OAuth account to user {existing_user_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error linking OAuth account: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return False
    
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

"""
Supabase Bridge Service
Handles integration between Supabase authentication and JWT system
Maintains iOS client compatibility while adding OAuth support
"""

import os
from typing import Optional, Dict, Any
from supabase import create_client, Client
from sqlmodel import Session, select
from models import User
from database import engine
from security import create_access_token, get_password_hash
import logging

logger = logging.getLogger(__name__)

class SupabaseBridge:
    """Bridge between Supabase authentication and JWT system"""
    
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_ANON_KEY")
        self.service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not self.supabase_url or not self.supabase_key:
            logger.warning("Supabase credentials not configured")
            self.supabase = None
        else:
            self.supabase = create_client(self.supabase_url, self.supabase_key)
            logger.info("Supabase client initialized")
    
    def is_available(self) -> bool:
        """Check if Supabase is properly configured"""
        return self.supabase is not None
    
    def sync_user_from_supabase(self, supabase_user: Dict[str, Any]) -> Optional[User]:
        """
        Sync Supabase user to local User table
        Creates or updates local user based on Supabase data
        """
        if not self.supabase:
            logger.error("Supabase not available")
            return None
        
        try:
            # Extract user data from Supabase
            user_id = supabase_user.get('id')
            email = supabase_user.get('email', '')
            username = supabase_user.get('user_metadata', {}).get('username', '')
            
            # If no username in metadata, use email prefix
            if not username and email:
                username = email.split('@')[0]
            
            # If still no username, use user ID
            if not username:
                username = f"user_{user_id[:8]}"
            
            with Session(engine) as session:
                # Check if user already exists by email or username
                existing_user = session.exec(
                    select(User).where(
                        (User.email == email) | (User.username == username)
                    )
                ).first()
                
                if existing_user:
                    # Update existing user
                    existing_user.email = email
                    existing_user.username = username
                    existing_user.is_active = True
                    # Update Supabase user ID in notes field for reference
                    existing_user.notes = f"supabase_id:{user_id}"
                    session.add(existing_user)
                    session.commit()
                    session.refresh(existing_user)
                    logger.info(f"Updated existing user: {username}")
                    return existing_user
                else:
                    # Create new user
                    new_user = User(
                        username=username,
                        email=email,
                        hashed_password="",  # No password for OAuth users
                        is_active=True,
                        is_admin=False,
                        notes=f"supabase_id:{user_id}"
                    )
                    session.add(new_user)
                    session.commit()
                    session.refresh(new_user)
                    logger.info(f"Created new user: {username}")
                    return new_user
                    
        except Exception as e:
            logger.error(f"Error syncing user from Supabase: {e}")
            return None
    
    def create_jwt_for_supabase_user(self, supabase_user: Dict[str, Any]) -> Optional[str]:
        """
        Create JWT token for Supabase user
        Syncs user to local database first, then creates JWT
        """
        try:
            # Sync user to local database
            local_user = self.sync_user_from_supabase(supabase_user)
            if not local_user:
                logger.error("Failed to sync Supabase user to local database")
                return None
            
            # Create JWT token
            token_data = {"sub": local_user.username}
            jwt_token = create_access_token(token_data)
            logger.info(f"Created JWT token for Supabase user: {local_user.username}")
            return jwt_token
            
        except Exception as e:
            logger.error(f"Error creating JWT for Supabase user: {e}")
            return None
    
    def get_supabase_user_by_token(self, access_token: str) -> Optional[Dict[str, Any]]:
        """
        Get Supabase user by access token
        """
        if not self.supabase:
            logger.error("Supabase client not available")
            return None
        
        logger.info(f"Attempting to get user with access token: {access_token[:20]}...")
        
        try:
            # Set the session with the access token and empty refresh token
            # The access token from OAuth should work with set_session
            self.supabase.auth.set_session(access_token, "")
            logger.info("Session set successfully")
            
            # Get user from Supabase
            response = self.supabase.auth.get_user()
            logger.info(f"Get user response: {response}")
            if response and response.user:
                logger.info(f"User found: {response.user.get('email', 'no-email')}")
                return response.user
            logger.warning("No user found in response")
            return None
        except Exception as e:
            logger.error(f"Error getting Supabase user by token: {e}")
            # Try alternative approach with service role
            try:
                if self.service_role_key:
                    logger.info("Trying service role approach...")
                    service_client = create_client(self.supabase_url, self.service_role_key)
                    response = service_client.auth.get_user(access_token)
                    if response and response.user:
                        logger.info(f"User found via service role: {response.user.get('email', 'no-email')}")
                        return response.user
            except Exception as e2:
                logger.error(f"Error with service role approach: {e2}")
            return None
    
    def sign_in_with_oauth(self, provider: str, redirect_to: str = None) -> Optional[str]:
        """
        Initiate OAuth sign-in with specified provider
        Returns redirect URL for OAuth flow
        """
        if not self.supabase:
            logger.error("Supabase not available")
            return None
        
        try:
            response = self.supabase.auth.sign_in_with_oauth({
                'provider': provider,
                'options': {
                    'redirect_to': redirect_to or f"{os.getenv('BASE_URL', 'http://localhost:8000')}/auth/callback"
                }
            })
            return response.url
        except Exception as e:
            logger.error(f"Error initiating OAuth sign-in: {e}")
            return None
    
    def sign_in_with_email(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        """
        Sign in with email and password via Supabase
        """
        if not self.supabase:
            logger.error("Supabase not available")
            return None
        
        try:
            response = self.supabase.auth.sign_in_with_password({
                'email': email,
                'password': password
            })
            if response and response.user:
                return response.user
            return None
        except Exception as e:
            logger.error(f"Error signing in with email: {e}")
            return None
    
    def sign_up_with_email(self, email: str, password: str, username: str = None) -> Optional[Dict[str, Any]]:
        """
        Sign up with email and password via Supabase
        """
        if not self.supabase:
            logger.error("Supabase not available")
            return None
        
        try:
            sign_up_data = {
                'email': email,
                'password': password
            }
            
            if username:
                sign_up_data['data'] = {'username': username}
            
            response = self.supabase.auth.sign_up(sign_up_data)
            if response and response.user:
                return response.user
            return None
        except Exception as e:
            logger.error(f"Error signing up with email: {e}")
            return None

# Global instance
supabase_bridge = SupabaseBridge()

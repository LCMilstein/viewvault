from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError
from models import User
from database import engine
import os
import logging

logger = logging.getLogger(__name__)

# Security configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 525600  # 1 year (365 days * 24 hours * 60 minutes)

# Warn loudly if using the insecure default — don't crash, just nag
if SECRET_KEY in ("your-secret-key-change-this-in-production", "change-me", "change-me-in-production"):
    logger.warning("⚠️  SECRET_KEY is using an insecure default. Set SECRET_KEY in secrets.env for production.")

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT token security
security = HTTPBearer()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT token"""
    try:
        print(f"🔍 JWT DEBUG: Verifying token with SECRET_KEY length: {len(SECRET_KEY) if SECRET_KEY else 0}")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        print(f"🔍 JWT DEBUG: Token decoded successfully, payload keys: {list(payload.keys())}")
        
        # Check if token has required fields
        if not payload.get("sub"):
            print("🔍 JWT DEBUG: Token missing 'sub' field")
            return None
            
        # Check expiration
        exp = payload.get("exp")
        if exp:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc).timestamp()
            if exp < now:
                print(f"🔍 JWT DEBUG: Token expired (exp: {exp}, now: {now})")
                return None
        
        print(f"🔍 JWT DEBUG: Token validation successful")
        return payload
    except JWTError as e:
        print(f"🔍 JWT DEBUG: JWT verification failed: {e}")
        return None
    except Exception as e:
        print(f"🔍 JWT DEBUG: Unexpected error during token verification: {e}")
        return None

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    """Get the current authenticated user"""
    token = credentials.credentials
    print(f"🔍 AUTH DEBUG: Processing token: {token[:20]}..." if token else "🔍 AUTH DEBUG: No token provided")
    
    payload = verify_token(token)
    if payload is None:
        print("🔍 AUTH DEBUG: Token verification failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    print(f"🔍 AUTH DEBUG: Token verified, payload: {payload}")
    
    # Check if this is an Auth0 user
    auth_provider = payload.get("auth_provider")
    print(f"🔍 AUTH DEBUG: Auth provider: {auth_provider}")
    
    if auth_provider == "auth0":
        # Handle Auth0 users
        auth0_user_id = payload.get("sub")
        email = payload.get("email")
        name = payload.get("name", "")
        
        print(f"🔍 AUTH DEBUG: Auth0 user ID: {auth0_user_id}, Email: {email}")
        
        if not auth0_user_id or not email:
            print("🔍 AUTH DEBUG: Missing required Auth0 token fields")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Auth0 token - missing required fields",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        try:
            with Session(engine) as session:
                # Look for existing Auth0 user by auth0_user_id
                print(f"🔍 AUTH DEBUG: Looking for existing Auth0 user with ID: {auth0_user_id}")
                user = session.exec(select(User).where(User.auth0_user_id == auth0_user_id)).first()
                
                if user is None:
                    print(f"🔍 AUTH DEBUG: Auth0 user not found, checking for existing account with email: {email}")
                    
                    # Check if user exists with same email but different auth provider
                    existing_user = session.exec(select(User).where(User.email == email)).first()
                    
                    if existing_user:
                        print(f"🔍 AUTH DEBUG: Found existing user with email {email}")
                        
                        # Check if this is the same Auth0 user (already linked)
                        if existing_user.auth0_user_id == auth0_user_id:
                            print(f"🔍 AUTH DEBUG: Same Auth0 user, updating info")
                            existing_user.full_name = name  # Update name from Auth0
                            existing_user.username = email  # Standardize username
                            existing_user.oauth_enabled = True  # Mark OAuth as enabled
                            session.add(existing_user)
                            session.commit()
                            session.refresh(existing_user)
                            user = existing_user
                            print(f"🔄 Updated Auth0 user info: {email} (ID: {user.id})")
                        else:
                            # Different Auth0 user or existing password user - link accounts
                            print(f"🔍 AUTH DEBUG: Linking Auth0 account with existing user")
                            existing_user.auth0_user_id = auth0_user_id
                            existing_user.oauth_enabled = True
                            existing_user.full_name = name  # Update name from Auth0
                            
                            # Only update username if it's different and doesn't conflict
                            if existing_user.username != email:
                                # Check if email is already used as username by another user
                                existing_username_user = session.exec(
                                    select(User).where(User.username == email, User.id != existing_user.id)
                                ).first()
                                
                                if existing_username_user is None:
                                    existing_user.username = email  # Safe to use email as username
                                    print(f"🔍 AUTH DEBUG: Updated username to email: {email}")
                                else:
                                    # Keep existing username to avoid conflict
                                    print(f"🔍 AUTH DEBUG: Keeping existing username '{existing_user.username}' to avoid conflict with email '{email}'")
                            
                            # Update auth provider to indicate multiple methods
                            if existing_user.password_enabled and existing_user.oauth_enabled:
                                existing_user.auth_provider = "both"
                            else:
                                existing_user.auth_provider = "auth0"
                            
                            session.add(existing_user)
                            session.commit()
                            session.refresh(existing_user)
                            user = existing_user
                            print(f"🔗 Linked Auth0 account with existing user: {email} (ID: {user.id})")
                    else:
                        print(f"🔍 AUTH DEBUG: No existing user found, creating new Auth0 user for: {email}")
                        # Create new Auth0 user
                        try:
                            user = User(
                                username=email,  # Use email as username for Auth0 users
                                email=email,
                                full_name=name,
                                auth0_user_id=auth0_user_id,
                                is_admin=False,  # Auth0 users start as non-admin
                                hashed_password="",  # No password for Auth0 users
                                auth_provider="auth0",
                                email_verified=True,  # Auth0 handles email verification
                                password_enabled=False,  # No password initially
                                oauth_enabled=True  # OAuth is enabled
                            )
                            session.add(user)
                            session.commit()
                            session.refresh(user)
                            print(f"🔑 Created new Auth0 user: {email} (ID: {user.id})")
                        except IntegrityError as e:
                            print(f"🔍 AUTH DEBUG: Integrity error during user creation: {e}")
                            # User already exists (race condition), fetch it
                            session.rollback()
                            user = session.exec(select(User).where(User.auth0_user_id == auth0_user_id)).first()
                            if user is None:
                                print("🔍 AUTH DEBUG: Failed to find user after integrity error")
                                raise HTTPException(
                                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                detail="Failed to create or find user"
                            )
                        print(f"🔑 Found existing Auth0 user after race condition: {email} (ID: {user.id})")
                else:
                    print(f"🔑 Found existing Auth0 user: {email} (ID: {user.id})")
                
                # Verify user is active
                if not user.is_active:
                    print(f"🔍 AUTH DEBUG: User {email} is not active")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="User account is inactive",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                
                print(f"🔍 AUTH DEBUG: Returning user: {user.username} (ID: {user.id})")
                return user
                
        except HTTPException:
            raise
        except Exception as e:
            print(f"🔍 AUTH DEBUG: Unexpected error in Auth0 user processing: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication processing failed"
            )
    else:
        # Handle regular JWT users (legacy)
        username = payload.get("sub")
        print(f"🔍 AUTH DEBUG: Legacy JWT user: {username}")
        
        if username is None:
            print("🔍 AUTH DEBUG: No username in legacy JWT token")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        try:
            with Session(engine) as session:
                user = session.exec(select(User).where(User.username == username)).first()
                if user is None:
                    print(f"🔍 AUTH DEBUG: Legacy user not found: {username}")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="User not found",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                
                if not user.is_active:
                    print(f"🔍 AUTH DEBUG: Legacy user {username} is not active")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="User account is inactive",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                
                print(f"🔍 AUTH DEBUG: Returning legacy user: {user.username} (ID: {user.id})")
                return user
                
        except HTTPException:
            raise
        except Exception as e:
            print(f"🔍 AUTH DEBUG: Unexpected error in legacy user processing: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication processing failed"
            )

def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """Get the current authenticated admin user"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user

def authenticate_user(username: str, password: str) -> Optional[User]:
    """Authenticate a user with username and password"""
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user 
#!/usr/bin/env python3
"""
Test script to verify mobile authentication flow
This script tests the JWT token creation and validation process
"""

import os
import sys
from datetime import datetime, timedelta

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_jwt_creation_and_validation():
    """Test JWT token creation and validation"""
    print("🧪 Testing JWT creation and validation...")
    
    # Mock environment variables for testing
    os.environ['SECRET_KEY'] = 'test-secret-key-for-mobile-auth-testing-only'
    os.environ['AUTH0_DOMAIN'] = 'test-domain.auth0.com'
    os.environ['AUTH0_MOBILE_CLIENT_ID'] = 'test-mobile-client-id'
    os.environ['AUTH0_AUDIENCE'] = 'test-audience'
    
    try:
        from auth0_bridge import auth0_bridge
        from security import verify_token, get_current_user
        from models import User
        from database import engine
        from sqlmodel import Session, select
        
        # Test user data (simulating Auth0 response)
        test_user_data = {
            'sub': 'auth0|test123456789',
            'email': 'test@example.com',
            'name': 'Test User',
            'picture': 'https://example.com/avatar.jpg'
        }
        
        print(f"📝 Test user data: {test_user_data}")
        
        # Test JWT creation
        print("\n🔧 Testing JWT token creation...")
        jwt_token = auth0_bridge.create_jwt_for_auth0_user(test_user_data)
        
        if not jwt_token:
            print("❌ Failed to create JWT token")
            return False
            
        print(f"✅ JWT token created: {jwt_token[:50]}...")
        
        # Test JWT validation
        print("\n🔧 Testing JWT token validation...")
        payload = verify_token(jwt_token)
        
        if not payload:
            print("❌ Failed to verify JWT token")
            return False
            
        print(f"✅ JWT token verified: {payload}")
        
        # Test user creation/lookup in database
        print("\n🔧 Testing user creation/lookup...")
        try:
            with Session(engine) as session:
                # Clean up any existing test user
                existing_user = session.exec(select(User).where(User.auth0_user_id == test_user_data['sub'])).first()
                if existing_user:
                    session.delete(existing_user)
                    session.commit()
                    print("🧹 Cleaned up existing test user")
                
                # Test the authentication flow
                print("🔧 Testing full authentication flow...")
                
                # This would normally be called by FastAPI's dependency injection
                # We'll simulate it manually
                from fastapi.security import HTTPAuthorizationCredentials
                
                # Create mock credentials
                credentials = HTTPAuthorizationCredentials(
                    scheme="Bearer",
                    credentials=jwt_token
                )
                
                # Test get_current_user function
                user = get_current_user(credentials)
                
                if not user:
                    print("❌ Failed to get current user")
                    return False
                    
                print(f"✅ User retrieved: {user.username} (ID: {user.id}, Auth Provider: {user.auth_provider})")
                
                # Clean up test user
                session.delete(user)
                session.commit()
                print("🧹 Cleaned up test user")
                
                return True
                
        except Exception as e:
            print(f"❌ Database error: {e}")
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main test function"""
    print("🚀 Starting mobile authentication test...")
    print("=" * 50)
    
    success = test_jwt_creation_and_validation()
    
    print("=" * 50)
    if success:
        print("✅ All tests passed! Mobile authentication should work correctly.")
    else:
        print("❌ Tests failed! There may be issues with mobile authentication.")
        
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())

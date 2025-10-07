#!/usr/bin/env python3
"""
Test Auth0 Email Verification Flow
"""

import requests
import json
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv('secrets.env')

def test_registration_flow():
    """Test the complete registration flow"""
    print("🧪 Testing Auth0 Email Verification Flow")
    print("=" * 50)
    
    base_url = os.getenv('BASE_URL', 'https://app.viewvault.app')
    
    # Test data
    test_email = "test-verification@example.com"  # Use a real email you can check
    test_password = "TestPassword123!"
    
    print(f"📧 Testing with email: {test_email}")
    print(f"🌐 Base URL: {base_url}")
    
    try:
        # Step 1: Try to register via Auth0 Universal Login
        auth0_domain = os.getenv('AUTH0_DOMAIN')
        client_id = os.getenv('AUTH0_WEB_CLIENT_ID')
        
        print(f"\n🔗 Auth0 Registration URL:")
        print(f"https://{auth0_domain}/authorize?response_type=code&client_id={client_id}&redirect_uri={base_url}/auth0/callback&scope=openid%20profile%20email&connection=Username-Password-Authentication&screen_hint=signup")
        
        print(f"\n📋 Manual Test Steps:")
        print(f"1. Open the URL above in a browser")
        print(f"2. Register with email: {test_email}")
        print(f"3. Use password: {test_password}")
        print(f"4. Check your email inbox for verification email")
        print(f"5. Click the verification link")
        print(f"6. Try to log in")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def check_auth0_logs():
    """Instructions for checking Auth0 logs"""
    print(f"\n🔍 Check Auth0 Logs:")
    print(f"1. Go to Auth0 Dashboard → Monitoring → Logs")
    print(f"2. Look for recent registration attempts")
    print(f"3. Check for email sending events")
    print(f"4. Look for any error messages")

if __name__ == "__main__":
    test_registration_flow()
    check_auth0_logs()
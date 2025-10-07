#!/usr/bin/env python3
"""
Auth0 Configuration Test Script
Tests Auth0 setup and configuration for ViewVault
"""

import os
import requests
import json
from dotenv import load_dotenv

# Load environment variables from secrets.env
load_dotenv('secrets.env')

from auth0_bridge import auth0_bridge

def test_environment_variables():
    """Test that all required Auth0 environment variables are set"""
    print("🔍 Testing Environment Variables...")
    
    required_vars = [
        'AUTH0_DOMAIN',
        'AUTH0_WEB_CLIENT_ID', 
        'AUTH0_MOBILE_CLIENT_ID',
        'AUTH0_CLIENT_SECRET',
        'AUTH0_AUDIENCE',
        'BASE_URL'
    ]
    
    missing_vars = []
    for var in required_vars:
        value = os.getenv(var)
        if not value:
            missing_vars.append(var)
        else:
            # Mask sensitive values
            if 'SECRET' in var:
                print(f"  ✅ {var}: ***")
            else:
                print(f"  ✅ {var}: {value}")
    
    if missing_vars:
        print(f"  ❌ Missing variables: {', '.join(missing_vars)}")
        return False
    
    # Check for common typos
    audience = os.getenv('AUTH0_AUDIENCE')
    if audience and "https//api.viewvault.app" in audience:
        print(f"  ⚠️  WARNING: Audience URL has typo (missing colon): {audience}")
        print(f"  ⚠️  Should be: https://api.viewvault.app")
    
    return len(missing_vars) == 0

def test_auth0_bridge_initialization():
    """Test that Auth0 bridge initializes correctly"""
    print("\n🔍 Testing Auth0 Bridge Initialization...")
    
    if auth0_bridge.is_available:
        print("  ✅ Auth0 bridge initialized successfully")
        return True
    else:
        print("  ❌ Auth0 bridge failed to initialize")
        return False

def test_auth0_domain_connectivity():
    """Test connectivity to Auth0 domain"""
    print("\n🔍 Testing Auth0 Domain Connectivity...")
    
    domain = os.getenv('AUTH0_DOMAIN')
    if not domain:
        print("  ❌ AUTH0_DOMAIN not set")
        return False
    
    try:
        # Test Auth0 well-known configuration endpoint
        url = f"https://{domain}/.well-known/openid_configuration"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            config = response.json()
            print(f"  ✅ Auth0 domain reachable: {domain}")
            print(f"  ✅ Issuer: {config.get('issuer')}")
            print(f"  ✅ Authorization endpoint: {config.get('authorization_endpoint')}")
            return True
        else:
            # Try alternative endpoint - just test basic connectivity
            try:
                basic_url = f"https://{domain}"
                basic_response = requests.get(basic_url, timeout=10)
                if basic_response.status_code in [200, 301, 302, 403]:
                    print(f"  ✅ Auth0 domain reachable: {domain} (status: {basic_response.status_code})")
                    return True
                else:
                    print(f"  ❌ Auth0 domain returned {basic_response.status_code}")
                    return False
            except:
                print(f"  ❌ Auth0 domain not reachable: {domain}")
                return False
            
    except Exception as e:
        print(f"  ❌ Failed to connect to Auth0 domain: {e}")
        return False

def test_auth0_urls():
    """Test Auth0 URL generation"""
    print("\n🔍 Testing Auth0 URL Generation...")
    
    try:
        # Test Universal Login URL
        login_url = auth0_bridge.get_universal_login_url('login')
        if login_url:
            print(f"  ✅ Universal login URL: {login_url[:80]}...")
        else:
            print("  ❌ Failed to generate universal login URL")
            return False
        
        # Test OAuth URLs
        providers = ['google', 'github']
        for provider in providers:
            oauth_url = auth0_bridge.get_authorization_url(provider)
            if oauth_url:
                print(f"  ✅ {provider.title()} OAuth URL: {oauth_url[:80]}...")
            else:
                print(f"  ❌ Failed to generate {provider} OAuth URL")
                return False
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error generating Auth0 URLs: {e}")
        return False

def test_backend_auth0_config():
    """Test the backend Auth0 config endpoint"""
    print("\n🔍 Testing Backend Auth0 Config Endpoint...")
    
    base_url = os.getenv('BASE_URL', 'http://localhost:8008')
    
    try:
        response = requests.get(f"{base_url}/api/auth/auth0/config", timeout=10)
        
        if response.status_code == 200:
            config = response.json()
            print("  ✅ Auth0 config endpoint working")
            print(f"  ✅ Domain: {config.get('domain')}")
            print(f"  ✅ Client ID: {config.get('client_id')}")
            print(f"  ✅ Audience: {config.get('audience')}")
            
            # Check for the typo fix
            audience = config.get('audience')
            if audience and "https://api.viewvault.app" in audience:
                print("  ✅ Audience URL format is correct")
            elif audience and "https//api.viewvault.app" in audience:
                print("  ⚠️  Audience URL still has typo (missing colon)")
            
            return True
        else:
            print(f"  ❌ Config endpoint returned {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ Failed to test config endpoint: {e}")
        return False

def main():
    """Run all Auth0 configuration tests"""
    print("🚀 ViewVault Auth0 Configuration Test")
    print("=" * 50)
    
    tests = [
        test_environment_variables,
        test_auth0_bridge_initialization,
        test_auth0_domain_connectivity,
        test_auth0_urls,
        test_backend_auth0_config
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"  ❌ Test failed with exception: {e}")
            results.append(False)
    
    print("\n" + "=" * 50)
    print("📊 Test Results Summary")
    print("=" * 50)
    
    passed = sum(results)
    total = len(results)
    
    if passed == total:
        print(f"🎉 All tests passed! ({passed}/{total})")
        print("\n✅ Your Auth0 configuration looks good!")
        print("\n📋 Next steps:")
        print("   1. Configure email verification in Auth0 Dashboard")
        print("   2. Set up account linking Actions")
        print("   3. Test the complete authentication flow")
    else:
        print(f"⚠️  {passed}/{total} tests passed")
        print("\n❌ Please fix the failing tests before proceeding")
        print("\n📋 Check:")
        print("   1. Environment variables in secrets.env")
        print("   2. Auth0 Dashboard configuration")
        print("   3. Network connectivity")

if __name__ == "__main__":
    main()
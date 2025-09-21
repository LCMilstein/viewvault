# iOS Authentication Integration Requirements

## Overview
ViewVault now supports **dual authentication** with both Auth0 social login and traditional email/password authentication. This document provides comprehensive requirements for the iOS team to implement authentication in the mobile app.

## Authentication Methods Supported

### 1. Auth0 Social Login
- **Google** - One-click Google authentication
- **GitHub** - One-click GitHub authentication
- **Note**: Facebook and Twitter have been removed per product requirements

### 2. Traditional Authentication
- **Email/Username + Password** - Existing user accounts
- **Registration** - New user account creation

## API Endpoints

### Authentication Endpoints

#### 1. Auth0 Configuration
```
GET /api/auth/auth0/config
```
**Response:**
```json
{
  "domain": "your-auth0-domain.auth0.com",
  "client_id": "your-client-id",
  "audience": "your-api-identifier"
}
```

#### 2. Social Login Initiation
```
POST /api/auth/auth0/oauth/google
POST /api/auth/auth0/oauth/github
```
**Response:**
```json
{
  "oauth_url": "https://your-domain.auth0.com/authorize?..."
}
```

#### 3. OAuth Callback Handling
```
POST /api/auth/auth0/callback
```
**Request Body:**
```json
{
  "code": "authorization_code",
  "state": "optional_state"
}
```
**Response:**
```json
{
  "access_token": "jwt_token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": 123,
    "username": "user@example.com",
    "email": "user@example.com",
    "full_name": "User Name",
    "auth_provider": "auth0",
    "is_admin": false
  }
}
```

#### 4. Traditional Login
```
POST /api/auth/login
```
**Request Body:**
```json
{
  "username": "user@example.com",
  "password": "user_password"
}
```
**Response:**
```json
{
  "access_token": "jwt_token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": 123,
    "username": "user@example.com",
    "email": "user@example.com",
    "full_name": "User Name",
    "auth_provider": "local",
    "is_admin": false
  }
}
```

#### 5. User Registration
```
POST /api/auth/register
```
**Request Body:**
```json
{
  "username": "newuser@example.com",
  "email": "newuser@example.com",
  "password": "secure_password",
  "full_name": "New User"
}
```

#### 6. Token Validation
```
GET /api/auth/me
```
**Headers:**
```
Authorization: Bearer <jwt_token>
```

## Database Schema

### User Table
```sql
CREATE TABLE user (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    full_name TEXT,
    hashed_password TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    is_admin BOOLEAN DEFAULT 0,
    auth0_user_id TEXT UNIQUE,
    auth_provider TEXT DEFAULT "local"  -- "local" or "auth0"
);
```

### Key Points:
- **Auth0 users**: `auth0_user_id` populated, `hashed_password` empty
- **Local users**: `auth0_user_id` NULL, `hashed_password` populated
- **Username**: For Auth0 users, this is typically the email address
- **Auth Provider**: Distinguishes between "local" and "auth0" users

## JWT Token Structure

### Auth0 Users
```json
{
  "sub": "auth0|user_id",
  "email": "user@example.com",
  "name": "User Name",
  "auth_provider": "auth0",
  "exp": 1234567890,
  "iat": 1234567890
}
```

### Local Users
```json
{
  "sub": "username",
  "auth_provider": "local",
  "exp": 1234567890,
  "iat": 1234567890
}
```

## Implementation Requirements

### 1. Authentication Flow

#### Social Login Flow:
1. **Get Auth0 Config** - Call `/api/auth/auth0/config`
2. **Initiate OAuth** - Call `/api/auth/auth0/oauth/{provider}`
3. **Open Browser** - Redirect user to `oauth_url`
4. **Handle Callback** - Capture authorization code from callback
5. **Exchange Code** - Call `/api/auth/auth0/callback` with code
6. **Store Token** - Save JWT token for API calls

#### Traditional Login Flow:
1. **Collect Credentials** - Username/email and password
2. **Authenticate** - Call `/api/auth/login`
3. **Store Token** - Save JWT token for API calls

### 2. Token Management
- **Storage**: Store JWT token securely (Keychain recommended)
- **Expiration**: Check token expiration before API calls
- **Refresh**: Implement token refresh logic if needed
- **Logout**: Clear stored tokens on logout

### 3. Error Handling

#### Common Error Scenarios:
- **Network errors** - Retry with exponential backoff
- **Invalid credentials** - Show user-friendly error messages
- **Token expiration** - Redirect to login screen
- **Server errors** - Show generic error with retry option

#### Error Response Format:
```json
{
  "detail": "Error message description"
}
```

### 4. User Interface Requirements

#### Login Screen:
- **Social Login Buttons** - Google and GitHub with proper branding
- **Email/Password Form** - Traditional login fields
- **Registration Link** - For new user signup
- **Loading States** - Show progress during authentication
- **Error Messages** - Clear, actionable error feedback

#### Registration Screen:
- **Username/Email Field** - Required, email validation
- **Password Field** - Required, minimum strength requirements
- **Full Name Field** - Optional
- **Submit Button** - With loading state
- **Login Link** - Back to login screen

## Critical Implementation Notes

### 1. Race Condition Handling
The backend handles race conditions in user creation automatically. If multiple requests attempt to create the same Auth0 user simultaneously, the system will:
- Create the user on first request
- Return existing user on subsequent requests
- No action needed from iOS client

### 2. User Identification
- **Auth0 users**: Use `auth0_user_id` for unique identification
- **Local users**: Use `username` for unique identification
- **API calls**: Always include `Authorization: Bearer <token>` header

### 3. Backend Compatibility
- **Existing users**: All existing local users continue to work
- **New users**: Can choose between Auth0 social login or email/password
- **Mixed environment**: Both authentication methods work simultaneously

### 4. Security Considerations
- **HTTPS only**: All API calls must use HTTPS
- **Token security**: Store JWT tokens securely (Keychain)
- **Certificate pinning**: Consider implementing for production
- **Input validation**: Validate all user inputs before sending

## Testing Requirements

### 1. Test Cases
- **Google login** - Complete flow from initiation to token receipt
- **GitHub login** - Complete flow from initiation to token receipt
- **Email/password login** - Both valid and invalid credentials
- **User registration** - New user creation and validation
- **Token validation** - Verify token works for API calls
- **Error handling** - Network errors, invalid credentials, server errors
- **Logout** - Clear tokens and return to login screen

### 2. Test Data
- **Valid Auth0 users** - Test with real Google/GitHub accounts
- **Valid local users** - Test with existing email/password accounts
- **Invalid credentials** - Test error handling
- **Network scenarios** - Test with poor/no connectivity

## Deployment Considerations

### 1. Environment Configuration
- **Base URL**: `https://app.viewvault.app`
- **API Version**: All endpoints under `/api/`
- **HTTPS**: Required for all communications

### 2. Auth0 Configuration
- **Allowed Callback URLs**: Include your app's custom URL scheme
- **Allowed Origins**: Include your app's bundle identifier
- **Social Connections**: Ensure Google and GitHub are enabled

### 3. App Store Requirements
- **Privacy Policy**: Update to include Auth0 data collection
- **App Store Description**: Mention social login capabilities
- **Permissions**: No additional permissions required

## Troubleshooting Guide

### Common Issues and Solutions:

#### 1. "Authentication not available" Error
- **Cause**: Auth0 configuration not loaded
- **Solution**: Check network connectivity and retry

#### 2. "Invalid Auth0 token" Error
- **Cause**: Token expired or malformed
- **Solution**: Re-authenticate user

#### 3. "User already exists" Error
- **Cause**: Race condition in user creation
- **Solution**: Backend handles automatically, retry request

#### 4. OAuth Callback Not Working
- **Cause**: Incorrect callback URL configuration
- **Solution**: Verify Auth0 callback URL settings

#### 5. Token Not Working for API Calls
- **Cause**: Token not included in Authorization header
- **Solution**: Ensure `Authorization: Bearer <token>` header is present

## Support and Maintenance

### 1. Monitoring
- **Authentication success rate** - Track login success/failure rates
- **Error rates** - Monitor authentication error frequencies
- **User preferences** - Track which auth method users prefer

### 2. Updates
- **Backend changes** - Monitor for API changes
- **Auth0 updates** - Stay updated on Auth0 SDK changes
- **Security patches** - Apply security updates promptly

### 3. User Support
- **Common issues** - Document frequent user problems
- **Recovery procedures** - Steps to recover from auth failures
- **Contact information** - Provide support contact details

## Additional Resources

### 1. Documentation
- **Auth0 iOS SDK**: https://auth0.com/docs/quickstart/native/ios
- **JWT Handling**: https://jwt.io/introduction
- **Keychain Services**: https://developer.apple.com/documentation/security/keychain_services

### 2. Sample Code
- **Auth0 iOS Sample**: Available in Auth0 documentation
- **JWT Validation**: Use Auth0's JWT validation libraries
- **Keychain Storage**: Use iOS Keychain Services for secure storage

### 3. Testing Tools
- **Postman Collection**: Available for API testing
- **Auth0 Dashboard**: For monitoring and configuration
- **iOS Simulator**: For testing authentication flows

---

**Last Updated**: September 18, 2024  
**Version**: 1.0  
**Contact**: Development Team


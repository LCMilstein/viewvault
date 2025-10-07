# Force Email Verification with Auth0 Actions

## Issue
Email verification is configured but not being enforced during registration.

## Solution: Use Actions to Force Email Verification

### Step 1: Create Post User Registration Action

1. **Go to Auth0 Dashboard** → **Actions** → **Flows**
2. **Click "Post User Registration"**
3. **Click "+" to add new action**
4. **Name**: `Force Email Verification`
5. **Runtime**: `Node.js 18`

### Step 2: Action Code

```javascript
/**
 * Handler that will be called during the execution of a PostUserRegistration flow.
 * @param {Event} event - Details about the context and user that has registered.
 * @param {PostUserRegistrationAPI} api - Interface whose methods can be used to change the behavior of the registration.
 */
exports.onExecutePostUserRegistration = async (event, api) => {
  const { user, connection } = event;
  
  console.log(`Post registration for user: ${user.email}, connection: ${connection.name}`);
  
  // Only handle email/password registrations
  if (connection.name !== 'Username-Password-Authentication') {
    console.log('Skipping - not email/password registration');
    return;
  }
  
  // Check if user already has verified email
  if (user.email_verified) {
    console.log('Email already verified, skipping');
    return;
  }
  
  const ManagementClient = require('auth0').ManagementClient;
  
  const management = new ManagementClient({
    domain: event.secrets.AUTH0_DOMAIN,
    clientId: event.secrets.AUTH0_CLIENT_ID,
    clientSecret: event.secrets.AUTH0_CLIENT_SECRET,
    scope: 'update:users'
  });
  
  try {
    console.log('Sending email verification...');
    
    // Send email verification
    await management.sendEmailVerification({
      user_id: user.user_id,
      client_id: event.secrets.AUTH0_CLIENT_ID
    });
    
    console.log(`✅ Email verification sent to ${user.email}`);
    
    // Block the user until email is verified
    await management.updateUser(
      { id: user.user_id },
      { 
        blocked: true,
        user_metadata: {
          email_verification_required: true,
          blocked_reason: 'Email verification required',
          registration_date: new Date().toISOString()
        }
      }
    );
    
    console.log(`🚫 User ${user.user_id} blocked until email verification`);
    
  } catch (error) {
    console.error('❌ Error in email verification flow:', error);
  }
};
```

### Step 3: Create Post Login Action (to unblock verified users)

1. **Go to Actions** → **Flows** → **Post Login**
2. **Create new action**: `Unblock Verified Users`

```javascript
/**
 * Handler that will be called during the execution of a PostLogin flow.
 * @param {Event} event - Details about the context and user that is attempting to login.
 * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
 */
exports.onExecutePostLogin = async (event, api) => {
  const { user } = event;
  
  console.log(`Post login for user: ${user.email}, email_verified: ${user.email_verified}, blocked: ${user.blocked}`);
  
  // Only check email/password users
  if (!user.user_id.startsWith('auth0|')) {
    return;
  }
  
  // If user has verified email but is still blocked for email verification, unblock them
  if (user.email_verified && user.blocked && user.user_metadata?.email_verification_required) {
    const ManagementClient = require('auth0').ManagementClient;
    
    const management = new ManagementClient({
      domain: event.secrets.AUTH0_DOMAIN,
      clientId: event.secrets.AUTH0_CLIENT_ID,
      clientSecret: event.secrets.AUTH0_CLIENT_SECRET,
      scope: 'update:users'
    });
    
    try {
      console.log('Unblocking verified user...');
      
      // Unblock the user
      await management.updateUser(
        { id: user.user_id },
        { 
          blocked: false,
          user_metadata: {
            ...user.user_metadata,
            email_verification_required: false,
            email_verified_date: new Date().toISOString()
          }
        }
      );
      
      console.log(`✅ User ${user.user_id} unblocked after email verification`);
      
    } catch (error) {
      console.error('❌ Error unblocking verified user:', error);
    }
  }
  
  // If user hasn't verified email, deny login
  if (!user.email_verified && user.user_id.startsWith('auth0|')) {
    console.log('❌ Denying login - email not verified');
    api.access.deny('Please verify your email address before logging in. Check your inbox for a verification email.');
  }
};
```

### Step 4: Configure Secrets for Both Actions

Add these secrets to both actions:
```
AUTH0_DOMAIN: dev-a6z1zwjm1wj3xpjg.us.auth0.com
AUTH0_CLIENT_ID: 6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw
AUTH0_CLIENT_SECRET: your-client-secret
```

### Step 5: Add Dependencies

For both actions, add:
```
auth0: 3.7.0
```

### Step 6: Deploy and Apply

1. **Deploy both actions**
2. **Add to their respective flows**
3. **Apply the flows**

## Expected Behavior

- ✅ User registers with email/password
- ✅ Account is created but blocked
- ✅ Verification email is sent
- ✅ User tries to log in → Gets "verify email" message
- ✅ User clicks verification link
- ✅ User can now log in successfully

## Testing

1. **Delete the test user** you just created (if possible)
2. **Try registration again** with the Actions in place
3. **Verify the blocking/unblocking flow works**
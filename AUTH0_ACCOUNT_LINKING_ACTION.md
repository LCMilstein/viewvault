# Auth0 Account Linking Action Setup

## Issue
When users sign up with OAuth (Google/GitHub) and then try to use email/password with the same email, it creates separate accounts instead of linking them.

## Solution: Auth0 Pre User Registration Action

### Step 1: Create Account Linking Action

1. **Go to Auth0 Dashboard** → **Actions** → **Flows**
2. **Click on "Pre User Registration"**
3. **Click "+" to add a new action**
4. **Choose "Build from scratch"**
5. **Name**: `Account Linking`
6. **Runtime**: `Node.js 18`

### Step 2: Action Code

```javascript
/**
 * Handler that will be called during the execution of a PreUserRegistration flow.
 * @param {Event} event - Details about the context and user that is attempting to register.
 * @param {PreUserRegistrationAPI} api - Interface whose methods can be used to change the behavior of the registration.
 */
exports.onExecutePreUserRegistration = async (event, api) => {
  const { user, connection } = event;
  
  // Only handle email/password registrations
  if (connection.name !== 'Username-Password-Authentication') {
    return;
  }
  
  // Check if user already exists with OAuth
  const ManagementClient = require('auth0').ManagementClient;
  
  const management = new ManagementClient({
    domain: event.secrets.AUTH0_DOMAIN,
    clientId: event.secrets.AUTH0_CLIENT_ID,
    clientSecret: event.secrets.AUTH0_CLIENT_SECRET,
    scope: 'read:users update:users'
  });
  
  try {
    // Search for existing users with the same email
    const existingUsers = await management.getUsersByEmail(user.email);
    
    // Filter out the current registration attempt
    const otherUsers = existingUsers.filter(u => u.user_id !== user.user_id);
    
    if (otherUsers.length > 0) {
      const existingUser = otherUsers[0];
      
      // Check if existing user is from OAuth provider
      const isOAuthUser = existingUser.user_id.startsWith('google-oauth2|') || 
                         existingUser.user_id.startsWith('github|') ||
                         existingUser.user_id.startsWith('facebook|');
      
      if (isOAuthUser) {
        // Send verification email for account linking
        api.access.deny('account_linking_required', 
          'An account with this email already exists. Please check your email for verification instructions to link your accounts.');
        
        // Trigger email verification flow
        await management.sendEmailVerification({
          user_id: existingUser.user_id,
          client_id: event.secrets.AUTH0_CLIENT_ID
        });
        
        return;
      }
    }
  } catch (error) {
    console.log('Error checking for existing users:', error);
    // Continue with normal registration if there's an error
  }
};
```

### Step 3: Configure Action Secrets

1. **In the Action editor**, go to **Settings** → **Secrets**
2. **Add these secrets**:
   ```
   AUTH0_DOMAIN: your-domain.auth0.com
   AUTH0_CLIENT_ID: your-client-id
   AUTH0_CLIENT_SECRET: your-client-secret
   ```

### Step 4: Add Dependencies

1. **In the Action editor**, go to **Settings** → **Dependencies**
2. **Add dependency**:
   ```
   auth0: 3.7.0
   ```

### Step 5: Deploy and Add to Flow

1. **Click "Deploy"**
2. **Go back to Pre User Registration flow**
3. **Drag your action** from the right panel to the flow
4. **Click "Apply"**

## Alternative: Post User Registration Action

If you prefer to link accounts after registration, create a **Post User Registration** action:

```javascript
exports.onExecutePostUserRegistration = async (event, api) => {
  const { user, connection } = event;
  
  // Only handle email/password registrations
  if (connection.name !== 'Username-Password-Authentication') {
    return;
  }
  
  const ManagementClient = require('auth0').ManagementClient;
  
  const management = new ManagementClient({
    domain: event.secrets.AUTH0_DOMAIN,
    clientId: event.secrets.AUTH0_CLIENT_ID,
    clientSecret: event.secrets.AUTH0_CLIENT_SECRET,
    scope: 'read:users update:users'
  });
  
  try {
    // Search for existing OAuth users with the same email
    const existingUsers = await management.getUsersByEmail(user.email);
    
    const oauthUsers = existingUsers.filter(u => 
      u.user_id !== user.user_id && 
      (u.user_id.startsWith('google-oauth2|') || 
       u.user_id.startsWith('github|') ||
       u.user_id.startsWith('facebook|'))
    );
    
    if (oauthUsers.length > 0) {
      const primaryUser = oauthUsers[0];
      
      // Link the new email/password account to the existing OAuth account
      await management.linkUsers(primaryUser.user_id, {
        user_id: user.user_id,
        connection_id: connection.id
      });
      
      console.log(`Linked ${user.user_id} to ${primaryUser.user_id}`);
    }
  } catch (error) {
    console.log('Error linking accounts:', error);
  }
};
```

## Expected Behavior After Setup

- ✅ User signs up with Google → Account created
- ✅ Same user tries email/password → Gets verification email
- ✅ User verifies email → Accounts are linked
- ✅ User can log in with either Google or email/password
- ✅ Only one account exists per email address

## Testing

1. **Sign up with Google** using test email
2. **Try to register with email/password** using same email
3. **Verify you get account linking message**
4. **Check that accounts are properly linked**
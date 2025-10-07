# Auth0 Email Verification Setup Guide

## Issue
Users can register with email/password without email verification being sent.

## Solution: Configure Auth0 Email Verification

### Step 1: Enable Email Verification in Auth0 Dashboard

1. **Go to Auth0 Dashboard** → **Authentication** → **Database**
2. **Click on "Username-Password-Authentication"** (your database connection)
3. **Go to Settings tab**
4. **Enable "Requires Email Verification"**
5. **Save Changes**

### Step 2: Configure Email Provider

1. **Go to Auth0 Dashboard** → **Branding** → **Email Provider**
2. **Choose your email provider** (SendGrid, Mailgun, etc.)
3. **Configure SMTP settings** or **API credentials**
4. **Test the connection**

### Step 3: Customize Email Templates

1. **Go to Auth0 Dashboard** → **Branding** → **Email Templates**
2. **Select "Verification Email (using Link)"**
3. **Customize the template**:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Verify your ViewVault account</title>
</head>
<body>
    <h2>Welcome to ViewVault!</h2>
    <p>Hi {{user.name || user.email}},</p>
    
    <p>Thanks for signing up for ViewVault! To complete your registration, please verify your email address by clicking the link below:</p>
    
    <p><a href="{{url}}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email Address</a></p>
    
    <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
    <p>{{url}}</p>
    
    <p>This link will expire in 24 hours.</p>
    
    <p>If you didn't create a ViewVault account, you can safely ignore this email.</p>
    
    <p>Thanks,<br>The ViewVault Team</p>
</body>
</html>
```

4. **Set the subject**: "Verify your ViewVault account"
5. **Save the template**

### Step 4: Configure Redirect URLs

1. **Go to Auth0 Dashboard** → **Applications** → **Your App** → **Settings**
2. **Add to "Allowed Callback URLs"**:
   ```
   https://app.viewvault.app/auth0/callback,
   https://app.viewvault.app/email-verified
   ```
3. **Save Changes**

### Step 5: Test Email Verification

1. **Try to register** with a new email/password
2. **Check that verification email is sent**
3. **Click the verification link**
4. **Verify user can then log in**

## Expected Behavior After Setup

- ✅ User registers with email/password
- ✅ Verification email is sent immediately
- ✅ User must click verification link before they can log in
- ✅ Unverified users cannot access the application

## Troubleshooting

### Email Not Sending
1. Check email provider configuration
2. Verify SMTP credentials or API keys
3. Check Auth0 logs for email delivery errors

### Test Button Not Working
This is a known Auth0 issue. The verification works in production even if the test button fails.

### Wrong Redirect After Verification
Make sure the redirect URL is added to your Auth0 application settings.
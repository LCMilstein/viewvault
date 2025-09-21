# Auth0 Asset Upload and Branding Guide

## Overview
This guide explains how to upload assets to Auth0 and work with the development team to redesign the authentication pages.

## Auth0 Dashboard Access

### 1. Login to Auth0 Dashboard
- **URL**: https://manage.auth0.com/
- **Credentials**: Use your Auth0 account credentials
- **Tenant**: Select your ViewVault tenant

### 2. Navigate to Branding Section
- **Path**: Dashboard → Branding → Universal Login
- **Alternative**: Dashboard → Branding → Lock

## Asset Upload Process

### 1. Logo Upload
- **Location**: Branding → Universal Login → Logo
- **Supported Formats**: PNG, JPG, SVG
- **Recommended Size**: 150x150px minimum
- **File Size**: Max 1MB
- **Background**: Transparent PNG recommended

### 2. Favicon Upload
- **Location**: Branding → Universal Login → Favicon
- **Supported Formats**: ICO, PNG
- **Recommended Size**: 32x32px
- **File Size**: Max 1MB

### 3. Background Image Upload
- **Location**: Branding → Universal Login → Background
- **Supported Formats**: JPG, PNG
- **Recommended Size**: 1920x1080px
- **File Size**: Max 2MB
- **Aspect Ratio**: 16:9 recommended

## Custom CSS Styling

### 1. Access Custom CSS
- **Location**: Branding → Universal Login → Advanced Options
- **Section**: Custom CSS
- **Note**: CSS is applied to the Auth0-hosted login page

### 2. CSS Customization Options
```css
/* Main container */
.auth0-lock {
  font-family: 'Your Font', sans-serif;
}

/* Logo styling */
.auth0-lock-header-logo {
  max-height: 60px;
  width: auto;
}

/* Button styling */
.auth0-lock .auth0-lock-submit {
  background-color: #667eea;
  border-radius: 8px;
}

/* Form styling */
.auth0-lock .auth0-lock-input-wrap {
  border-radius: 8px;
}

/* Social login buttons */
.auth0-lock .auth0-lock-social-button {
  border-radius: 8px;
  margin-bottom: 12px;
}
```

### 3. Color Scheme
- **Primary Color**: #667eea (ViewVault blue)
- **Secondary Color**: #764ba2 (ViewVault purple)
- **Text Color**: #333333
- **Background**: #ffffff
- **Error Color**: #e74c3c

## Working with Development Team

### 1. Design Collaboration Process

#### Step 1: Share Design Mockups
- **Tools**: Figma, Sketch, or Adobe XD
- **Format**: PNG/JPG for review, source files for implementation
- **Include**: All screen states (login, error, loading, success)

#### Step 2: Review Technical Constraints
- **Auth0 Limitations**: Some customizations may not be possible
- **Responsive Design**: Ensure mobile compatibility
- **Loading States**: Consider authentication flow timing

#### Step 3: Implementation Planning
- **CSS Customization**: What can be done with CSS
- **Asset Requirements**: Specific sizes and formats needed
- **Testing**: How to test changes in different environments

### 2. Design Requirements

#### Login Page Elements:
- **Header Logo**: ViewVault branding
- **Social Login Buttons**: Google and GitHub only
- **Email/Password Form**: Clean, modern design
- **Error Messages**: Clear, actionable feedback
- **Loading States**: Smooth transitions

#### Visual Guidelines:
- **Typography**: Clean, readable fonts
- **Spacing**: Consistent padding and margins
- **Colors**: ViewVault brand colors
- **Icons**: Consistent icon style
- **Buttons**: Rounded corners, hover effects

### 3. Asset Specifications

#### Logo Requirements:
- **Format**: PNG with transparent background
- **Size**: 150x150px minimum
- **File Size**: Under 1MB
- **Quality**: High resolution for retina displays

#### Social Login Icons:
- **Google**: Use official Google branding guidelines
- **GitHub**: Use official GitHub branding guidelines
- **Size**: 20x20px for icons
- **Style**: Consistent with overall design

#### Background Images:
- **Format**: JPG or PNG
- **Size**: 1920x1080px
- **File Size**: Under 2MB
- **Style**: Subtle, not distracting from form

## Testing and Validation

### 1. Preview Changes
- **Auth0 Dashboard**: Use preview feature
- **Test Accounts**: Use test Google/GitHub accounts
- **Multiple Devices**: Test on desktop and mobile
- **Browsers**: Test on Chrome, Firefox, Safari

### 2. Common Issues and Solutions

#### Issue: Logo Not Displaying
- **Cause**: File size too large or wrong format
- **Solution**: Compress image and use PNG format

#### Issue: CSS Not Applying
- **Cause**: Syntax errors or unsupported properties
- **Solution**: Validate CSS and check Auth0 documentation

#### Issue: Social Buttons Not Styled
- **Cause**: Auth0 overrides custom CSS
- **Solution**: Use more specific CSS selectors

### 3. Performance Considerations
- **Image Optimization**: Compress all images
- **CSS Minification**: Remove unnecessary whitespace
- **Loading Speed**: Test page load times
- **Mobile Performance**: Ensure mobile compatibility

## Deployment Process

### 1. Staging Environment
- **Test Changes**: Apply changes to staging first
- **User Testing**: Get feedback from team members
- **Bug Fixes**: Address any issues found
- **Final Review**: Approve changes before production

### 2. Production Deployment
- **Backup Current**: Save current configuration
- **Apply Changes**: Upload new assets and CSS
- **Test Live**: Verify changes work in production
- **Monitor**: Watch for any issues

### 3. Rollback Plan
- **Backup**: Keep previous configuration
- **Quick Rollback**: Know how to revert changes
- **Communication**: Notify team of any issues

## Best Practices

### 1. Design Principles
- **Consistency**: Match ViewVault brand guidelines
- **Accessibility**: Ensure good contrast and readability
- **Simplicity**: Keep design clean and uncluttered
- **Mobile-First**: Design for mobile, enhance for desktop

### 2. Technical Best Practices
- **Optimize Images**: Compress without losing quality
- **Validate CSS**: Check for syntax errors
- **Test Thoroughly**: Test on multiple devices and browsers
- **Document Changes**: Keep track of what was changed

### 3. User Experience
- **Clear CTAs**: Make buttons and links obvious
- **Error Handling**: Provide helpful error messages
- **Loading States**: Show progress during authentication
- **Success Feedback**: Confirm successful actions

## Contact Information

### Development Team
- **Primary Contact**: Development Team Lead
- **Email**: [Your Email]
- **Slack**: #development-team
- **Response Time**: Within 24 hours

### Auth0 Support
- **Documentation**: https://auth0.com/docs
- **Community**: https://community.auth0.com/
- **Support**: Available through Auth0 dashboard

## Resources

### 1. Auth0 Documentation
- **Universal Login**: https://auth0.com/docs/universal-login
- **Custom CSS**: https://auth0.com/docs/universal-login/customize-login-page
- **Branding**: https://auth0.com/docs/universal-login/customize-login-page

### 2. Design Tools
- **Figma**: https://figma.com (recommended)
- **Sketch**: https://sketch.com
- **Adobe XD**: https://adobe.com/products/xd

### 3. Image Optimization
- **TinyPNG**: https://tinypng.com
- **Squoosh**: https://squoosh.app
- **ImageOptim**: https://imageoptim.com

---

**Last Updated**: September 18, 2024  
**Version**: 1.0  
**Next Review**: October 18, 2024


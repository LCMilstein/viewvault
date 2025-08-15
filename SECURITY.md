# Security Features

This document outlines the security measures implemented in the CineSync application.

## 🔐 Authentication & Authorization

### User Authentication
- **JWT Token-based Authentication**: Uses JSON Web Tokens for secure session management
- **Password Hashing**: Passwords are hashed using bcrypt with salt
- **Token Expiration**: Access tokens expire after 30 minutes for security
- **Secure Password Storage**: Passwords are never stored in plain text

### User Registration & Login
- **Registration Endpoint**: `/api/auth/register` - Creates new user accounts
- **Login Endpoint**: `/api/auth/login` - Authenticates users and returns JWT tokens
- **First User Admin**: The first registered user automatically becomes an admin
- **User Info Endpoint**: `/api/auth/me` - Returns current user information

### Authorization Levels
- **Regular Users**: Can view and manage their watchlist
- **Admin Users**: Can access admin functions like clearing all data

## 🛡️ API Security

### Rate Limiting
- **Search Endpoints**: 30 requests per minute
- **Login Endpoint**: 10 requests per minute
- **Registration Endpoint**: 5 requests per minute
- **Admin Endpoints**: 1 request per minute

### Input Validation
- **Request Validation**: All API inputs are validated using Pydantic models
- **SQL Injection Protection**: Uses SQLModel ORM with parameterized queries
- **XSS Protection**: Input sanitization and proper content-type headers

### CORS Configuration
- **Cross-Origin Requests**: Configured for frontend-backend communication
- **Credentials Support**: Enabled for authentication tokens

## 🔒 Data Protection

### Database Security
- **SQLite Database**: Local file-based storage with proper permissions
- **Data Validation**: All database operations use validated models
- **Transaction Safety**: Database operations use proper transactions

### API Key Management
- **Environment Variables**: API keys stored in environment variables
- **Secure Storage**: Keys not exposed in code or logs
- **Optional Keys**: Application works with or without external API keys

## 🚨 Security Headers

### HTTP Security Headers
- **Content-Type**: Proper content-type headers for all responses
- **Authorization**: Bearer token authentication for protected endpoints
- **CORS Headers**: Configured for secure cross-origin requests

## 🔧 Security Configuration

### Environment Variables
```bash
# Required for JWT token signing
SECRET_KEY=your-super-secret-key-change-this-in-production

# Optional external API keys
IMDB_API_KEY=your_imdb_api_key_here
TMDB_API_KEY=your_tmdb_api_key_here
```

### Production Security Checklist
- [ ] Change default `SECRET_KEY` to a strong, unique value
- [ ] Use HTTPS in production
- [ ] Configure proper CORS origins for your domain
- [ ] Set up proper firewall rules
- [ ] Regular security updates
- [ ] Monitor application logs
- [ ] Backup database regularly

## 🚪 Access Control

### Protected Endpoints
All data management endpoints require authentication:
- `GET /api/movies/` - List movies
- `POST /api/movies/` - Add movie
- `PUT /api/movies/{id}` - Update movie
- `DELETE /api/movies/{id}` - Delete movie
- `PATCH /api/movies/{id}/watched` - Toggle watched status
- All series and episode endpoints
- All import endpoints

### Admin-Only Endpoints
- `POST /api/admin/clear_all` - Clear all data (admin only)

### Public Endpoints
- `GET /` - Main application page
- `GET /login` - Login page
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/` - API information

## 🔍 Security Monitoring

### Logging
- Authentication attempts are logged
- Rate limit violations are tracked
- Error responses include minimal information

### Error Handling
- Generic error messages to prevent information disclosure
- Proper HTTP status codes
- No sensitive data in error responses

## 📋 Security Best Practices

1. **Strong Passwords**: Encourage users to use strong passwords
2. **Regular Updates**: Keep dependencies updated
3. **Token Management**: Tokens expire automatically
4. **Input Sanitization**: All user inputs are validated
5. **Principle of Least Privilege**: Users only access their own data
6. **Secure Headers**: Proper HTTP security headers
7. **Rate Limiting**: Prevents abuse and brute force attacks

## 🆘 Security Incident Response

If you discover a security vulnerability:

1. **Immediate Actions**:
   - Change the `SECRET_KEY` immediately
   - Review application logs
   - Check for unauthorized access

2. **Investigation**:
   - Monitor for suspicious activity
   - Review user accounts
   - Check database integrity

3. **Recovery**:
   - Restore from backup if necessary
   - Update security configurations
   - Notify users if required

## 🔄 Security Updates

This application follows security best practices and should be updated regularly:

- Keep Python dependencies updated
- Monitor security advisories
- Update Docker images regularly
- Review and update security configurations 
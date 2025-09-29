"""
Email verification service for ViewVault
Handles sending verification codes and validating them
"""

import os
import smtplib
import secrets
import logging
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from sqlmodel import Session, select
from models import EmailVerification, User
from database import engine

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_username = os.getenv('SMTP_USERNAME')
        self.smtp_password = os.getenv('SMTP_PASSWORD')
        self.from_email = os.getenv('FROM_EMAIL', 'noreply@viewvault.app')
        self.app_name = "ViewVault"
        
        self.is_configured = bool(
            self.smtp_username and 
            self.smtp_password and 
            self.from_email
        )
        
        if not self.is_configured:
            logger.warning("Email service not configured - verification codes will be logged instead of sent")
    
    def generate_verification_code(self) -> str:
        """Generate a 6-digit verification code"""
        return str(secrets.randbelow(900000) + 100000)
    
    def send_verification_email(self, email: str, code: str, purpose: str) -> bool:
        """Send verification email with code"""
        if not self.is_configured:
            logger.info(f"EMAIL VERIFICATION: Code for {email} ({purpose}): {code}")
            return True
        
        try:
            # Create message
            msg = MIMEMultipart()
            msg['From'] = self.from_email
            msg['To'] = email
            msg['Subject'] = f"{self.app_name} Email Verification"
            
            # Email body based on purpose
            if purpose == "registration":
                subject_text = "Verify your email address"
                body_text = f"""
Welcome to {self.app_name}!

Please enter this verification code to complete your registration:

{code}

This code will expire in 10 minutes.

If you didn't create an account with {self.app_name}, please ignore this email.

Best regards,
The {self.app_name} Team
"""
            elif purpose == "add_password":
                subject_text = "Add password to your account"
                body_text = f"""
You requested to add a password to your {self.app_name} account.

Please enter this verification code to add password authentication:

{code}

This code will expire in 10 minutes.

If you didn't request this, please ignore this email.

Best regards,
The {self.app_name} Team
"""
            else:
                subject_text = "Verify your email address"
                body_text = f"""
Please enter this verification code to verify your email address:

{code}

This code will expire in 10 minutes.

Best regards,
The {self.app_name} Team
"""
            
            msg.attach(MIMEText(body_text, 'plain'))
            
            # Send email
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.smtp_username, self.smtp_password)
            text = msg.as_string()
            server.sendmail(self.from_email, email, text)
            server.quit()
            
            logger.info(f"Verification email sent to {email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send verification email to {email}: {e}")
            return False
    
    def create_verification_record(self, email: str, purpose: str) -> str:
        """Create verification record and send email"""
        code = self.generate_verification_code()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
        
        with Session(engine) as session:
            # Invalidate any existing codes for this email/purpose
            existing = session.exec(
                select(EmailVerification).where(
                    EmailVerification.email == email,
                    EmailVerification.purpose == purpose,
                    EmailVerification.used == False
                )
            ).all()
            
            for record in existing:
                record.used = True
                session.add(record)
            
            # Create new verification record
            verification = EmailVerification(
                email=email,
                verification_code=code,
                expires_at=expires_at,
                purpose=purpose
            )
            session.add(verification)
            session.commit()
            
            # Send email
            if self.send_verification_email(email, code, purpose):
                return code
            else:
                # If email failed, still return code for development
                logger.warning(f"Email sending failed, but code generated: {code}")
                return code
    
    def verify_code(self, email: str, code: str, purpose: str) -> bool:
        """Verify email verification code"""
        with Session(engine) as session:
            verification = session.exec(
                select(EmailVerification).where(
                    EmailVerification.email == email,
                    EmailVerification.verification_code == code,
                    EmailVerification.purpose == purpose,
                    EmailVerification.used == False,
                    EmailVerification.expires_at > datetime.now(timezone.utc)
                )
            ).first()
            
            if verification:
                verification.used = True
                session.add(verification)
                session.commit()
                return True
            
            return False

# Global instance
email_service = EmailService()

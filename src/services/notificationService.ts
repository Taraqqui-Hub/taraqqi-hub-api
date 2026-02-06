/**
 * Notification Service
 * Professional Email and In-App notifications with legal compliance
 */

import { eq, and, isNull, desc, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db } from "../config/database.ts";
import { addEmailJob, addInAppNotification } from "./queueService.ts";

// ============================================
// Email Configuration
// ============================================

const transporter = nodemailer.createTransport({
	host: process.env.SMTP_HOST || "smtp.gmail.com",
	port: parseInt(process.env.SMTP_PORT || "587"),
	secure: process.env.SMTP_SECURE === "true",
	auth: {
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS,
	},
});

const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@taraqqihub.com";
const FROM_NAME = process.env.FROM_NAME || "Taraqqi Hub";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@taraqqihub.com";
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || "Taraqqi Hub Technologies Pvt. Ltd., India";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// ============================================
// Base Email Template (Professional Design)
// ============================================

const getBaseTemplate = (content: string, preheader: string = "") => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Taraqqi Hub</title>
  <style>
    /* Reset styles */
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    
    /* Base styles */
    body {
      margin: 0;
      padding: 0;
      width: 100%;
      background-color: #f4f6f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1a1a2e;
    }
    
    .email-wrapper {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    
    .email-header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      padding: 32px 40px;
      text-align: center;
    }
    
    .logo {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      text-decoration: none;
      letter-spacing: -0.5px;
    }
    
    .logo span {
      color: #4ade80;
    }
    
    .email-body {
      padding: 40px;
      background-color: #ffffff;
    }
    
    .email-content h1 {
      font-size: 24px;
      font-weight: 600;
      color: #1a1a2e;
      margin: 0 0 16px 0;
      line-height: 1.3;
    }
    
    .email-content p {
      font-size: 16px;
      color: #4a5568;
      margin: 0 0 16px 0;
      line-height: 1.7;
    }
    
    .email-content .greeting {
      font-size: 16px;
      color: #1a1a2e;
      margin-bottom: 24px;
    }
    
    .btn {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
      margin: 24px 0;
      box-shadow: 0 4px 14px rgba(74, 222, 128, 0.25);
    }
    
    .btn:hover {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    }
    
    .btn-secondary {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      box-shadow: 0 4px 14px rgba(26, 26, 46, 0.15);
    }
    
    .info-box {
      background-color: #f8fafc;
      border-left: 4px solid #4ade80;
      padding: 16px 20px;
      margin: 24px 0;
      border-radius: 0 8px 8px 0;
    }
    
    .info-box p {
      margin: 0;
      font-size: 14px;
    }
    
    .warning-box {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px 20px;
      margin: 24px 0;
      border-radius: 0 8px 8px 0;
    }
    
    .warning-box p {
      margin: 0;
      font-size: 14px;
      color: #92400e;
    }
    
    .error-box {
      background-color: #fee2e2;
      border-left: 4px solid #ef4444;
      padding: 16px 20px;
      margin: 24px 0;
      border-radius: 0 8px 8px 0;
    }
    
    .error-box p {
      margin: 0;
      font-size: 14px;
      color: #991b1b;
    }
    
    .success-box {
      background-color: #dcfce7;
      border-left: 4px solid #22c55e;
      padding: 16px 20px;
      margin: 24px 0;
      border-radius: 0 8px 8px 0;
    }
    
    .success-box p {
      margin: 0;
      font-size: 14px;
      color: #166534;
    }
    
    .code-box {
      background-color: #1a1a2e;
      color: #ffffff;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 8px;
      text-align: center;
      padding: 20px 32px;
      border-radius: 8px;
      margin: 24px 0;
    }
    
    .details-table {
      width: 100%;
      margin: 24px 0;
      border-collapse: collapse;
    }
    
    .details-table td {
      padding: 12px 0;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
    }
    
    .details-table td:first-child {
      color: #64748b;
      width: 40%;
    }
    
    .details-table td:last-child {
      color: #1a1a2e;
      font-weight: 500;
    }
    
    .steps-list {
      margin: 24px 0;
      padding-left: 0;
      list-style: none;
    }
    
    .steps-list li {
      position: relative;
      padding: 12px 0 12px 40px;
      font-size: 15px;
      color: #4a5568;
      border-bottom: 1px solid #f1f5f9;
    }
    
    .steps-list li:before {
      content: attr(data-step);
      position: absolute;
      left: 0;
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
      color: #ffffff;
      border-radius: 50%;
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      line-height: 28px;
    }
    
    .email-footer {
      background-color: #f8fafc;
      padding: 32px 40px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    
    .footer-links {
      margin-bottom: 20px;
    }
    
    .footer-links a {
      color: #64748b;
      text-decoration: none;
      font-size: 13px;
      margin: 0 12px;
    }
    
    .footer-links a:hover {
      color: #4ade80;
    }
    
    .footer-text {
      font-size: 12px;
      color: #94a3b8;
      margin: 8px 0;
      line-height: 1.6;
    }
    
    .footer-legal {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      line-height: 1.6;
    }
    
    .security-notice {
      font-size: 12px;
      color: #64748b;
      margin-top: 24px;
      padding: 16px;
      background-color: #f8fafc;
      border-radius: 8px;
      text-align: center;
    }
    
    .security-notice a {
      color: #ef4444;
      text-decoration: underline;
    }
    
    /* Mobile responsive */
    @media only screen and (max-width: 600px) {
      .email-wrapper {
        width: 100% !important;
      }
      .email-header, .email-body, .email-footer {
        padding: 24px 20px !important;
      }
      .email-content h1 {
        font-size: 20px !important;
      }
      .btn {
        display: block;
        width: 100%;
        box-sizing: border-box;
      }
      .code-box {
        font-size: 24px;
        letter-spacing: 4px;
      }
    }
  </style>
</head>
<body>
  <!-- Preheader text (hidden preview text) -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${preheader}
  </div>
  
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6f9;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" class="email-wrapper" cellpadding="0" cellspacing="0">
          <!-- Header -->
          <tr>
            <td class="email-header">
              <a href="${FRONTEND_URL}" class="logo">Taraqqi<span>Hub</span></a>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td class="email-body">
              <div class="email-content">
                ${content}
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td class="email-footer">
              <div class="footer-links">
                <a href="${FRONTEND_URL}/help">Help Center</a>
                <a href="${FRONTEND_URL}/privacy">Privacy Policy</a>
                <a href="${FRONTEND_URL}/terms">Terms of Service</a>
              </div>
              <p class="footer-text">
                Need help? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #4ade80;">${SUPPORT_EMAIL}</a>
              </p>
              <div class="footer-legal">
                <p style="margin: 0;">© ${new Date().getFullYear()} Taraqqi Hub. All rights reserved.</p>
                <p style="margin: 4px 0 0 0;">${COMPANY_ADDRESS}</p>
                <p style="margin: 12px 0 0 0;">
                  You received this email because you have an account with Taraqqi Hub.
                  <br>
                  <a href="${FRONTEND_URL}/unsubscribe" style="color: #64748b;">Unsubscribe</a> from non-essential emails.
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ============================================
// Email Templates
// ============================================

const emailTemplates: Record<string, (data: any) => { subject: string; html: string }> = {
	// ============================================
	// Registration & Verification
	// ============================================
	
	registration_success: (data) => ({
		subject: "Welcome to Taraqqi Hub - Let's Get Started",
		html: getBaseTemplate(`
			<h1>Welcome to Taraqqi Hub!</h1>
			<p class="greeting">Dear ${data.userName || "User"},</p>
			<p>Thank you for joining Taraqqi Hub - your trusted platform for connecting talent with opportunities.</p>
			
			<p>To get started, please verify your email address and complete your profile:</p>
			
			<a href="${FRONTEND_URL}/verify-email?token=${data.verificationToken}" class="btn">Verify Your Email</a>
			
			<ul class="steps-list">
				<li data-step="1">Verify your email address</li>
				<li data-step="2">Complete your profile information</li>
				<li data-step="3">Submit verification documents (KYC)</li>
			</ul>
			
			<div class="info-box">
				<p><strong>Note:</strong> Verification typically takes 1-3 business days. You'll receive an email once approved.</p>
			</div>
			
			<div class="security-notice">
				🔒 This link expires in 24 hours for your security.<br>
				If you didn't create this account, please <a href="mailto:${SUPPORT_EMAIL}">contact us immediately</a>.
			</div>
		`, "Welcome! Verify your email to get started."),
	}),

	email_verification: (data) => ({
		subject: "Verify Your Email - Taraqqi Hub",
		html: getBaseTemplate(`
			<h1>Verify Your Email Address</h1>
			<p class="greeting">Dear ${data.userName || "User"},</p>
			<p>Please click the button below to verify your email address and activate your account.</p>
			
			<a href="${FRONTEND_URL}/verify-email?token=${data.verificationToken}" class="btn">Verify Email Address</a>
			
			<div class="warning-box">
				<p>⏰ This verification link expires in <strong>24 hours</strong>.</p>
			</div>
			
			<div class="security-notice">
				🔒 If you didn't request this verification, please ignore this email.<br>
				Your account remains secure and no action is needed.
			</div>
		`, "Verify your email to activate your Taraqqi Hub account."),
	}),

	// ============================================
	// KYC / Verification Status
	// ============================================

	kyc_submitted: (data) => ({
		subject: "Documents Received - We're Reviewing Your Application",
		html: getBaseTemplate(`
			<h1>We've Received Your Documents</h1>
			<p class="greeting">Dear ${data.userName || "User"},</p>
			<p>Thank you for submitting your verification documents. Your trust means everything to us.</p>
			
			<div class="success-box">
				<p>✓ Your documents have been successfully uploaded and are in our review queue.</p>
			</div>
			
			<h3 style="margin-top: 32px; margin-bottom: 16px; color: #1a1a2e;">What happens next?</h3>
			<ul class="steps-list">
				<li data-step="1">Our team reviews your submitted documents</li>
				<li data-step="2">We verify the authenticity of your information</li>
				<li data-step="3">You'll receive an email with the verification result</li>
			</ul>
			
			<div class="info-box">
				<p>📅 <strong>Timeline:</strong> Verification typically takes 1-3 business days. We'll email you as soon as the review is complete.</p>
			</div>
			
			<p>In the meantime, feel free to explore your dashboard and familiarize yourself with our platform.</p>
			
			<a href="${FRONTEND_URL}/dashboard" class="btn btn-secondary">Go to Dashboard</a>
		`, "Your verification documents are being reviewed."),
	}),

	kyc_approved: (data) => ({
		subject: "🎉 Congratulations! Your Verification is Approved",
		html: getBaseTemplate(`
			<h1>You're Verified!</h1>
			<p class="greeting">Dear ${data.userName || "User"},</p>
			<p>Great news! Your verification has been approved. You now have full access to all Taraqqi Hub features.</p>
			
			<div class="success-box">
				<p>✓ <strong>Account Status:</strong> Verified</p>
			</div>
			
			<p>You can now:</p>
			<ul style="color: #4a5568; padding-left: 20px; margin: 16px 0;">
				${data.userType === 'employer' 
					? `<li>Post job listings and reach qualified candidates</li>
					   <li>Access candidate profiles and contact information</li>
					   <li>Manage applications and schedule interviews</li>`
					: `<li>Apply to verified job opportunities</li>
					   <li>Connect with trusted employers</li>
					   <li>Showcase your skills and experience</li>`
				}
			</ul>
			
			<a href="${FRONTEND_URL}/dashboard" class="btn">Explore Your Dashboard</a>
			
			<p style="margin-top: 24px; color: #64748b; font-size: 14px;">Thank you for trusting Taraqqi Hub. We're committed to providing you with a safe and reliable platform.</p>
		`, "Your Taraqqi Hub account is now fully verified!"),
	}),

	kyc_rejected: (data) => ({
		subject: "Action Required: Verification Update Needed",
		html: getBaseTemplate(`
			<h1>Verification Requires Your Attention</h1>
			<p class="greeting">Dear ${data.userName || "User"},</p>
			<p>We reviewed your verification documents but were unable to complete the verification process.</p>
			
			<div class="error-box">
				<p><strong>Reason:</strong> ${data.reason || "The submitted documents did not meet our verification requirements."}</p>
			</div>
			
			<h3 style="margin-top: 32px; margin-bottom: 16px; color: #1a1a2e;">How to resolve this:</h3>
			<ol style="color: #4a5568; padding-left: 20px; margin: 16px 0;">
				<li>Review the reason mentioned above</li>
				<li>Ensure your documents are clear and legible</li>
				<li>Submit updated documents through your profile</li>
			</ol>
			
			<a href="${FRONTEND_URL}/kyc" class="btn">Resubmit Documents</a>
			
			<div class="info-box">
				<p>💡 <strong>Tips for successful verification:</strong><br>
				• Use high-quality images with good lighting<br>
				• Ensure all text is clearly readable<br>
				• Make sure the document is not expired</p>
			</div>
			
			<p style="margin-top: 24px;">Need help? Our support team is here to assist you at <a href="mailto:${SUPPORT_EMAIL}" style="color: #4ade80;">${SUPPORT_EMAIL}</a></p>
		`, "Please resubmit your verification documents."),
	}),

	kyc_resubmission_requested: (data) => ({
		subject: "Document Resubmission Required - Taraqqi Hub",
		html: getBaseTemplate(`
			<h1>Please Resubmit Your Documents</h1>
			<p class="greeting">Dear ${data.userName || "User"},</p>
			<p>We need you to resubmit your verification documents to complete the verification process.</p>
			
			<div class="warning-box">
				<p><strong>Reason:</strong> ${data.reason || "Additional verification is required."}</p>
			</div>
			
			<p>Please log in to your account and upload the required documents again.</p>
			
			<a href="${FRONTEND_URL}/kyc" class="btn">Upload Documents</a>
			
			<div class="info-box">
				<p>If you have any questions about what documents are needed, please contact our support team.</p>
			</div>
		`, "Please resubmit your verification documents."),
	}),

	// ============================================
	// Account Status
	// ============================================

	account_suspended: (data) => ({
		subject: "Important: Your Account Has Been Suspended",
		html: getBaseTemplate(`
			<h1>Account Suspension Notice</h1>
			<p class="greeting">Dear ${data.userName || "User"},</p>
			<p>We regret to inform you that your Taraqqi Hub account has been suspended.</p>
			
			<div class="error-box">
				<p><strong>Reason:</strong> ${data.reason || "Policy violation detected."}</p>
			</div>
			
			<h3 style="margin-top: 32px; margin-bottom: 16px; color: #1a1a2e;">What this means:</h3>
			<ul style="color: #4a5568; padding-left: 20px; margin: 16px 0;">
				<li>You cannot access your account at this time</li>
				<li>Any active job postings or applications have been paused</li>
			</ul>
			
			<h3 style="margin-top: 32px; margin-bottom: 16px; color: #1a1a2e;">Appeal Process:</h3>
			<p>If you believe this suspension was made in error, you may submit an appeal by contacting our support team with:</p>
			<ul style="color: #4a5568; padding-left: 20px; margin: 16px 0;">
				<li>Your registered email address</li>
				<li>A detailed explanation of the situation</li>
				<li>Any supporting documentation</li>
			</ul>
			
			<p>Contact us at: <a href="mailto:${SUPPORT_EMAIL}" style="color: #4ade80;">${SUPPORT_EMAIL}</a></p>
			
			<p style="margin-top: 24px; color: #64748b; font-size: 14px;">We take the integrity of our platform seriously to protect all our users.</p>
		`, "Your account has been suspended. Please contact support."),
	}),

	// ============================================
	// Job Applications
	// ============================================

	application_status: (data) => ({
		subject: `Application Update: ${data.status} - ${data.jobTitle}`,
		html: getBaseTemplate(`
			<h1>Application Status Update</h1>
			<p class="greeting">Dear ${data.userName || "Applicant"},</p>
			<p>We have an update regarding your job application.</p>
			
			<table class="details-table">
				<tr>
					<td>Position</td>
					<td><strong>${data.jobTitle}</strong></td>
				</tr>
				<tr>
					<td>Company</td>
					<td>${data.companyName}</td>
				</tr>
				<tr>
					<td>New Status</td>
					<td><strong style="color: ${data.status === 'Rejected' ? '#ef4444' : '#22c55e'}">${data.status}</strong></td>
				</tr>
			</table>
			
			${data.status === 'Shortlisted' ? `
				<div class="success-box">
					<p>🎉 Congratulations! The employer is interested in your profile. You may be contacted for the next steps.</p>
				</div>
			` : data.status === 'Rejected' ? `
				<div class="info-box">
					<p>Don't be discouraged! There are many more opportunities waiting for you on Taraqqi Hub.</p>
				</div>
				<a href="${FRONTEND_URL}/jobs" class="btn">Browse More Jobs</a>
			` : ''}
			
			<a href="${FRONTEND_URL}/applications" class="btn btn-secondary">View Application Details</a>
			
			<p style="margin-top: 24px; color: #64748b; font-size: 14px;">Keep your profile updated to improve your chances with future applications.</p>
		`, `Your application for ${data.jobTitle} has been updated.`),
	}),

	new_application_received: (data) => ({
		subject: `New Application Received: ${data.jobTitle}`,
		html: getBaseTemplate(`
			<h1>New Application Received</h1>
			<p class="greeting">Dear ${data.employerName || "Employer"},</p>
			<p>A new candidate has applied for your job posting.</p>
			
			<table class="details-table">
				<tr>
					<td>Position</td>
					<td><strong>${data.jobTitle}</strong></td>
				</tr>
				<tr>
					<td>Applicant Name</td>
					<td>${data.applicantName}</td>
				</tr>
				<tr>
					<td>Applied On</td>
					<td>${new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
				</tr>
			</table>
			
			<a href="${FRONTEND_URL}/employer/applications" class="btn">Review Application</a>
			
			<div class="info-box">
				<p>💡 <strong>Tip:</strong> Respond to applications promptly to secure top talent before they're hired elsewhere.</p>
			</div>
		`, `New application for ${data.jobTitle}`),
	}),

	// ============================================
	// Payments & Wallet
	// ============================================

	payment_success: (data) => ({
		subject: "Payment Confirmed - Taraqqi Hub",
		html: getBaseTemplate(`
			<h1>Payment Successful</h1>
			<p class="greeting">Dear ${data.userName || "User"},</p>
			<p>Your payment has been successfully processed and your wallet has been credited.</p>
			
			<div class="success-box">
				<p>✓ Transaction completed successfully</p>
			</div>
			
			<table class="details-table">
				<tr>
					<td>Amount</td>
					<td><strong>₹${data.amount}</strong></td>
				</tr>
				<tr>
					<td>Transaction ID</td>
					<td><code style="font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${data.transactionId}</code></td>
				</tr>
				<tr>
					<td>Date & Time</td>
					<td>${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
				</tr>
				<tr>
					<td>New Balance</td>
					<td><strong>₹${data.newBalance}</strong></td>
				</tr>
			</table>
			
			<a href="${FRONTEND_URL}/wallet" class="btn btn-secondary">View Wallet</a>
			
			<div class="info-box">
				<p>📝 Keep this email as a receipt for your records.</p>
			</div>
			
			<div class="security-notice">
				🔒 Didn't make this payment? <a href="mailto:${SUPPORT_EMAIL}">Contact us immediately</a>.
			</div>
		`, `₹${data.amount} added to your wallet successfully.`),
	}),

	// ============================================
	// Resume / Profile Views
	// ============================================

	resume_unlocked: (data) => ({
		subject: "Good News! An Employer Viewed Your Profile",
		html: getBaseTemplate(`
			<h1>Your Profile Was Viewed</h1>
			<p class="greeting">Dear ${data.userName || "User"},</p>
			<p>Great news! An employer has shown interest in your profile and unlocked your contact details.</p>
			
			<div class="success-box">
				<p>👀 An employer has viewed your full profile and contact information.</p>
			</div>
			
			<p>This means your profile stood out among many candidates. You may receive a call or message soon regarding job opportunities.</p>
			
			<h3 style="margin-top: 32px; margin-bottom: 16px; color: #1a1a2e;">Tips to increase your chances:</h3>
			<ul style="color: #4a5568; padding-left: 20px; margin: 16px 0;">
				<li>Keep your phone available for calls</li>
				<li>Update your profile regularly with new skills</li>
				<li>Ensure your resume is current and accurate</li>
			</ul>
			
			<a href="${FRONTEND_URL}/profile" class="btn">Update Your Profile</a>
			
			<div class="info-box">
				<p>🔒 <strong>Your Privacy:</strong> We only share your contact details with verified employers who pay to access them.</p>
			</div>
		`, "An employer has shown interest in your profile!"),
	}),

	// ============================================
	// Password & Security
	// ============================================

	reset_password: (data) => ({
		subject: "Password Reset Request - Taraqqi Hub",
		html: getBaseTemplate(`
			<h1>Reset Your Password</h1>
			<p class="greeting">Dear ${data.userName || "User"},</p>
			<p>We received a request to reset your password. Use the link below to create a new password.</p>
			
			<a href="${FRONTEND_URL}/reset-password?code=${data.code}" class="btn">Reset Password</a>
			
			<p style="text-align: center; color: #64748b; margin: 16px 0;">Or use this code:</p>
			
			<div class="code-box">${data.code.substring(0, 6).toUpperCase()}</div>
			
			<div class="warning-box">
				<p>⏰ This link expires in <strong>15 minutes</strong> for security reasons.</p>
			</div>
			
			<div class="security-notice">
				🔒 If you didn't request this password reset, please ignore this email or <a href="mailto:${SUPPORT_EMAIL}">contact support</a> if you're concerned about your account security.
			</div>
		`, "Reset your password - link expires in 15 minutes."),
	}),

	password_changed: (data) => ({
		subject: "🔒 Password Changed Successfully - Taraqqi Hub",
		html: getBaseTemplate(`
			<h1>Password Changed</h1>
			<p class="greeting">Dear ${data.userName || "User"},</p>
			<p>Your password has been successfully changed.</p>
			
			<div class="success-box">
				<p>✓ Your password was updated on ${new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}</p>
			</div>
			
			<p>You can now use your new password to log in to your account.</p>
			
			<div class="error-box">
				<p><strong>Wasn't you?</strong> If you didn't change your password, your account may be compromised. Please:</p>
				<ul style="margin: 8px 0 0 0; padding-left: 20px;">
					<li>Reset your password immediately</li>
					<li>Contact support at <a href="mailto:${SUPPORT_EMAIL}" style="color: #991b1b;">${SUPPORT_EMAIL}</a></li>
				</ul>
			</div>
			
			<a href="${FRONTEND_URL}/login" class="btn btn-secondary">Log In to Your Account</a>
			
			<div class="security-notice">
				🔒 For your security, we recommend using a strong, unique password and never sharing it with anyone.
			</div>
		`, "Your password has been changed successfully."),
	}),

	// ============================================
	// OTP Verification
	// ============================================

	otp_verification: (data) => ({
		subject: "Your Verification Code - Taraqqi Hub",
		html: getBaseTemplate(`
			<h1>Verification Code</h1>
			<p class="greeting">Dear ${data.userName || "User"},</p>
			<p>Use the following code to verify your ${data.purpose || "account"}:</p>
			
			<div class="code-box">${data.otp}</div>
			
			<div class="warning-box">
				<p>⏰ This code expires in <strong>${data.expiryMinutes || 10} minutes</strong>.</p>
			</div>
			
			<div class="security-notice">
				🔒 Never share this code with anyone. Taraqqi Hub will never ask for this code via phone or email.
			</div>
		`, `Your verification code is ${data.otp}`),
	}),
};

// ============================================
// Send Email
// ============================================

export async function sendEmail(
	to: string,
	template: string,
	data: Record<string, any>,
	immediate: boolean = false
): Promise<void> {
	const templateFn = emailTemplates[template];
	if (!templateFn) {
		console.error(`Email template not found: ${template}`);
		return;
	}

	const { subject, html } = templateFn(data);

	if (immediate) {
		// Send immediately
		try {
			await transporter.sendMail({
				from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
				to,
				subject,
				html,
			});
			console.log(`[Email] Sent ${template} to ${to}`);
		} catch (error) {
			console.error(`[Email] Failed to send ${template} to ${to}:`, error);
		}
	} else {
		// Queue for background sending - pass the rendered HTML to the worker
		await addEmailJob({ to, subject, template, data: { ...data, html } });
	}
}

// ============================================
// In-App Notifications (stored in DB)
// ============================================

export interface NotificationData {
	userId: bigint;
	type: string;
	title: string;
	message: string;
	link?: string;
	metadata?: Record<string, any>;
}

export async function createInAppNotification(
	data: NotificationData,
	immediate: boolean = false
): Promise<void> {
	if (immediate) {
		// Store directly
		console.log("Creating in-app notification:", data);
	} else {
		// Queue for background processing
		await addInAppNotification({
			userId: data.userId.toString(),
			type: data.type,
			title: data.title,
			message: data.message,
			link: data.link,
			metadata: data.metadata,
		});
	}
}

// ============================================
// Notification Triggers
// ============================================

export async function notifyEmailVerification(
	userId: bigint,
	email: string,
	verificationToken: string,
	userName: string = "User"
): Promise<void> {
	// Send email
	await sendEmail(email, "email_verification", {
		userName,
		verificationToken,
	});
}

export async function notifyRegistrationSuccess(
	userId: bigint,
	email: string,
	verificationToken: string,
	userName: string = "User"
): Promise<void> {
	await sendEmail(email, "registration_success", {
		userName,
		verificationToken,
	});
}

export async function notifyPasswordReset(
	email: string,
	code: string,
	userName: string = "User"
): Promise<void> {
	await sendEmail(email, "reset_password", {
		userName,
		code,
	});
}

export async function notifyPasswordChanged(
	email: string,
	userName: string = "User"
): Promise<void> {
	await sendEmail(email, "password_changed", {
		userName,
	}, true); // Send immediately for security
}

export async function notifyKycSubmitted(
	userId: bigint,
	email: string,
	userName: string = "User"
): Promise<void> {
	await sendEmail(email, "kyc_submitted", {
		userName,
	});

	await createInAppNotification({
		userId,
		type: "kyc_submitted",
		title: "Documents Submitted",
		message: "Your verification documents have been submitted for review.",
		link: "/kyc",
	});
}

export async function notifyKycStatusChange(
	userId: bigint,
	email: string,
	status: "approved" | "rejected",
	documentType: string,
	reason?: string,
	userName?: string,
	userType?: string
): Promise<void> {
	const template = status === "approved" ? "kyc_approved" : "kyc_rejected";
	const title = status === "approved" ? "KYC Approved" : "KYC Requires Attention";

	// Send email
	await sendEmail(email, template, { 
		documentType, 
		reason, 
		userName: userName || "User",
		userType 
	});

	// Create in-app notification
	await createInAppNotification({
		userId,
		type: `kyc_${status}`,
		title,
		message:
			status === "approved"
				? "Your KYC verification has been approved"
				: `Your KYC verification was not approved: ${reason}`,
		link: "/kyc",
	});
}

export async function notifyApplicationStatusChange(
	userId: bigint,
	email: string,
	jobTitle: string,
	companyName: string,
	status: string,
	userName?: string
): Promise<void> {
	// Send email
	await sendEmail(email, "application_status", { 
		jobTitle, 
		companyName, 
		status,
		userName: userName || "Applicant"
	});

	// Create in-app notification
	await createInAppNotification({
		userId,
		type: "application_status",
		title: "Application Update",
		message: `Your application for ${jobTitle} is now: ${status}`,
		link: "/applications",
	});
}

export async function notifyNewApplicationReceived(
	employerId: bigint,
	employerEmail: string,
	jobTitle: string,
	applicantName: string,
	employerName?: string
): Promise<void> {
	await sendEmail(employerEmail, "new_application_received", {
		jobTitle,
		applicantName,
		employerName: employerName || "Employer",
	});

	await createInAppNotification({
		userId: employerId,
		type: "new_application",
		title: "New Application",
		message: `${applicantName} applied for ${jobTitle}`,
		link: "/employer/applications",
	});
}

export async function notifyPaymentSuccess(
	userId: bigint,
	email: string,
	amount: number,
	transactionId: string,
	newBalance: number,
	userName?: string
): Promise<void> {
	await sendEmail(email, "payment_success", { 
		amount, 
		transactionId, 
		newBalance,
		userName: userName || "User"
	});

	await createInAppNotification({
		userId,
		type: "payment_success",
		title: "Payment Successful",
		message: `₹${amount} added to your wallet`,
		link: "/wallet",
	});
}

export async function notifyResumeUnlocked(
	jobseekerId: bigint,
	email: string,
	userName?: string
): Promise<void> {
	await sendEmail(email, "resume_unlocked", {
		userName: userName || "User"
	});

	await createInAppNotification({
		userId: jobseekerId,
		type: "resume_unlocked",
		title: "Profile Viewed",
		message: "An employer has viewed your profile",
		link: "/profile",
	});
}

export async function notifyProfileViewedByEmployer(
	jobseekerId: bigint,
	email: string,
	companyName: string,
	jobTitle: string,
	userName?: string
): Promise<void> {
	await sendEmail(email, "application_status", {
		jobTitle,
		companyName,
		status: "Viewed",
		userName: userName || "Applicant",
	});

	await createInAppNotification({
		userId: jobseekerId,
		type: "application_status",
		title: "Profile Viewed",
		message: `Your profile was viewed by ${companyName} for ${jobTitle}`,
		link: "/applications",
	});
}

export async function notifyAccountSuspended(
	userId: bigint,
	email: string,
	reason: string,
	userName?: string
): Promise<void> {
	await sendEmail(email, "account_suspended", {
		reason,
		userName: userName || "User"
	}, true); // Send immediately for important notifications
}

export async function notifyOtpVerification(
	email: string,
	otp: string,
	purpose: string = "account verification",
	userName?: string,
	expiryMinutes: number = 10
): Promise<void> {
	await sendEmail(email, "otp_verification", {
		otp,
		purpose,
		userName: userName || "User",
		expiryMinutes,
	}, true); // Send immediately
}

export default {
	sendEmail,
	createInAppNotification,
	notifyEmailVerification,
	notifyRegistrationSuccess,
	notifyPasswordReset,
	notifyPasswordChanged,
	notifyKycSubmitted,
	notifyKycStatusChange,
	notifyApplicationStatusChange,
	notifyNewApplicationReceived,
	notifyPaymentSuccess,
	notifyResumeUnlocked,
	notifyAccountSuspended,
	notifyOtpVerification,
};

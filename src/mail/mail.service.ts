import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST') || 'smtp.gmail.com',
      port: Number(this.configService.get('SMTP_PORT')) || 587,
      secure: false, // true لـ port 465، و false للـ 587
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });
  }

  /**
   * ✅ دالة مساعدة لإرسال البريد الإلكتروني
   */
  private async sendMail(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<boolean> {
    try {
      // ✅ إرسال البريد الإلكتروني الفعلي عبر SMTP
      const mailFrom =
        this.configService.get('MAIL_FROM') ||
        '"ScanLens" <noreply@scanlens.app>';

      const info = await this.transporter.sendMail({
        from: mailFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      this.logger.log(
        `[Mail] Sent successfully to: ${options.to} (ID: ${info.messageId})`,
      );
      return true;
    } catch (error) {
      this.logger.error(`[Mail Error] Failed to send to ${options.to}`, error);

      // ✅ احتياطي: طباعة الـ OTP في الـ Console عند حدوث خطأ أثناء التطوير
      const otpMatch = options.html.match(/\b\d{6}\b/);
      if (otpMatch) {
        console.log(
          `\n⚠️ Email failed, but OTP for ${options.to} is: ${otpMatch[0]}\n`,
        );
      }

      return false;
    }
  }

  async sendVerificationOtp(
    recipientEmail: string,
    otp: string,
  ): Promise<boolean> {
    // ✅ اطبع OTP في الـ Console (احتياطي)
    console.log(`\n📧 [OTP] ${recipientEmail}: ${otp}\n`);

    return this.sendMail({
      to: recipientEmail,
      subject: '🔒 ScanLens - Verification Code',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e4e4e7; border-radius: 10px;">
        <h2 style="color: #09090b; text-align: center;">ScanLens Security</h2>
        <p style="color: #52525b; font-size: 16px;">Welcome! Use the following code to complete your registration:</p>
        <div style="background-color: #18181b; color: #ffffff; font-size: 28px; font-weight: bold; text-align: center; letter-spacing: 6px; padding: 15px; border-radius: 8px; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #a1a1aa; font-size: 13px; text-align: center;">This code is valid for 10 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
    });
  }

  /**
   * إرسال رمز OTP لإعادة تعيين كلمة المرور
   */
  async sendResetPasswordOtp(
    recipientEmail: string,
    otp: string,
  ): Promise<boolean> {
    return this.sendMail({
      to: recipientEmail,
      subject: '🔐 ScanLens - Reset Your Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e4e4e7; border-radius: 10px;">
          <h2 style="color: #09090b; text-align: center;">🔐 Reset Your Password</h2>
          <p style="color: #52525b; font-size: 16px;">We received a request to reset your password. Use the following code to proceed:</p>
          <div style="background-color: #18181b; color: #ffffff; font-size: 28px; font-weight: bold; text-align: center; letter-spacing: 6px; padding: 15px; border-radius: 8px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="color: #a1a1aa; font-size: 13px; text-align: center;">This code is valid for 15 minutes. If you didn't request this, ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
          <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} ScanLens. All rights reserved.
          </p>
        </div>
      `,
    });
  }

  /**
   * إرسال إشعار بتغيير كلمة المرور
   */
  async sendPasswordChangedNotification(
    recipientEmail: string,
  ): Promise<boolean> {
    return this.sendMail({
      to: recipientEmail,
      subject: '🔒 ScanLens - Password Changed',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e4e4e7; border-radius: 10px;">
          <h2 style="color: #09090b; text-align: center;">🔒 Password Changed</h2>
          <p style="color: #52525b; font-size: 16px;">Your password has been successfully changed.</p>
          <p style="color: #a1a1aa; font-size: 14px;">If you didn't make this change, please contact support immediately.</p>
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
          <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} ScanLens. All rights reserved.
          </p>
        </div>
      `,
    });
  }

  /**
   * ✅ إشعار شراء المفتاح بنجاح
   */
  async sendLicensePurchaseConfirmation(
    recipientEmail: string,
    licenseKey: string,
    plan: string,
    expiresAt: Date | null,
  ): Promise<boolean> {
    const expiryDate = expiresAt
      ? new Date(expiresAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'Never';

    return this.sendMail({
      to: recipientEmail,
      subject: `🎉 ScanLens - ${plan} License Purchased!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e4e4e7; border-radius: 10px;">
          <h2 style="color: #09090b; text-align: center;">🎉 License Purchased!</h2>
          <p style="color: #52525b; font-size: 16px;">Thank you for purchasing the <strong>${plan}</strong> plan!</p>
          <p style="color: #52525b; font-size: 14px;">Here is your license key:</p>
          <div style="background-color: #18181b; color: #0ea5e9; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 4px; padding: 15px; border-radius: 8px; margin: 20px 0; font-family: monospace;">
            ${licenseKey}
          </div>
          <div style="display: flex; justify-content: space-between; padding: 15px; background-color: #f4f4f5; border-radius: 8px; margin: 20px 0;">
            <div>
              <p style="color: #71717a; font-size: 12px; margin: 0;">Plan</p>
              <p style="color: #09090b; font-size: 16px; font-weight: bold; margin: 5px 0 0 0;">${plan}</p>
            </div>
            <div>
              <p style="color: #71717a; font-size: 12px; margin: 0;">Expires</p>
              <p style="color: #09090b; font-size: 16px; font-weight: bold; margin: 5px 0 0 0;">${expiryDate}</p>
            </div>
          </div>
          <p style="color: #a1a1aa; font-size: 13px; text-align: center;">
            You can activate your license in the Settings page.
          </p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${process.env.FRONTEND_URL}/settings" style="display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Go to Settings
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
          <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} ScanLens. All rights reserved.
          </p>
        </div>
      `,
    });
  }

  /**
   * ✅ إشعار انتهاء المفتاح (قبل 7 أيام)
   */
  async sendLicenseExpiringWarning(
    recipientEmail: string,
    licenseKey: string,
    plan: string,
    expiresAt: Date,
  ): Promise<boolean> {
    const daysRemaining = Math.ceil(
      (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return this.sendMail({
      to: recipientEmail,
      subject: `⚠️ ScanLens - Your ${plan} license expires in ${daysRemaining} days`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e4e4e7; border-radius: 10px;">
          <h2 style="color: #09090b; text-align: center;">⚠️ License Expiring Soon</h2>
          <p style="color: #52525b; font-size: 16px;">Your <strong>${plan}</strong> license key will expire in <strong>${daysRemaining}</strong> days.</p>
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0;">
            <p style="color: #78350f; font-size: 14px; margin: 0;">
              <strong>License Key:</strong> <span style="font-family: monospace;">${licenseKey}</span>
            </p>
            <p style="color: #78350f; font-size: 14px; margin: 5px 0 0 0;">
              <strong>Expires on:</strong> ${expiryDate}
            </p>
          </div>
          <p style="color: #52525b; font-size: 14px;">To continue enjoying premium features, please renew your license.</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${process.env.FRONTEND_URL}/buy-license" style="display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Renew Now
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
          <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} ScanLens. All rights reserved.
          </p>
        </div>
      `,
    });
  }

  /**
   * ✅ إشعار انتهاء المفتاح (تم الإلغاء)
   */
  async sendLicenseExpiredNotification(
    recipientEmail: string,
    licenseKey: string,
    plan: string,
  ): Promise<boolean> {
    return this.sendMail({
      to: recipientEmail,
      subject: `❌ ScanLens - Your ${plan} license has expired`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e4e4e7; border-radius: 10px;">
          <h2 style="color: #09090b; text-align: center;">❌ License Expired</h2>
          <p style="color: #52525b; font-size: 16px;">Your <strong>${plan}</strong> license key has expired.</p>
          <div style="background-color: #fee2e2; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0;">
            <p style="color: #991b1b; font-size: 14px; margin: 0;">
              <strong>License Key:</strong> <span style="font-family: monospace;">${licenseKey}</span>
            </p>
            <p style="color: #991b1b; font-size: 14px; margin: 5px 0 0 0;">
              <strong>Status:</strong> Expired
            </p>
          </div>
          <p style="color: #52525b; font-size: 14px;">Your account has been downgraded to the <strong>Free</strong> plan.</p>
          <p style="color: #52525b; font-size: 14px;">To regain access to premium features, please purchase a new license.</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${process.env.FRONTEND_URL}/buy-license" style="display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Purchase New License
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
          <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} ScanLens. All rights reserved.
          </p>
        </div>
      `,
    });
  }

  /**
   * ✅ إشعار نجاح الدفع
   */
  async sendPaymentConfirmation(
    recipientEmail: string,
    amount: number,
    plan: string,
    billingCycle: string,
  ): Promise<boolean> {
    return this.sendMail({
      to: recipientEmail,
      subject: `💰 ScanLens - Payment Confirmation (${plan} Plan)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e4e4e7; border-radius: 10px;">
          <h2 style="color: #09090b; text-align: center;">💰 Payment Confirmed</h2>
          <p style="color: #52525b; font-size: 16px;">Your payment has been successfully processed.</p>
          <div style="background-color: #f4f4f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; padding: 5px 0;">
              <span style="color: #71717a;">Plan</span>
              <span style="color: #09090b; font-weight: bold;">${plan}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 5px 0;">
              <span style="color: #71717a;">Billing Cycle</span>
              <span style="color: #09090b; font-weight: bold;">${billingCycle}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 5px 0; border-top: 1px solid #e4e4e7; margin-top: 5px; padding-top: 10px;">
              <span style="color: #71717a;">Amount</span>
              <span style="color: #09090b; font-weight: bold;">$${amount}</span>
            </div>
          </div>
          <p style="color: #a1a1aa; font-size: 13px; text-align: center;">Thank you for your purchase!</p>
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
          <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} ScanLens. All rights reserved.
          </p>
        </div>
      `,
    });
  }

  /**
   * ✅ إشعار فشل الدفع
   */
  async sendPaymentFailedNotification(
    recipientEmail: string,
    amount: number,
    plan: string,
    errorMessage: string,
  ): Promise<boolean> {
    return this.sendMail({
      to: recipientEmail,
      subject: `❌ ScanLens - Payment Failed (${plan} Plan)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e4e4e7; border-radius: 10px;">
          <h2 style="color: #09090b; text-align: center;">❌ Payment Failed</h2>
          <p style="color: #52525b; font-size: 16px;">We were unable to process your payment.</p>
          <div style="background-color: #fee2e2; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0;">
            <p style="color: #991b1b; font-size: 14px; margin: 0;">
              <strong>Plan:</strong> ${plan}
            </p>
            <p style="color: #991b1b; font-size: 14px; margin: 5px 0 0 0;">
              <strong>Amount:</strong> $${amount}
            </p>
            <p style="color: #991b1b; font-size: 14px; margin: 5px 0 0 0;">
              <strong>Error:</strong> ${errorMessage}
            </p>
          </div>
          <p style="color: #52525b; font-size: 14px;">Please try again or use a different payment method.</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${process.env.FRONTEND_URL}/buy-license" style="display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Try Again
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
          <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} ScanLens. All rights reserved.
          </p>
        </div>
      `,
    });
  }

  // server/src/mail/mail.service.ts

  // ✅ أضف هذه الدوال في نهاية الكلاس

  /**
   * ✅ إشعار انتهاء الاشتراك (تنبيه)
   */
  async sendSubscriptionExpiringWarning(
    recipientEmail: string,
    recipientName: string,
    plan: string,
    expiresAt: Date,
    daysRemaining: number,
  ): Promise<boolean> {
    const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return this.sendMail({
      to: recipientEmail,
      subject: `⚠️ ScanLens - Your ${plan} plan expires in ${daysRemaining} days`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e4e4e7; border-radius: 10px;">
        <h2 style="color: #09090b; text-align: center;">⚠️ Subscription Expiring Soon</h2>
        <p style="color: #52525b; font-size: 16px;">Hello ${recipientName},</p>
        <p style="color: #52525b; font-size: 16px;">Your <strong>${plan}</strong> plan will expire in <strong style="color: #f59e0b;">${daysRemaining} days</strong>.</p>
        <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0;">
          <p style="color: #78350f; font-size: 14px; margin: 0;">
            <strong>Plan:</strong> ${plan}
          </p>
          <p style="color: #78350f; font-size: 14px; margin: 5px 0 0 0;">
            <strong>Expires on:</strong> ${expiryDate}
          </p>
          <p style="color: #78350f; font-size: 14px; margin: 5px 0 0 0;">
            <strong>Days remaining:</strong> ${daysRemaining} days
          </p>
        </div>
        <p style="color: #52525b; font-size: 14px;">
          Renew now to continue enjoying premium features without interruption.
        </p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription" 
             style="display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
            🔄 Renew Now
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
        <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
          © ${new Date().getFullYear()} ScanLens. All rights reserved.
        </p>
      </div>
    `,
    });
  }

  /**
   * ✅ إشعار انتهاء الاشتراك (تم الإلغاء)
   */
  async sendSubscriptionExpiredNotification(
    recipientEmail: string,
    recipientName: string,
    plan: string,
    expiredAt: Date,
  ): Promise<boolean> {
    const expiryDate = new Date(expiredAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return this.sendMail({
      to: recipientEmail,
      subject: `❌ ScanLens - Your ${plan} subscription has expired`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e4e4e7; border-radius: 10px;">
        <h2 style="color: #09090b; text-align: center;">❌ Subscription Expired</h2>
        <p style="color: #52525b; font-size: 16px;">Hello ${recipientName},</p>
        <p style="color: #52525b; font-size: 16px;">Your <strong>${plan}</strong> subscription has expired on <strong>${expiryDate}</strong>.</p>
        <div style="background-color: #fee2e2; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0;">
          <p style="color: #991b1b; font-size: 14px; margin: 0;">
            <strong>Plan:</strong> ${plan}
          </p>
          <p style="color: #991b1b; font-size: 14px; margin: 5px 0 0 0;">
            <strong>Expired on:</strong> ${expiryDate}
          </p>
          <p style="color: #991b1b; font-size: 14px; margin: 5px 0 0 0;">
            <strong>Status:</strong> Downgraded to Free
          </p>
        </div>
        <p style="color: #52525b; font-size: 14px;">
          Your account has been downgraded to the <strong>Free</strong> plan.
          You have lost access to premium features.
        </p>
        <p style="color: #52525b; font-size: 14px;">
          To regain access, please purchase a new subscription.
        </p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription" 
             style="display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
            🔄 Subscribe Now
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
        <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
          © ${new Date().getFullYear()} ScanLens. All rights reserved.
        </p>
      </div>
    `,
    });
  }
}

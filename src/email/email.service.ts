import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

@Injectable()
export class EmailService {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('SMTP_HOST')?.trim();
    const port = Number(config.get('SMTP_PORT', '587'));
    const user = config.get<string>('SMTP_USER')?.trim();
    const pass = config.get<string>('SMTP_PASS');
    this.from = config.get<string>('MAIL_FROM')?.trim() ?? '';
    this.configured = Boolean(
      host &&
      this.from &&
      Number.isInteger(port) &&
      port > 0 &&
      ((!user && !pass) || (user && pass)),
    );
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: config.get('SMTP_SECURE', 'false') === 'true',
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  async sendVerificationOtp(
    to: string,
    name: string,
    otp: string,
    expiresMinutes: number,
  ) {
    const safeName = escapeHtml(name);
    const safeOtp = escapeHtml(otp);
    await this.send({
      to,
      subject: `${otp} is your TravelSense verification code`,
      text: `Hello ${name},\n\nYour TravelSense verification code is ${otp}. It expires in ${expiresMinutes} minutes.\n\nIf you did not create this account, you can ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17352a">
          <h1 style="color:#176b45">Verify your TravelSense email</h1>
          <p>Hello ${safeName},</p>
          <p>Enter this code to finish creating your account:</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#eef8f2;padding:18px 24px;border-radius:12px;text-align:center">${safeOtp}</p>
          <p>This code expires in ${expiresMinutes} minutes. If you did not create this account, you can ignore this email.</p>
        </div>`,
    });
  }

  async sendPasswordReset(
    to: string,
    name: string,
    resetUrl: string,
    expiresMinutes: number,
  ) {
    const safeName = escapeHtml(name);
    const safeUrl = escapeHtml(resetUrl);
    await this.send({
      to,
      subject: 'Reset your TravelSense password',
      text: `Hello ${name},\n\nReset your TravelSense password using this link: ${resetUrl}\n\nThe link expires in ${expiresMinutes} minutes. If you did not request this, you can ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17352a">
          <h1 style="color:#176b45">Reset your TravelSense password</h1>
          <p>Hello ${safeName},</p>
          <p>Use the button below to choose a new password.</p>
          <p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#176b45;color:white;text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:700">Reset password</a></p>
          <p>This link expires in ${expiresMinutes} minutes. If you did not request a password reset, you can ignore this email.</p>
          <p style="font-size:12px;color:#63756e;word-break:break-all">${safeUrl}</p>
        </div>`,
    });
  }

  private async send(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured yet. Add the SMTP settings and try again.',
      );
    }
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
    } catch {
      throw new ServiceUnavailableException(
        'We could not send the email right now. Please try again shortly.',
      );
    }
  }
}

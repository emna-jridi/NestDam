import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import * as fs from 'fs';
import * as path from 'path';
import sgMail from '@sendgrid/mail';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  private useSendGrid = false;
  private templatesPath: string;

  constructor() {
    // Handle both development (ts-node) and production (compiled js) paths
    this.templatesPath = path.join(__dirname, 'templates');

    // If templates folder doesn't exist at __dirname/templates, try src folder
    if (!fs.existsSync(this.templatesPath)) {
      this.templatesPath = path.join(
        process.cwd(),
        'src',
        'shared',
        'mail',
        'templates',
      );
    }

    this.logger.log(`Templates path: ${this.templatesPath}`);

    // Prefer SendGrid Web API if an API key is provided
    if (process.env.SENDGRID_API_KEY) {
      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        this.useSendGrid = true;
        this.logger.log('Using SendGrid API for outgoing emails');
      } catch (e) {
        this.logger.error(
          'Failed to configure SendGrid, falling back to SMTP',
          e as Error,
        );
        this.useSendGrid = false;
      }
    }

    if (!this.useSendGrid) {
      const transportOptions: SMTPTransport.Options = {
        host: process.env.MAIL_HOST || 'smtp.sendgrid.net',
        port: Number(process.env.MAIL_PORT) || 587,
        secure: process.env.MAIL_SECURE === 'true' || false,
        auth: {
          user: process.env.MAIL_USER || 'apikey',
          pass: process.env.SENDGRID_API_KEY || process.env.MAIL_PASSWORD,
        },
      };

      this.transporter = nodemailer.createTransport(transportOptions);
      this.logger.log('Using SMTP transporter for outgoing emails');
    }
  }

  private async sendWithSendGrid(
    to: string,
    subject: string,
    html: string,
  ): Promise<boolean> {
    try {
      const msg = {
        to,
        from: process.env.MAIL_FROM || 'noreply@example.com',
        subject,
        html,
      } as any;

      const res = await sgMail.send(msg);
      // The SendGrid response type can be an array or a single response and typings
      // may not expose `statusCode`. Log defensively to avoid TypeScript errors.
      let statusInfo = 'unknown';
      try {
        statusInfo = JSON.stringify(
          Array.isArray(res) && res[0] ? res[0] : res,
        );
      } catch {
        statusInfo = 'unknown';
      }
      this.logger.log(`✅ SendGrid message accepted: ${statusInfo}`);
      return true;
    } catch (err) {
      // Try to log SendGrid-specific error details when available
      try {
        const e: any = err;
        const resp = e && (e.response || (e.body && { body: e.body }));
        if (resp && resp.body) {
          this.logger.error(
            `SendGrid send error: ${JSON.stringify(resp.body)}`,
          );
        } else if (resp) {
          this.logger.error(
            `SendGrid send error response: ${JSON.stringify(resp)}`,
          );
        } else {
          this.logger.error(
            'SendGrid send error',
            (err as Error)?.stack || String(err),
          );
        }
      } catch {
        this.logger.error(
          'SendGrid send error',
          (err as Error)?.stack || String(err),
        );
      }
      return false;
    }
  }

  private loadTemplate(name: string): string {
    const file = path.join(this.templatesPath, name);
    return fs.readFileSync(file, 'utf8');
  }

  private render(template: string, vars: Record<string, string>): string {
    let out = template;
    for (const k of Object.keys(vars)) {
      out = out.replace(new RegExp(`{{${k}}}`, 'g'), vars[k]);
    }
    return out;
  }

  async sendResetPasswordCode(email: string, code: string): Promise<boolean> {
    try {
      this.logger.log(`Loading template for reset password...`);
      const tpl = this.loadTemplate('reset-password.html');
      this.logger.log(`Template loaded, rendering with code`);
      const html = this.render(tpl, { CODE: code });
      const subject = 'Réinitialisation de votre mot de passe';

      if (this.useSendGrid) {
        this.logger.log(`Sending reset code to ${email} via SendGrid`);
        const success = await this.sendWithSendGrid(email, subject, html);
        if (success) {
          this.logger.log(`🔑 Code: ${code} (expires in 15 minutes)`);
        }
        return success;
      }

      const mailOptions: nodemailer.SendMailOptions = {
        from: process.env.MAIL_FROM || 'noreply@example.com',
        to: email,
        subject,
        html,
      };

      this.logger.log(`Sending email to ${email} via SMTP...`);
      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `✅ Reset code email sent to ${email}: ${result.messageId}`,
      );
      this.logger.log(`🔑 Code: ${code} (expires in 15 minutes)`);
      return true;
    } catch (err) {
      this.logger.error(
        `Error sending reset code email to ${email}`,
        (err as Error)?.stack || String(err),
      );
      return false;
    }
  }

  async sendResetPasswordEmail(
    email: string,
    tokenOrLink: string,
  ): Promise<boolean> {
    if (/^\d{6}$/.test(tokenOrLink)) {
      return this.sendResetPasswordCode(email, tokenOrLink);
    }

    const resetLink = `https://unschematised-brenna-stalagmitical.ngrok-free.dev/auth/reset-password?token=${tokenOrLink}`;
    const tpl = this.loadTemplate('reset-password.html');
    const html = this.render(tpl, { CODE: resetLink });

    try {
      const subject = 'Réinitialisation de votre mot de passe';
      if (this.useSendGrid) {
        this.logger.log(`Sending reset link to ${email} via SendGrid`);
        return this.sendWithSendGrid(email, subject, html);
      }

      const result = await this.transporter.sendMail({
        from: process.env.MAIL_FROM || 'noreply@example.com',
        to: email,
        subject,
        html,
      });
      this.logger.log(`Reset link email sent: ${result.messageId}`);
      return true;
    } catch (err) {
      this.logger.error(
        'Error sending reset link email',
        (err as Error)?.stack,
      );
      return false;
    }
  }

  async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
    const tpl = this.loadTemplate('reset-password.html');
    const html = this.render(tpl, { CODE: `Bienvenue ${name}` });
    try {
      const subject = 'Bienvenue sur notre application !';
      if (this.useSendGrid) {
        this.logger.log(`Sending welcome email to ${email} via SendGrid`);
        return this.sendWithSendGrid(email, subject, html);
      }

      const result = await this.transporter.sendMail({
        from: process.env.MAIL_FROM || 'noreply@example.com',
        to: email,
        subject,
        html,
      });
      this.logger.log(`Welcome email sent: ${result.messageId}`);
      return true;
    } catch (err) {
      this.logger.error('Error sending welcome email', (err as Error)?.stack);
      return false;
    }
  }
}

import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: "sandbox.smtp.mailtrap.io",
      port: 2525,
      auth: {
        user: '3a7acff4faabaa',  // ← This is correct
        pass: '4fbf4854b9a4b0',  // ← Change this!
      },
    });
    // this.transporter = nodemailer.createTransport({
    //   service: 'gmail',
    //   auth: {
    //     user: process.env.EMAIL_USER || 'your-email@gmail.com',
    //     pass: process.env.EMAIL_PASSWORD || 'your-app-password',
    //   },
    // });
  }

  async sendResetPasswordEmail(email: string, resetCode: string) {
    const mailOptions = {
      from: 'jridiemna04@gmail.com',  // ← Change this
      to: email,
      subject: 'Password Reset Code',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>You requested to reset your password. Use the code below:</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
            <h1 style="color: #333; letter-spacing: 5px;">${resetCode}</h1>
          </div>
          <p>This code will expire in <strong>15 minutes</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log("Email sent successfully:", result.messageId);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  async sendWelcomeEmail(email: string, name: string) {
    const mailOptions = {
      from: 'noreply@yourapp.com',
      to: email,
      subject: 'Welcome to Our App!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Welcome ${name}! 🎉</h2>
          <p>Thank you for registering with us.</p>
          <p>Your account has been created successfully.</p>
        </div>
      `,
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log("Welcome email sent:", result);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }
}
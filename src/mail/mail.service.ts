import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

import { config } from 'dotenv';
config();
@Injectable()
export class MailService {
  private transporter;

  constructor() {
    // Gmail configuration
    // this.transporter = nodemailer.createTransport({
    //   service: 'gmail',
    //   auth: {
    //     user: process.env.EMAIL_USER || 'your-email@gmail.com',
    //     pass: process.env.EMAIL_PASSWORD || 'your-app-password',
    //   },
    // });

   
    this.transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
      port: 2525,
      auth: {
        user: '3a7acff4faabaa',
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }

  async sendResetPasswordEmail(email: string, resetCode: string) {
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
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
      await this.transporter.sendMail(mailOptions);
      console.log("aaaaaaaa")
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  async sendWelcomeEmail(email: string, name: string) {
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
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
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }
}

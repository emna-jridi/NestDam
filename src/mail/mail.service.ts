import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as dotenv from "dotenv";
dotenv.config();

@Injectable()
export class MailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: {
        user: "apikey",
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }

  async sendResetPasswordEmail(email: string, token: string) {
    const resetLink = `https://unschematised-brenna-stalagmitical.ngrok-free.dev/auth/reset-password?token=${token}`;

    const mailOptions = {
      from: 'shadowguardnoreplay@gmail.com',
      to: email,
      subject: 'Réinitialisation de votre mot de passe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f4f4f4;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center;">
                      <h1 style="color: #333333; font-family: Arial, sans-serif; font-size: 28px; margin: 0;">
                        Réinitialisation du mot de passe
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 20px 40px; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #666666;">
                      <p style="margin: 0 0 20px 0;">Bonjour,</p>
                      <p style="margin: 0 0 20px 0;">
                        Vous avez demandé à réinitialiser votre mot de passe. 
                        Cliquez sur le bouton ci-dessous pour procéder :
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Button -->
                  <tr>
                    <td style="padding: 0 40px 30px 40px;" align="center">
                      <a href="${resetLink}" 
                         style="display: inline-block; 
                                background-color: #4CAF50; 
                                color: #ffffff; 
                                text-decoration: none; 
                                padding: 15px 40px; 
                                border-radius: 5px; 
                                font-family: Arial, sans-serif; 
                                font-size: 16px; 
                                font-weight: bold;
                                box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                        Réinitialiser mon mot de passe
                      </a>
                    </td>
                  </tr>
                  
                  <!-- Alternative link -->
                  <tr>
                    <td style="padding: 0 40px 20px 40px; font-family: Arial, sans-serif; font-size: 14px; color: #999999; text-align: center;">
                      <p style="margin: 0 0 10px 0;">Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :</p>
                      <a href="${resetLink}" style="color: #4CAF50; word-break: break-all;">${resetLink}</a>
                    </td>
                  </tr>
                  
                  <!-- Warning -->
                  <tr>
                    <td style="padding: 20px 40px; background-color: #fff3cd; border-left: 4px solid #ffc107; font-family: Arial, sans-serif; font-size: 14px; color: #856404;">
                      <p style="margin: 0;">
                        <strong>⚠️ Important :</strong> Ce lien expirera dans <strong>15 minutes</strong>.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 30px 40px 40px 40px; font-family: Arial, sans-serif; font-size: 14px; color: #999999; text-align: center; border-top: 1px solid #eeeeee;">
                      <p style="margin: 0 0 10px 0;">
                        Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet email.
                      </p>
                      <p style="margin: 0; color: #cccccc;">
                        © 2025 Votre Application. Tous droits réservés.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
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
      from: 'shadowguardnoreplay@gmail.com',
      to: email,
      subject: 'Bienvenue sur notre application !',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f4f4f4;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="padding: 40px; text-align: center;">
                      <h1 style="color: #4CAF50; font-family: Arial, sans-serif; font-size: 32px; margin: 0 0 20px 0;">
                        Bienvenue ${name}! 🎉
                      </h1>
                      <p style="font-family: Arial, sans-serif; font-size: 16px; color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
                        Merci de vous être inscrit sur notre application.
                      </p>
                      <p style="font-family: Arial, sans-serif; font-size: 16px; color: #666666; line-height: 1.6; margin: 0;">
                        Votre compte a été créé avec succès. Nous sommes ravis de vous compter parmi nous !
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 0 40px 40px 40px; font-family: Arial, sans-serif; font-size: 14px; color: #999999; text-align: center; border-top: 1px solid #eeeeee;">
                      <p style="margin: 20px 0 0 0; color: #cccccc;">
                        © 2025 Votre Application. Tous droits réservés.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log("Welcome email sent:", result.messageId);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }
}
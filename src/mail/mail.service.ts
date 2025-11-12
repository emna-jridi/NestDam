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
async sendOtpEmail(email: string, name: string, otp: string) {
  const mailOptions = {
    from: 'shadowguardnoreplay@gmail.com',
    to: email,
    subject: 'Vérification de votre compte - Code OTP 🔐',
    html: `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif; }
          .container { background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 40px; max-width: 600px; margin: 20px auto; }
          h1 { color: #4CAF50; font-size: 28px; }
          .otp { font-size: 36px; font-weight: bold; color: #333333; letter-spacing: 6px; }
          p { font-size: 16px; color: #666666; line-height: 1.6; }
          .footer { font-size: 13px; color: #999999; border-top: 1px solid #eeeeee; margin-top: 30px; padding-top: 20px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Bonjour ${name || 'utilisateur'}, 👋</h1>
          <p>Merci de vous être inscrit sur notre application <strong>ShadowGuard</strong>.</p>
          <p>Voici votre code de vérification :</p>
          <p class="otp">${otp}</p>
          <p>Ce code est valable pendant <strong>10 minutes</strong>.</p>
          <p>Si vous n'avez pas demandé ce code, vous pouvez ignorer cet e-mail.</p>

          <div class="footer">
            <p>© 2025 ShadowGuard. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const result = await this.transporter.sendMail(mailOptions);
    console.log('✅ OTP email sent:', result.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    return false;
  }
}
}
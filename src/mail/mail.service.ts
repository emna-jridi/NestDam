import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as dotenv from "dotenv";
dotenv.config();

@Injectable()
export class MailService {
  private transporter;
  mailerService: any;

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
async sendPasswordResetCode(email: string, name: string, code: string) {
  const mailOptions = {
    from: 'shadowguardnoreplay@gmail.com',
    to: email,
    subject: 'Code de réinitialisation de mot de passe 🔒',
    html: `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif; }
          .container { background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 40px; max-width: 600px; margin: 20px auto; }
          h1 { color: #FF5722; font-size: 28px; }
          .code { font-size: 36px; font-weight: bold; color: #333333; letter-spacing: 6px; background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
          p { font-size: 16px; color: #666666; line-height: 1.6; }
          .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; color: #856404; }
          .footer { font-size: 13px; color: #999999; border-top: 1px solid #eeeeee; margin-top: 30px; padding-top: 20px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Réinitialisation de mot de passe 🔒</h1>
          <p>Bonjour ${name || 'utilisateur'},</p>
          <p>Vous avez demandé à réinitialiser votre mot de passe sur <strong>ShadowGuard</strong>.</p>
          <p>Voici votre code de vérification :</p>
          
          <div class="code">${code}</div>
          
          <div class="warning">
            <strong>⚠️ Important :</strong> Ce code est valable pendant <strong>15 minutes</strong>.
          </div>
          
          <p>Entrez ce code dans l'application pour créer un nouveau mot de passe.</p>
          <p>Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet email et votre mot de passe restera inchangé.</p>

          <div class="footer">
            <p>Pour votre sécurité, ne partagez jamais ce code avec personne.</p>
            <p>© 2025 ShadowGuard. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const result = await this.transporter.sendMail(mailOptions);
    console.log('✅ Password reset code email sent:', result.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset code email:', error);
    return false;
  }
}

async sendPasswordChangeConfirmation(email: string, name: string) {
  const mailOptions = {
    from: 'shadowguardnoreplay@gmail.com',
    to: email,
    subject: 'Votre mot de passe a été modifié ✅',
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
          .success-icon { font-size: 64px; text-align: center; margin: 20px 0; }
          p { font-size: 16px; color: #666666; line-height: 1.6; }
          .info-box { background-color: #e8f5e9; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0; color: #2e7d32; }
          .alert-box { background-color: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; color: #c62828; }
          .footer { font-size: 13px; color: #999999; border-top: 1px solid #eeeeee; margin-top: 30px; padding-top: 20px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Mot de passe modifié avec succès</h1>
          <p>Bonjour ${name || 'utilisateur'},</p>
          
          <div class="info-box">
            <strong>✓ Confirmation :</strong> Votre mot de passe a été changé avec succès.
          </div>
          
          <p>Votre mot de passe <strong>ShadowGuard</strong> a été modifié le <strong>${new Date().toLocaleDateString('fr-FR', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</strong>.</p>
          
          <p>Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
          
          <div class="alert-box">
            <strong>🔐 Attention :</strong> Si vous n'êtes pas à l'origine de ce changement, veuillez contacter notre support immédiatement.
          </div>

          <div class="footer">
            <p>Cet email est envoyé automatiquement, veuillez ne pas y répondre.</p>
            <p>© 2025 ShadowGuard. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const result = await this.transporter.sendMail(mailOptions);
    console.log('✅ Password change confirmation email sent:', result.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending password change confirmation email:', error);
    return false;
  }
}
}
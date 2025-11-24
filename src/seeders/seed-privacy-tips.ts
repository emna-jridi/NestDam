import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { PrivacyTip, PrivacyTipDocument } from '../privacy-tips/schemas/privacy-tip.schema';
import { getModelToken } from '@nestjs/mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const initialTips = [
  {
    title: 'Review App Permissions Regularly',
    content:
      'Regularly review which apps have access to your location, camera, microphone, and contacts. Remove permissions from apps that don\'t need them. Go to your device settings and review app permissions monthly.',
    category: 'permissions',
    priority: 'high',
    icon: 'location.fill',
    actionable: true,
    actionText: 'Review Permissions',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Enable Two-Factor Authentication',
    content:
      'Two-factor authentication adds an extra layer of security to your accounts. Enable 2FA on all your important accounts, especially email, banking, and social media. Use an authenticator app instead of SMS when possible.',
    category: 'data_protection',
    priority: 'high',
    icon: 'lock.shield',
    actionable: true,
    actionText: 'Enable 2FA',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Keep Your Apps Updated',
    content:
      'App updates often include important security patches. Enable automatic updates or check for updates regularly. Outdated apps may have known vulnerabilities that hackers can exploit.',
    category: 'app_security',
    priority: 'medium',
    icon: 'arrow.down.circle',
    actionable: true,
    actionText: 'Check Updates',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Use Strong, Unique Passwords',
    content:
      'Use a different password for each account. Consider using a password manager to generate and store strong passwords. Avoid using personal information or common words in your passwords.',
    category: 'data_protection',
    priority: 'high',
    icon: 'key.fill',
    actionable: true,
    actionText: 'Use Password Manager',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Be Cautious with Public Wi-Fi',
    content:
      'Avoid accessing sensitive information or making financial transactions on public Wi-Fi networks. If you must use public Wi-Fi, use a VPN to encrypt your connection.',
    category: 'data_protection',
    priority: 'medium',
    icon: 'wifi',
    actionable: true,
    actionText: 'Use VPN',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Review Privacy Policies',
    content:
      'Before installing an app, read its privacy policy to understand what data it collects and how it\'s used. Be especially cautious with apps that request excessive permissions.',
    category: 'app_security',
    priority: 'medium',
    icon: 'doc.text',
    actionable: false,
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Limit Location Sharing',
    content:
      'Only share your location with apps that truly need it. Consider using approximate location instead of precise location when possible. Review location permissions regularly.',
    category: 'permissions',
    priority: 'high',
    icon: 'location.circle',
    actionable: true,
    actionText: 'Review Location Settings',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Check App Permissions Before Installing',
    content:
      'Before installing a new app, review the permissions it requests. If an app asks for permissions that seem unnecessary for its function, consider finding an alternative.',
    category: 'permissions',
    priority: 'medium',
    icon: 'app.badge',
    actionable: false,
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Use App Lock or Biometric Security',
    content:
      'Enable app lock or biometric authentication (fingerprint, face ID) for sensitive apps like banking, email, and password managers. This adds an extra layer of protection if your device is lost or stolen.',
    category: 'app_security',
    priority: 'high',
    icon: 'faceid',
    actionable: true,
    actionText: 'Enable App Lock',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Regularly Review Installed Apps',
    content:
      'Periodically review your installed apps and remove ones you no longer use. Unused apps may still have access to your data and could pose security risks if not updated.',
    category: 'app_security',
    priority: 'medium',
    icon: 'trash',
    actionable: true,
    actionText: 'Review Apps',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Enable Find My Device',
    content:
      'Enable "Find My Device" or similar features on your phone. This allows you to locate, lock, or erase your device remotely if it\'s lost or stolen.',
    category: 'data_protection',
    priority: 'high',
    icon: 'location.magnifyingglass',
    actionable: true,
    actionText: 'Enable Find My Device',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Be Wary of Phishing Attempts',
    content:
      'Be cautious of emails, messages, or pop-ups asking for personal information or login credentials. Legitimate companies will never ask for passwords via email or text.',
    category: 'data_protection',
    priority: 'high',
    icon: 'exclamationmark.triangle',
    actionable: false,
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Use Encrypted Messaging Apps',
    content:
      'Use end-to-end encrypted messaging apps for sensitive conversations. Apps like Signal or WhatsApp (with encryption enabled) protect your messages from being intercepted.',
    category: 'data_protection',
    priority: 'medium',
    icon: 'message',
    actionable: true,
    actionText: 'Use Encrypted Apps',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Review App Store Ratings and Reviews',
    content:
      'Before installing an app, check its ratings and read recent reviews. Look for complaints about privacy issues, excessive ads, or suspicious behavior.',
    category: 'app_security',
    priority: 'low',
    icon: 'star.fill',
    actionable: false,
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Disable Unnecessary Background App Refresh',
    content:
      'Limit background app refresh to only essential apps. This not only saves battery but also reduces the amount of data apps can collect in the background.',
    category: 'permissions',
    priority: 'medium',
    icon: 'arrow.clockwise',
    actionable: true,
    actionText: 'Review Background Refresh',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Check for Data Breaches',
    content:
      'Regularly check if your email has been involved in data breaches. Use services like Have I Been Pwned to monitor your accounts and change passwords if needed.',
    category: 'data_protection',
    priority: 'high',
    icon: 'shield.checkered',
    actionable: true,
    actionText: 'Check Breaches',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Use Private Browsing for Sensitive Searches',
    content:
      'Use private or incognito browsing mode when searching for sensitive information. This prevents your search history from being saved and reduces tracking.',
    category: 'data_protection',
    priority: 'low',
    icon: 'eye.slash',
    actionable: true,
    actionText: 'Use Private Browsing',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Review Social Media Privacy Settings',
    content:
      'Regularly review and update your social media privacy settings. Limit who can see your posts, profile information, and location. Be cautious about sharing personal information publicly.',
    category: 'data_protection',
    priority: 'medium',
    icon: 'person.2',
    actionable: true,
    actionText: 'Review Privacy Settings',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Enable Automatic Screen Lock',
    content:
      'Set your device to automatically lock after a short period of inactivity. Use a strong PIN, pattern, or biometric authentication to unlock your device.',
    category: 'app_security',
    priority: 'high',
    icon: 'lock',
    actionable: true,
    actionText: 'Enable Auto Lock',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Be Cautious with App Permissions for Camera and Microphone',
    content:
      'Only grant camera and microphone access to apps that genuinely need them. Be especially careful with apps that request these permissions but don\'t seem to require them for their core function.',
    category: 'permissions',
    priority: 'high',
    icon: 'camera.fill',
    actionable: true,
    actionText: 'Review Camera/Mic Permissions',
    aiGenerated: false,
    isActive: true,
  },
  {
    title: 'Regularly Backup Your Data',
    content:
      'Regularly backup your important data to a secure cloud service or external storage. This protects your data in case of device loss, theft, or malware attacks.',
    category: 'data_protection',
    priority: 'medium',
    icon: 'icloud',
    actionable: true,
    actionText: 'Backup Data',
    aiGenerated: false,
    isActive: true,
  },
];

async function seedPrivacyTips() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const tipModel = app.get<Model<PrivacyTipDocument>>(
    getModelToken(PrivacyTip.name),
  );

  try {
    console.log('🌱 Seeding privacy tips...');

    let created = 0;
    let skipped = 0;

    for (const tipData of initialTips) {
      const existing = await tipModel.findOne({ title: tipData.title });
      if (existing) {
        console.log(`⏭️  Skipping existing tip: ${tipData.title}`);
        skipped++;
        continue;
      }

      await tipModel.create(tipData);
      console.log(`✅ Created tip: ${tipData.title}`);
      created++;
    }

    console.log('\n📊 Seeding Summary:');
    console.log(`   Created: ${created} tips`);
    console.log(`   Skipped: ${skipped} tips`);
    console.log(`   Total: ${initialTips.length} tips`);
    console.log('\n✅ Privacy tips seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding privacy tips:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  } finally {
    await app.close();
  }
}

seedPrivacyTips().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});


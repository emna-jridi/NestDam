
import { Injectable, Logger } from '@nestjs/common';
import { DANGEROUS_PERMISSIONS } from 'src/scan/shared/constants/permissions.constants';

export interface PermissionAnalysis {
  permission: string;
  displayName: string;
  category: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskScore: number;
  description: string;
  justification?: string;
  isJustified: boolean;
}

@Injectable()
export class PermissionAnalyzerService {
  private readonly logger = new Logger(PermissionAnalyzerService.name);

  private readonly permissionsDatabase = {
    
    'android.permission.READ_SMS': {
      displayName: 'Lire les SMS',
      category: 'Communication',
      riskLevel: 'CRITICAL' as const,
      riskScore: 100,
      description: 'Permet de lire tous vos messages SMS, y compris les codes de vérification et informations sensibles.',
    },
    'android.permission.SEND_SMS': {
      displayName: 'Envoyer des SMS',
      category: 'Communication',
      riskLevel: 'CRITICAL' as const,
      riskScore: 95,
      description: 'Peut envoyer des SMS depuis votre téléphone, potentiellement vers des numéros surtaxés.',
    },
    'android.permission.RECEIVE_SMS': {
      displayName: 'Recevoir des SMS',
      category: 'Communication',
      riskLevel: 'CRITICAL' as const,
      riskScore: 90,
      description: 'Intercepte les SMS entrants, incluant les codes 2FA.',
    },
    'android.permission.READ_CALL_LOG': {
      displayName: 'Lire l\'historique d\'appels',
      category: 'Communication',
      riskLevel: 'CRITICAL' as const,
      riskScore: 90,
      description: 'Accède à l\'historique complet de vos appels téléphoniques.',
    },
    'android.permission.WRITE_CALL_LOG': {
      displayName: 'Modifier l\'historique d\'appels',
      category: 'Communication',
      riskLevel: 'CRITICAL' as const,
      riskScore: 85,
      description: 'Peut modifier ou supprimer votre historique d\'appels.',
    },
    'android.permission.CALL_PHONE': {
      displayName: 'Passer des appels',
      category: 'Communication',
      riskLevel: 'HIGH' as const,
      riskScore: 80,
      description: 'Peut composer des numéros et passer des appels sans votre consentement.',
    },

    // HIGH (Score: 70-89)
    'android.permission.RECORD_AUDIO': {
      displayName: 'Enregistrer l\'audio',
      category: 'Microphone',
      riskLevel: 'HIGH' as const,
      riskScore: 85,
      description: 'Peut enregistrer l\'audio via le microphone, potentiellement en arrière-plan.',
    },
    'android.permission.CAMERA': {
      displayName: 'Utiliser la caméra',
      category: 'Caméra',
      riskLevel: 'HIGH' as const,
      riskScore: 80,
      description: 'Accès à la caméra pour prendre des photos et vidéos.',
    },
    'android.permission.READ_CONTACTS': {
      displayName: 'Lire les contacts',
      category: 'Contacts',
      riskLevel: 'HIGH' as const,
      riskScore: 85,
      description: 'Accès complet à votre liste de contacts avec noms, numéros et emails.',
    },
    'android.permission.WRITE_CONTACTS': {
      displayName: 'Modifier les contacts',
      category: 'Contacts',
      riskLevel: 'HIGH' as const,
      riskScore: 80,
      description: 'Peut ajouter, modifier ou supprimer vos contacts.',
    },
    'android.permission.GET_ACCOUNTS': {
      displayName: 'Lire les comptes',
      category: 'Comptes',
      riskLevel: 'HIGH' as const,
      riskScore: 75,
      description: 'Accès à la liste des comptes configurés sur votre appareil (Google, Facebook, etc.).',
    },
    'android.permission.ACCESS_FINE_LOCATION': {
      displayName: 'Localisation précise',
      category: 'Localisation',
      riskLevel: 'HIGH' as const,
      riskScore: 85,
      description: 'Localisation GPS précise (jusqu\'à quelques mètres).',
    },
    'android.permission.ACCESS_COARSE_LOCATION': {
      displayName: 'Localisation approximative',
      category: 'Localisation',
      riskLevel: 'MEDIUM' as const,
      riskScore: 60,
      description: 'Localisation approximative basée sur les antennes réseau.',
    },
    'android.permission.ACCESS_BACKGROUND_LOCATION': {
      displayName: 'Localisation en arrière-plan',
      category: 'Localisation',
      riskLevel: 'HIGH' as const,
      riskScore: 90,
      description: 'Suit votre position même quand l\'application est fermée.',
    },

    // MEDIUM (Score: 40-69)
    'android.permission.READ_CALENDAR': {
      displayName: 'Lire le calendrier',
      category: 'Calendrier',
      riskLevel: 'MEDIUM' as const,
      riskScore: 65,
      description: 'Accès à tous vos événements de calendrier.',
    },
    'android.permission.WRITE_CALENDAR': {
      displayName: 'Modifier le calendrier',
      category: 'Calendrier',
      riskLevel: 'MEDIUM' as const,
      riskScore: 60,
      description: 'Peut créer, modifier ou supprimer des événements.',
    },
    'android.permission.READ_EXTERNAL_STORAGE': {
      displayName: 'Lire le stockage',
      category: 'Stockage',
      riskLevel: 'MEDIUM' as const,
      riskScore: 70,
      description: 'Accès en lecture à tous vos fichiers (photos, documents, etc.).',
    },
    'android.permission.WRITE_EXTERNAL_STORAGE': {
      displayName: 'Écrire sur le stockage',
      category: 'Stockage',
      riskLevel: 'MEDIUM' as const,
      riskScore: 65,
      description: 'Peut créer, modifier ou supprimer des fichiers.',
    },
    'android.permission.READ_MEDIA_IMAGES': {
      displayName: 'Lire les images',
      category: 'Média',
      riskLevel: 'MEDIUM' as const,
      riskScore: 60,
      description: 'Accès à vos photos et images.',
    },
    'android.permission.READ_MEDIA_VIDEO': {
      displayName: 'Lire les vidéos',
      category: 'Média',
      riskLevel: 'MEDIUM' as const,
      riskScore: 60,
      description: 'Accès à vos vidéos.',
    },
    'android.permission.READ_PHONE_STATE': {
      displayName: 'État du téléphone',
      category: 'Téléphone',
      riskLevel: 'MEDIUM' as const,
      riskScore: 65,
      description: 'Accès à l\'IMEI, numéro de téléphone, et état des appels.',
    },
    'android.permission.BLUETOOTH': {
      displayName: 'Bluetooth',
      category: 'Connectivité',
      riskLevel: 'MEDIUM' as const,
      riskScore: 50,
      description: 'Connexion à des appareils Bluetooth.',
    },
    'android.permission.BLUETOOTH_CONNECT': {
      displayName: 'Connexion Bluetooth',
      category: 'Connectivité',
      riskLevel: 'MEDIUM' as const,
      riskScore: 55,
      description: 'Se connecter à des appareils Bluetooth appairés.',
    },

    // LOW (Score: 0-39)
    'android.permission.INTERNET': {
      displayName: 'Accès Internet',
      category: 'Réseau',
      riskLevel: 'LOW' as const,
      riskScore: 20,
      description: 'Nécessaire pour accéder à Internet.',
    },
    'android.permission.ACCESS_NETWORK_STATE': {
      displayName: 'État du réseau',
      category: 'Réseau',
      riskLevel: 'LOW' as const,
      riskScore: 10,
      description: 'Vérifie si vous êtes connecté à Internet.',
    },
    'android.permission.ACCESS_WIFI_STATE': {
      displayName: 'État du WiFi',
      category: 'Réseau',
      riskLevel: 'LOW' as const,
      riskScore: 10,
      description: 'Vérifie l\'état de la connexion WiFi.',
    },
    'android.permission.VIBRATE': {
      displayName: 'Vibration',
      category: 'Appareil',
      riskLevel: 'LOW' as const,
      riskScore: 5,
      description: 'Fait vibrer l\'appareil.',
    },
    'android.permission.WAKE_LOCK': {
      displayName: 'Maintenir actif',
      category: 'Appareil',
      riskLevel: 'LOW' as const,
      riskScore: 15,
      description: 'Empêche l\'appareil de se mettre en veille.',
    },
    'android.permission.RECEIVE_BOOT_COMPLETED': {
      displayName: 'Démarrage automatique',
      category: 'Système',
      riskLevel: 'LOW' as const,
      riskScore: 25,
      description: 'Lance l\'application au démarrage du téléphone.',
    },
    'android.permission.FOREGROUND_SERVICE': {
      displayName: 'Service en premier plan',
      category: 'Système',
      riskLevel: 'LOW' as const,
      riskScore: 30,
      description: 'Permet d\'exécuter des tâches en arrière-plan avec notification.',
    },
    'com.google.android.c2dm.permission.RECEIVE': {
      displayName: 'Notifications push',
      category: 'Notifications',
      riskLevel: 'LOW' as const,
      riskScore: 15,
      description: 'Recevoir des notifications push.',
    },
  };

  analyzePermissions(
    permissions: string[],
    appCategory?: string,
  ): {
    totalScore: number;
    permissions: PermissionAnalysis[];
    summary: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      unknown: number;
    };
    unjustifiedPermissions: PermissionAnalysis[];
  } {
    const analyses: PermissionAnalysis[] = [];
    const summary = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    let totalScore = 0;

    for (const permission of permissions) {
      const analysis = this.analyzePermission(permission, appCategory);
      analyses.push(analysis);
      totalScore += analysis.riskScore;
      if (analysis.riskLevel === 'CRITICAL') summary.critical++;
      else if (analysis.riskLevel === 'HIGH') summary.high++;
      else if (analysis.riskLevel === 'MEDIUM') summary.medium++;
      else if (analysis.riskLevel === 'LOW') summary.low++;
      else summary.unknown++;
    }

    const unjustifiedPermissions = analyses.filter(a => !a.isJustified);

    return {
      totalScore,
      permissions: analyses,
      summary,
      unjustifiedPermissions,
    };
  }

  private analyzePermission(
    permission: string,
    appCategory?: string,
  ): PermissionAnalysis {
    const permData = this.permissionsDatabase[permission];

    if (permData) {
      const isJustified = this.isPermissionJustified(permission, appCategory);
      return {
        permission,
        ...permData,
        justification: isJustified
          ? this.getJustification(permission, appCategory)
          : undefined,
        isJustified,
      };
    }

    this.logger.warn(`Unknown permission: ${permission}`);
    return {
      permission,
      displayName: this.formatPermissionName(permission),
      category: 'Inconnu',
      riskLevel: 'MEDIUM',
      riskScore: 50,
      description: 'Permission non documentée - vérification recommandée',
      isJustified: false,
    };
  }

 
  private isPermissionJustified(permission: string, category?: string): boolean {
    if (!category) return true; 

    const justifications = {
      Communication: [
        'android.permission.READ_CONTACTS',
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.INTERNET',
      ],
      Social: [
        'android.permission.CAMERA',
        'android.permission.READ_CONTACTS',
        'android.permission.INTERNET',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
      Photography: [
        'android.permission.CAMERA',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ],
      'Video Players & Editors': [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ],
      'Maps & Navigation': [
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
      ],

      Weather: [
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.INTERNET',
      ],
      'Health & Fitness': [
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.BLUETOOTH',
        'android.permission.BLUETOOTH_CONNECT',
      ],

      Games: [
        'android.permission.INTERNET',
        'android.permission.VIBRATE',
      ],

      // Apps utilitaires
      Tools: [
        'android.permission.INTERNET',
        'android.permission.VIBRATE',
      ],
    };

    const allowedPerms = justifications[category] || [];
    return allowedPerms.includes(permission);
  }

  private getJustification(permission: string, category?: string): string {
    const justifications = {
      'android.permission.CAMERA': {
        Communication: 'Nécessaire pour les appels vidéo et partage de photos',
        Social: 'Pour publier des photos et vidéos',
        Photography: 'Fonction principale de l\'application',
      },
      'android.permission.ACCESS_FINE_LOCATION': {
        'Maps & Navigation': 'Indispensable pour la navigation',
        Weather: 'Pour afficher la météo locale',
        Social: 'Partage de localisation et check-ins',
      },
      'android.permission.RECORD_AUDIO': {
        Communication: 'Pour les appels vocaux',
        Social: 'Enregistrement de messages vocaux',
      },
    };

    return justifications[permission]?.[category] || 'Permission justifiée';
  }
  private formatPermissionName(permission: string): string {
    return permission
      .replace('android.permission.', '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  getDangerousPermissions(permissions: string[]): string[] {
    return permissions.filter(perm => {
      const data = this.permissionsDatabase[perm];
      return data && (data.riskLevel === 'HIGH' || data.riskLevel === 'CRITICAL');
    });
  }
  isDangerousPermission(permission: string): boolean {
  const permData = this.permissionsDatabase[permission];
  if (permData) {
    return permData.riskLevel === 'HIGH' || permData.riskLevel === 'CRITICAL';
  }
  const permName = permission
    .replace('android.permission.', '')
    .toUpperCase();

  return DANGEROUS_PERMISSIONS.includes(permName);
}

  calculatePermissionRiskScore(permissions: string[]): number {
    if (permissions.length === 0) return 100; // Aucune permission = sûr

    const analysis = this.analyzePermissions(permissions);
    const avgScore = analysis.totalScore / permissions.length;
    return Math.max(0, 100 - avgScore);
  }
}
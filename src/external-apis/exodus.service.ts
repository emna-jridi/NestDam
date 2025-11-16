import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TrackerService } from '../app-registry/tracker.service';

interface TrackerCache {
  [packageName: string]: {
    trackers: string[];
    timestamp: number;
  };
}

@Injectable()
export class ExodusService implements OnModuleInit {
  private readonly logger = new Logger(ExodusService.name);
  
  private readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 jours
  private cache: TrackerCache = {};
  
  // ✅ Map de package → trackers (chargée depuis MongoDB)
  private packageTrackerMap: Map<string, string[]> = new Map();

  constructor(
    private readonly trackerService: TrackerService,
  ) {}

  /**
   * ✅ Charger les trackers au démarrage
   */
  async onModuleInit() {
    await this.loadTrackerMappings();
  }

  /**
   * ✅ Charger les mappings package → trackers
   * (Tu peux compléter cette map avec tes données)
   */
  private async loadTrackerMappings() {
    this.logger.log('📥 Loading tracker mappings...');

    // ✅ Base de données de mappings package → tracker names
    this.packageTrackerMap = new Map([
      // Social Media
      ['com.facebook.katana', ['Facebook Analytics', 'Facebook Login', 'Facebook Places', 'Facebook Share']],
      ['com.facebook.orca', ['Facebook Analytics', 'Facebook Login']],
      ['com.instagram.android', ['Facebook Analytics', 'Facebook Login', 'Instagram SDK']],
      ['com.whatsapp', ['Facebook Analytics', 'Google Firebase Analytics', 'Google CrashLytics']],
      ['com.twitter.android', ['Google Firebase Analytics', 'Google CrashLytics', 'Twitter MoPub', 'Fabric']],
      ['com.snapchat.android', ['Adjust', 'Google Firebase Analytics', 'Flurry', 'Leanplum']],
      ['com.linkedin.android', ['Google Firebase Analytics', 'AppsFlyer', 'Branch']],
      
      // Entertainment
      ['com.spotify.music', ['Adjust', 'Google Firebase Analytics', 'AppsFlyer', 'Branch']],
      ['com.netflix.mediaclient', ['Google Firebase Analytics', 'Adjust']],
      ['com.zhiliaoapp.musically', ['AppsFlyer', 'Adjust', 'Google Firebase Analytics', 'Facebook Analytics']], // TikTok
      ['com.google.android.youtube', ['Google Firebase Analytics', 'Google Ads', 'Google DoubleClick']],
      
      // E-commerce
      ['com.amazon.mShop.android.shopping', ['Amazon Mobile Ads', 'Google Firebase Analytics']],
      ['com.alibaba.aliexpresshd', ['Google Firebase Analytics', 'AppsFlyer']],
      ['com.ebay.mobile', ['Google Firebase Analytics', 'AppsFlyer', 'Criteo']],
      
      // Gaming
      ['com.king.candycrushsaga', ['Facebook Analytics', 'Adjust', 'Google Firebase Analytics']],
      ['com.supercell.clashofclans', ['Google Firebase Analytics', 'AppsFlyer']],
      
      // Productivity
      ['com.microsoft.office.outlook', ['Microsoft App Center Analytics', 'Google Firebase Analytics']],
      ['com.google.android.apps.docs', ['Google Firebase Analytics', 'Google Ads']],
      ['com.dropbox.android', ['Google Firebase Analytics', 'Crashlytics']],
      
      // Dating
      ['com.tinder', ['Facebook Analytics', 'Adjust', 'AppsFlyer', 'Google Firebase Analytics']],
      ['com.bumble.app', ['Facebook Analytics', 'Adjust', 'Branch']],
      
      // Travel
      ['com.booking', ['Google Firebase Analytics', 'AppsFlyer', 'Adjust']],
      ['com.airbnb.android', ['Facebook Analytics', 'Google Firebase Analytics', 'Branch']],
    ]);

    const stats = await this.trackerService.getStats();
    this.logger.log(`✅ Tracker DB stats: ${stats.total} trackers in ${stats.byCategory.length} categories`);
  }

  /**
   * ✅ MÉTHODE PRINCIPALE : Récupérer les trackers
   */
  async getTrackers(packageName: string): Promise<string[]> {
    // 1. Vérifier le cache
    const cached = this.cache[packageName];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.debug(`📦 Using cached trackers for ${packageName}`);
      return cached.trackers;
    }

    // 2. Rechercher dans la map
    const mappedTrackers = this.packageTrackerMap.get(packageName);
    if (mappedTrackers && mappedTrackers.length > 0) {
      this.logger.log(`✅ Found ${mappedTrackers.length} trackers (mapping) for ${packageName}`);
      
      // Mettre en cache
      this.cache[packageName] = {
        trackers: mappedTrackers,
        timestamp: Date.now(),
      };
      
      return mappedTrackers;
    }

    // 3. Fallback : Détection heuristique
    const heuristicTrackers = this.detectByHeuristic(packageName);
    if (heuristicTrackers.length > 0) {
      this.logger.log(`✅ Detected ${heuristicTrackers.length} trackers (heuristic) for ${packageName}`);
      
      this.cache[packageName] = {
        trackers: heuristicTrackers,
        timestamp: Date.now(),
      };
      
      return heuristicTrackers;
    }

    // 4. Aucun tracker trouvé
    this.logger.debug(`ℹ️ No trackers found for ${packageName}`);
    
    this.cache[packageName] = {
      trackers: [],
      timestamp: Date.now(),
    };
    
    return [];
  }

  /**
   * ✅ Détection heuristique
   */
  private detectByHeuristic(packageName: string): string[] {
    const trackers: string[] = [];
    const lower = packageName.toLowerCase();

    // Facebook/Meta apps
    if (lower.includes('facebook') || lower.includes('instagram') || lower.includes('whatsapp')) {
      trackers.push('Facebook Analytics');
    }

    // Google apps
    if (lower.includes('google')) {
      trackers.push('Google Firebase Analytics', 'Google Ads');
    }

    // Twitter
    if (lower.includes('twitter')) {
      trackers.push('Google Firebase Analytics', 'Twitter MoPub');
    }

    // Games
    if (lower.includes('game') || lower.includes('play')) {
      trackers.push('Google Firebase Analytics', 'Unity Ads');
    }

    // Music/Video
    if (lower.includes('music') || lower.includes('video') || lower.includes('spotify')) {
      trackers.push('Google Firebase Analytics');
    }

    return [...new Set(trackers)];
  }

  /**
   * ✅ Récupérer les infos détaillées des trackers depuis MongoDB
   */
  async getTrackerDetails(trackerNames: string[]): Promise<any[]> {
    const trackers = await this.trackerService.findTrackersByNames(trackerNames);
    
    return trackers.map(t => ({
      name: t.name,
      company: t.company,
      category: t.category,
      description: t.description,
      websiteUrl: t.websiteUrl,
      privacyImpact: t.privacyImpact,
    }));
  }

  /**
   * ✅ Ajouter un mapping package → trackers
   */
  addPackageMapping(packageName: string, trackers: string[]): void {
    this.packageTrackerMap.set(packageName, trackers);
    this.logger.log(`✅ Added mapping for ${packageName}: ${trackers.length} trackers`);
  }

  /**
   * ✅ Statistiques
   */
  getStats(): any {
    return {
      cacheSize: Object.keys(this.cache).length,
      mappingsSize: this.packageTrackerMap.size,
    };
  }
}
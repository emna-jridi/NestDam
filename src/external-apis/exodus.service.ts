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
  
  // ✅ Map de package → trackers (enrichie)
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
   */
  private async loadTrackerMappings() {
    this.logger.log('📥 Loading tracker mappings...');

    // ✅ Base de données ENRICHIE de mappings package → tracker names
    this.packageTrackerMap = new Map([
      // ========== SOCIAL MEDIA ==========
      ['com.facebook.katana', ['Facebook Analytics', 'Facebook Login', 'Facebook Places', 'Facebook Share']],
      ['com.facebook.orca', ['Facebook Analytics', 'Facebook Login', 'Facebook Messenger']],
      ['com.instagram.android', ['Facebook Analytics', 'Facebook Login', 'Instagram Insights']],
      ['com.whatsapp', []],  // ✅ E2E encrypted, no trackers
      ['com.twitter.android', ['Google Firebase Analytics', 'Google CrashLytics', 'Twitter MoPub', 'Fabric']],
      ['com.snapchat.android', ['Adjust', 'Google Firebase Analytics', 'Flurry', 'Leanplum']],
      ['com.linkedin.android', ['Google Firebase Analytics', 'AppsFlyer', 'Branch', 'LinkedIn Analytics']],
      ['com.pinterest', ['Google Firebase Analytics', 'AppsFlyer', 'Branch', 'Pinterest Analytics']],
      ['com.reddit.frontpage', ['Google Firebase Analytics', 'Crashlytics', 'Branch']],
      
      // ========== ENTERTAINMENT ==========
      ['com.spotify.music', ['Adjust', 'Google Firebase Analytics', 'AppsFlyer', 'Branch']],
      ['com.netflix.mediaclient', ['Google Firebase Analytics', 'Adjust']],
      ['com.zhiliaoapp.musically', ['AppsFlyer', 'Adjust', 'Google Firebase Analytics', 'Facebook Analytics']], // TikTok
      ['com.google.android.youtube', ['Google Firebase Analytics', 'Google Ads', 'Google DoubleClick']],
      ['com.soundcloud.android', ['Google Firebase Analytics', 'AppsFlyer', 'Adjust']],
      
      // ========== E-COMMERCE ==========
      ['com.amazon.mShop.android.shopping', ['Amazon Mobile Ads', 'Google Firebase Analytics']],
      ['com.alibaba.aliexpresshd', ['Google Firebase Analytics', 'AppsFlyer', 'Alibaba Analytics']],
      ['com.ebay.mobile', ['Google Firebase Analytics', 'AppsFlyer', 'Criteo']],
      ['com.shopify.mobile', ['Google Firebase Analytics', 'Shopify Analytics']],
      ['com.zzkko', ['Google Firebase Analytics', 'AppsFlyer', 'Adjust']], // SHEIN
      ['com.wish.buyer', ['Google Firebase Analytics', 'AppsFlyer', 'Facebook Analytics']],
      
      // ========== GAMING ==========
      ['com.king.candycrushsaga', ['Facebook Analytics', 'Adjust', 'Google Firebase Analytics']],
      ['com.supercell.clashofclans', ['Google Firebase Analytics', 'AppsFlyer']],
      ['com.supercell.brawlstars', ['Google Firebase Analytics', 'AppsFlyer']],
      ['com.miHoYo.GenshinImpact', ['Google Firebase Analytics', 'Adjust']],
      ['com.mojang.minecraftpe', ['Google Firebase Analytics', 'Microsoft App Center']],
      ['com.roblox.client', ['Google Firebase Analytics', 'AppsFlyer', 'Adjust']],
      
      // ========== PRODUCTIVITY ==========
      ['com.microsoft.office.outlook', ['Microsoft App Center Analytics', 'Google Firebase Analytics']],
      ['com.microsoft.teams', ['Microsoft App Center Analytics', 'Google Firebase Analytics']],
      ['com.microsoft.skydrive', ['Microsoft App Center Analytics']], // OneDrive
      ['com.google.android.apps.docs', ['Google Firebase Analytics', 'Google Ads']],
      ['com.dropbox.android', ['Google Firebase Analytics', 'Crashlytics']],
      ['com.evernote', ['Google Firebase Analytics', 'AppsFlyer', 'Mixpanel']],
      ['com.notion.id', ['Google Firebase Analytics', 'Amplitude']],
      
      // ========== DATING ==========
      ['com.tinder', ['Facebook Analytics', 'Adjust', 'AppsFlyer', 'Google Firebase Analytics']],
      ['com.bumble.app', ['Facebook Analytics', 'Adjust', 'Branch']],
      ['com.match.android.matchmobile', ['Google Firebase Analytics', 'AppsFlyer']],
      
      // ========== TRAVEL ==========
      ['com.booking', ['Google Firebase Analytics', 'AppsFlyer', 'Adjust']],
      ['com.airbnb.android', ['Facebook Analytics', 'Google Firebase Analytics', 'Branch']],
      ['com.tripadvisor.tripadvisor', ['Google Firebase Analytics', 'AppsFlyer']],
      ['com.ubercab', ['Google Firebase Analytics', 'AppsFlyer', 'Branch', 'Uber Analytics']],
      ['sinet.startup.inDriver', ['Google Firebase Analytics', 'AppsFlyer']], // inDrive
      
      // ========== FOOD DELIVERY ==========
      ['com.application.zomato', ['Google Firebase Analytics', 'AppsFlyer', 'Clevertap']],
      ['com.ubercab.eats', ['Google Firebase Analytics', 'AppsFlyer', 'Branch']],
      ['com.grubhub.android', ['Google Firebase Analytics', 'AppsFlyer']],
      ['com.glovo', ['Google Firebase Analytics', 'AppsFlyer', 'Adjust']],
      
      // ========== MESSAGING ==========
      ['org.telegram.messenger', []],  // ✅ Privacy-focused
      ['com.viber.voip', ['Google Firebase Analytics', 'AppsFlyer']],
      ['com.skype.raider', ['Microsoft App Center Analytics']],
      ['us.zoom.videomeetings', ['Google Firebase Analytics', 'AppsFlyer']],
      
      // ========== FITNESS & HEALTH ==========
      ['com.fitbit.FitbitMobile', ['Google Firebase Analytics', 'AppsFlyer', 'Adjust']],
      ['com.nike.plusgps', ['Google Firebase Analytics', 'AppsFlyer', 'Adobe Analytics']],
      ['com.strava', ['Google Firebase Analytics', 'AppsFlyer', 'Adjust']],
      ['com.myfitnesspal.android', ['Google Firebase Analytics', 'AppsFlyer']],
      ['com.lbrc.PeriodCalendar', ['Google AdMob', 'Google Firebase Analytics']], // Period Tracker
      
      // ========== NEWS & MEDIA ==========
      ['flipboard.app', ['Google Firebase Analytics', 'AppsFlyer', 'Chartbeat']],
      ['com.nytimes.android', ['Google Firebase Analytics', 'AppsFlyer']],
      ['com.cnn.mobile.android.phone', ['Google Firebase Analytics', 'Adobe Analytics']],
      
      // ========== PRIVACY-FOCUSED (NO TRACKERS) ==========
      ['com.duckduckgo.mobile.android', []],  // ✅ Privacy browser
      ['org.torproject.torbrowser', []],  // ✅ Tor browser
      ['org.mozilla.firefox', ['Adjust', 'Leanplum']],  // Firefox minimal tracking
      ['org.eu.exodus_privacy.exodusprivacy', []],  // ✅ Exodus app itself
      
      // ========== XIAOMI APPS ==========
      ['com.miui.weather2', ['Xiaomi Analytics', 'Google Firebase Analytics']],
      ['com.miui.screenrecorder', ['Xiaomi Analytics']],
      ['com.miui.calculator', ['Xiaomi Analytics']],
      ['com.xiaomi.scanner', ['Xiaomi Analytics', 'Google Firebase Analytics']],
      ['com.xiaomi.smarthome', ['Xiaomi Analytics', 'Google Firebase Analytics']],
      ['com.mi.global.shop', ['Xiaomi Analytics', 'Google Firebase Analytics']],
      
      // ========== GOOGLE APPS ==========
      ['com.google.android.apps.chromecast.app', ['Google Firebase Analytics', 'Google Ads']],
      ['com.google.android.apps.maps', ['Google Firebase Analytics', 'Google Ads']],
      ['com.google.android.gm', ['Google Firebase Analytics']], // Gmail
      ['com.google.android.calendar', ['Google Firebase Analytics']],
      
      // ========== OTHER POPULAR APPS ==========
      ['com.truecaller', ['Google Firebase Analytics', 'AppsFlyer', 'Clevertap']],
      ['com.adobe.scan.android', ['Adobe Analytics', 'Google Firebase Analytics']],
      ['cn.wps.moffice_eng', ['WPS Analytics', 'Google Firebase Analytics']], // WPS Office
      ['com.shazam.android', ['Google Firebase Analytics', 'AppsFlyer']],
      ['com.kick.mobile', ['Google Firebase Analytics', 'Mixpanel']], // Kick streaming
    ]);

    const stats = await this.trackerService.getStats();
    this.logger.log(`✅ Loaded ${this.packageTrackerMap.size} package mappings`);
    this.logger.log(`✅ Tracker DB stats: ${stats.total} trackers in ${stats.byCategory.length} categories`);
  }

  /**
   * ✅ MÉTHODE PRINCIPALE : Récupérer les trackers
   */
  async getTrackers(packageName: string): Promise<string[]> {
    // 1. Vérifier le cache (7 jours)
    const cached = this.cache[packageName];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.debug(`📦 Cache hit for ${packageName}`);
      return cached.trackers;
    }

    this.logger.debug(`📦 Cache miss for ${packageName}`);

    // 2. Rechercher dans la map hardcoded
    this.logger.debug(`🔍 Checking hardcoded map for ${packageName}...`);
    const mappedTrackers = this.packageTrackerMap.get(packageName);
    
    if (mappedTrackers !== undefined) { // ✅ Peut être [] (array vide = pas de trackers)
      this.logger.log(`✅ Found ${mappedTrackers.length} trackers in map for ${packageName}`);
      
      // Mettre en cache
      this.cache[packageName] = {
        trackers: mappedTrackers,
        timestamp: Date.now(),
      };
      
      return mappedTrackers;
    }

    // 3. Fallback : Détection heuristique
    this.logger.debug(`🔍 Applying heuristic detection for ${packageName}...`);
    const heuristicTrackers = this.detectByHeuristic(packageName);
    
    if (heuristicTrackers.length > 0) {
      this.logger.log(`✅ Detected ${heuristicTrackers.length} trackers (heuristic) for ${packageName}`);
    } else {
      this.logger.debug(`ℹ️ No trackers detected for ${packageName}`);
    }
    
    // Mettre en cache (même si vide)
    this.cache[packageName] = {
      trackers: heuristicTrackers,
      timestamp: Date.now(),
    };
    
    return heuristicTrackers;
  }

  /**
   * ✅ Détection heuristique (basée sur le nom du package)
   */
  private detectByHeuristic(packageName: string): string[] {
    const trackers: string[] = [];
    const lower = packageName.toLowerCase();

    // Facebook/Meta apps
    if (lower.includes('facebook') || lower.includes('meta')) {
      trackers.push('Facebook Analytics');
    }
    if (lower.includes('instagram')) {
      trackers.push('Facebook Analytics', 'Instagram Insights');
    }

    // Google apps
    if (lower.includes('google') && !lower.includes('android.gms')) {
      trackers.push('Google Firebase Analytics');
    }

    // Twitter/X
    if (lower.includes('twitter')) {
      trackers.push('Google Firebase Analytics', 'Twitter MoPub');
    }

    // Microsoft apps
    if (lower.includes('microsoft')) {
      trackers.push('Microsoft App Center Analytics');
    }

    // Xiaomi apps
    if (lower.includes('miui') || lower.includes('xiaomi') || lower.includes('.mi.')) {
      trackers.push('Xiaomi Analytics');
    }

    // Generic indicators
    if (lower.includes('game') || lower.includes('play')) {
      trackers.push('Google Firebase Analytics');
    }

    return [...new Set(trackers)]; // Dédupliquer
  }

  /**
   * ✅ Récupérer les infos détaillées des trackers depuis MongoDB
   */
  async getTrackerDetails(trackerNames: string[]): Promise<any[]> {
    if (!trackerNames || trackerNames.length === 0) {
      return [];
    }

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
   * ✅ Ajouter un mapping package → trackers (admin endpoint)
   */
  addPackageMapping(packageName: string, trackers: string[]): void {
    this.packageTrackerMap.set(packageName, trackers);
    
    // Invalider le cache
    delete this.cache[packageName];
    
    this.logger.log(`✅ Added mapping for ${packageName}: ${trackers.length} trackers`);
  }

  /**
   * ✅ Statistiques
   */
  getStats(): any {
    return {
      cacheSize: Object.keys(this.cache).length,
      mappingsSize: this.packageTrackerMap.size,
      cacheTTL: `${this.CACHE_TTL / (24 * 60 * 60 * 1000)} days`,
    };
  }

  /**
   * ✅ Vider le cache (admin)
   */
  clearCache(): void {
    this.cache = {};
    this.logger.log('🗑️ Cache cleared');
  }

  /**
   * ✅ Recharger les mappings (admin)
   */
  async reloadMappings(): Promise<void> {
    await this.loadTrackerMappings();
    this.clearCache();
    this.logger.log('🔄 Mappings reloaded');
  }
}
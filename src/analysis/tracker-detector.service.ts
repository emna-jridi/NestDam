import { Injectable, Logger } from '@nestjs/common';
import { Tracker } from '../app-registry/schemas/tracker.schema';
import { InstalledAppDto } from 'src/scan/dto/installed-apps.dto';

@Injectable()
export class TrackerDetectorService {
  private readonly logger = new Logger(TrackerDetectorService.name);


  detectTrackers(app: InstalledAppDto, trackers: Tracker[]): Tracker[] {
    const detected: Tracker[] = [];
    const detectedIds = new Set<string>(); 

    for (const tracker of trackers) {
      // Skip si déjà détecté
      const trackerId = tracker._id?.toString() || tracker.name;
      if (detectedIds.has(trackerId)) {
        continue;
      }

      let matched = false;

      //  Matching par COMPANY NAME
      if (tracker.company && !matched) {
        matched = this.matchByCompany(app.packageName, tracker);
        if (matched) {
          detected.push(tracker);
          detectedIds.add(trackerId);
          continue;
        }
      }

      if (tracker.websiteUrl && !matched) {
        matched = this.matchByWebsite(app.packageName, tracker.websiteUrl);
        if (matched) {
          detected.push(tracker);
          detectedIds.add(trackerId);
          continue;
        }
      }

      if (tracker.name && !matched) {
        matched = this.matchByName(app.packageName, tracker.name);
        if (matched) {
          detected.push(tracker);
          detectedIds.add(trackerId);
          continue;
        }
      }

      //  Matching par NETWORK/CODE SIGNATURE (si disponible)
    //   if (!matched && (tracker.networkSignature || tracker.codeSignature)) {
    //     matched = this.matchBySignature(app, tracker);
    //     if (matched) {
    //       this.logger.debug(`   ✅ Match by signature: ${tracker.name}`);
    //       detected.push(tracker);
    //       detectedIds.add(trackerId);
    //       continue;
    //     }
    //   }
    }

    return detected;
  }

 
  private matchByCompany(packageName: string, tracker: Tracker): boolean {
    if (!tracker.company) return false;

    const company = tracker.company.toLowerCase().trim();
    const pkg = packageName.toLowerCase();

    // Matching direct
    if (pkg.includes(company)) {
      return true;
    }
    const cleanCompany = company
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(/inc$/i, '')
      .replace(/ltd$/i, '')
      .replace(/llc$/i, '');

    if (cleanCompany.length >= 3 && pkg.includes(cleanCompany)) {
      return true;
    }
    try {
      if (company.includes('*') || company.includes('|') || company.includes('[')) {
        const regex = new RegExp(company, 'i');
        if (regex.test(pkg)) {
          return true;
        }
      }
    } catch (e) {
    }

    return false;
  }

 private matchByWebsite(packageName: string, websiteUrl: string): boolean {
  if (!websiteUrl) return false;

  try {
    let cleanUrl = websiteUrl
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .toLowerCase();

    cleanUrl = cleanUrl.split('/')[0];

    const pkg = packageName.toLowerCase();
    const parts = cleanUrl.split('.');
    
    if (parts.length >= 2) {
      const sld = parts[parts.length - 2];   
      if (sld.length >= 4 && pkg.includes(sld)) {
        return true;
      }
    }

    const domainWithoutTld = cleanUrl.replace(/\.(com|net|org|io|co|app|dev)$/, '');
    
    if (domainWithoutTld.length >= 4 && pkg.includes(domainWithoutTld)) {
      return true;
    }

    if (cleanUrl.length >= 5 && pkg.includes(cleanUrl.replace(/\./g, ''))) {
      return true;
    }

  } catch (e) {
  }

  return false;
}

  private matchByName(packageName: string, trackerName: string): boolean {
    if (!trackerName) return false;
    const cleanName = trackerName
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/sdk$/i, '')
      .replace(/analytics$/i, '')
      .replace(/tracking$/i, '');

    const pkg = packageName.toLowerCase();
    if (cleanName.length >= 4 && pkg.includes(cleanName)) {
      return true;
    }

    return false;
  }

  private matchBySignature(app: InstalledAppDto, tracker: Tracker): boolean {
    if (tracker.name?.toLowerCase().includes('firebase')) {
      return (
        app.permissions.includes('android.permission.INTERNET') &&
        (app.permissions.includes('com.google.android.c2dm.permission.RECEIVE') ||
          app.permissions.some(p => p.includes('firebase')))
      );
    }
    if (tracker.name?.toLowerCase().includes('admob') || 
        tracker.name?.toLowerCase().includes('google ads')) {
      return (
        app.permissions.includes('android.permission.INTERNET') &&
        app.permissions.includes('android.permission.ACCESS_NETWORK_STATE')
      );
    }

    if (tracker.name?.toLowerCase().includes('facebook')) {
      return (
        app.permissions.includes('android.permission.INTERNET') &&
        (app.permissions.includes('android.permission.ACCESS_NETWORK_STATE') ||
          app.permissions.some(p => p.includes('facebook')))
      );
    }

    if (tracker.name?.toLowerCase().includes('appsflyer')) {
      return (
        app.permissions.includes('android.permission.INTERNET') &&
        app.permissions.includes('android.permission.ACCESS_NETWORK_STATE') &&
        app.permissions.includes('android.permission.ACCESS_WIFI_STATE')
      );
    }

    // Signature réseau générique (si disponible)
    // if (tracker.networkSignature) {
    //   try {
    //     const regex = new RegExp(tracker.networkSignature, 'i');
    //     // On ne peut pas vraiment tester ça sans analyser le réseau
    //     // Donc on retourne false pour éviter faux positifs
    //     return false;
    //   } catch (e) {
    //     return false;
    //   }
    // }

    return false;
  }

  getTrackerNames(trackers: Tracker[]): string[] {
    return trackers
      .map(t => t.name)
      .filter(name => name && name.trim().length > 0);
  }
}
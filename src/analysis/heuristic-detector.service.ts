import { Injectable } from '@nestjs/common';
import { InstalledAppDto } from '../scan/dto/installed-apps.dto';
import { IosAppDto } from '../scan/dto/ios-screenshot.dto';
import { EtipTracker } from '../external-apis/interfaces/etip-tracker.interface';

@Injectable()
export class HeuristicDetectorService {
  detectAndroid(
    app: InstalledAppDto,
    dangerousPermissions: string[],
    matchedTrackers: EtipTracker[],
  ): string[] {
    const findings: string[] = [];
    const perms = dangerousPermissions.map((p) => p.toUpperCase());

    const hasLocation = perms.some((p) =>
      ['ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'ACCESS_COARSE_LOCATION'].some(
        (k) => p.includes(k),
      ),
    );

    const hasCamera = perms.some((p) => p.includes('CAMERA'));
    const hasMic = perms.some((p) => p.includes('RECORD_AUDIO'));
    const hasContacts = perms.some((p) => p.includes('READ_CONTACTS'));
    const hasSms = perms.some(
      (p) => p.includes('READ_SMS') || p.includes('RECEIVE_SMS'),
    );
    const hasCallLog = perms.some((p) => p.includes('READ_CALL_LOG'));

    if (hasLocation && matchedTrackers.length > 2) {
      findings.push(
        'Possible precise location tracking with multiple trackers',
      );
    }

    if (hasCamera && hasMic && matchedTrackers.length > 0) {
      findings.push(
        'Camera + microphone + trackers: potential surveillance risk',
      );
    }

    if (hasContacts && matchedTrackers.length > 0) {
      findings.push(
        'Access to contacts combined with trackers: high profiling potential',
      );
    }

    if (hasSms || hasCallLog) {
      findings.push(
        'App can access SMS or call logs: sensitive metadata risk',
      );
    }

    return findings;
  }

  detectIos(app: IosAppDto): string[] {
    const findings: string[] = [];
    const name = (app.name ?? '').toLowerCase();

    if (/(facebook|tiktok|instagram|snapchat)/.test(name)) {
      findings.push(
        'Major social network – high data collection and profiling expected',
      );
    }

    if (/(vpn|proxy)/.test(name)) {
      findings.push(
        'VPN / proxy app – may inspect and redirect your network traffic',
      );
    }

    if (/(cleaner|optimizer|booster)/.test(name)) {
      findings.push(
        'Cleaner / booster apps often request broad access to device data',
      );
    }

    if (/keyboard/.test(name)) {
      findings.push(
        'Third-party keyboard can see everything you type, including passwords',
      );
    }

    return findings;
  }
}
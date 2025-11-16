import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tracker } from '../app-registry/schemas/tracker.schema';
import { InstalledAppDto } from 'src/scan/dto/installed-apps.dto';


@Injectable()
export class TrackerDetectorService {
 /**
     * Détecter les trackers dans une app installée
     */
    detectTrackers(app: InstalledAppDto, trackers: Tracker[]) {
        const detected: any[] = [];

        for (const tracker of trackers) {

            // 1️⃣ Matching REGEX sur domaine
            if (tracker.company) {
                try {
                    const regex = new RegExp(tracker.company, "i");
                    if (regex.test(app.packageName)) {
                        detected.push(tracker);
                        continue;
                    }
                } catch (e) {}
            }

            // 2️⃣ Matching par nom du package (simple)
            if (tracker.company && app.packageName.toLowerCase().includes(
                tracker.company.replace(/\\/g, "").replace(/\./g, "").toLowerCase()
            )) {
                detected.push(tracker);
                continue;
            }

            // 3️⃣ Matching par websiteUrl (si ta DB l'a)
            if (tracker.websiteUrl &&
                app.packageName.toLowerCase().includes(tracker.websiteUrl.toLowerCase())) {
                detected.push(tracker);
                continue;
            }

            // 4️⃣ Matching par permissions
            if (tracker.category === "Location") {
                if (app.permissions.some(p =>
                    p.includes("LOCATION")
                )) {
                    detected.push(tracker);
                }
            }

            if (tracker.category === "Contacts") {
                if (app.permissions.some(p =>
                    p.includes("CONTACT")
                )) {
                    detected.push(tracker);
                }
            }

            if (tracker.category === "Analytics") {
                if (app.permissions.some(p =>
                    p.includes("INTERNET")
                )) {
                    detected.push(tracker);
                }
            }
        }

        return detected;
    }
}
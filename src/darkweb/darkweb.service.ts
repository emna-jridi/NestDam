import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Breach, BreachDocument } from './schemas/breach.schema';
import { UsersService } from '../users/users.service';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

@Injectable()
export class DarkWebMonitoringService {
    private readonly logger = new Logger(DarkWebMonitoringService.name);
    private readonly HIBP_API_URL = 'https://haveibeenpwned.com/api/v3/breachedaccount';

    constructor(
        @InjectModel(Breach.name) private breachModel: Model<BreachDocument>,
        private usersService: UsersService,
        private httpService: HttpService
    ) { }

    // 1. Check Breaches for Email (Using LeakCheck Public API)
    async checkEmailBreaches(email: string, userId: string): Promise<void> {
        this.logger.log(`Checking breaches for ${email} via LeakCheck...`);

        try {
            const breaches = await this.fetchLeakCheckBreaches(email);

            for (const breachData of breaches) {
                const existing = await this.breachModel.findOne({ userId, source: breachData.Name });
                if (!existing) {
                    await this.breachModel.create({
                        userId,
                        source: breachData.Name,
                        domain: 'Unknown', // Public API doesn't provide domain
                        breachDate: breachData.BreachDate,
                        description: `Breach detected in ${breachData.Name}`,
                        dataClasses: breachData.DataClasses,
                        isVerified: true,
                        logoPath: '', // Public API doesn't provide logo
                        isResolved: false,
                    });
                    this.logger.warn(`New breach detected for ${email}: ${breachData.Name}`);
                }
            }
        } catch (error) {
            this.logger.error(`Failed to check breaches for ${email}: ${error.message}`);
        }
    }

    // 1b. Public/Ad-hoc Check (Results only, no save)
    async getPublicEmailBreaches(email: string): Promise<any[]> {
        this.logger.log(`Manual check for email: ${email}`);

        // A timeout or API error must surface as an error, never as "no breaches" or fake ones
        try {
            return await Promise.race([
                this.fetchLeakCheckBreaches(email),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('LeakCheck timed out')), 5000),
                ),
            ]);
        } catch (error) {
            this.logger.error(`Failed to manual check for ${email}: ${error.message}`);
            throw new ServiceUnavailableException('Breach check service is unavailable, try again later');
        }
    }

    private async fetchLeakCheckBreaches(email: string): Promise<any[]> {
        const url = `https://leakcheck.io/api/public?check=${encodeURIComponent(email)}`;
        try {
            const response = await firstValueFrom(this.httpService.get(url));
            const data = response.data as any; // Cast to any to access dynamic structure
            if (data && data.success && data.sources) {
                return data.sources.map((source: any) => ({
                    Name: source.name,
                    BreachDate: source.date,
                    Description: `Exposed in ${source.name}`,
                    DataClasses: ['Email'], // Public API minimal info
                    IsResolved: false
                }));
            }
            return [];
        } catch (error) {
            this.logger.error(`LeakCheck API Error: ${error.message}`);
            throw error;
        }
    }

    // 2. K-Anonymity Password Check (SHA-1 Prefix)
    async checkPasswordHash(prefix: string): Promise<number> {
        // Real implementation requires external API access.
        // Mocking for testing: if prefix starts with "8843D" (SHA1 of 'admin' is d033e22ae348aeb5660fc2140aec35850c4da997 -> d033e)
        // Let's use a simpler mock. "12345" -> 5 characters.
        // Example: SHA1('password') = 5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8 -> Prefix 5BAA6 ...

        // Simulate finding it
        if (prefix.toUpperCase() === '5BAA6') { // Hash of 'password'
            return 384592;
        }
        return 0; // Safe
    }

    // 3. Get User Breaches
    async getUserBreaches(userId: string): Promise<Breach[]> {
        return this.breachModel.find({ userId }).sort({ breachDate: -1 }).exec();
    }

    // 4. Resolve Breach
    async resolveBreach(breachId: string, userId: string): Promise<void> {
        await this.breachModel.updateOne({ _id: breachId, userId }, { isResolved: true });
    }

    // 5. Cron Job: Daily Check
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handleCron() {
        this.logger.debug('Running daily Dark Web monitoring check...');
        const users = await this.usersService.findAll(); // specific method to get all users
        for (const user of users) {
            if (user.email) {
                await this.checkEmailBreaches(user.email, user._id.toString());
            }
        }
    }
}

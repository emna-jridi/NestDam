import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { DarkWebMonitoringService } from './darkweb.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('darkweb')
@UseGuards(JwtAuthGuard)
export class DarkWebController {
    constructor(private readonly darkWebService: DarkWebMonitoringService) { }

    @Get('breaches')
    async getBreaches(@Request() req) {
        return this.darkWebService.getUserBreaches(req.user.userId);
    }

    @Post('check')
    async checkNow(@Request() req) {
        // Manually trigger a check for the authenticated user
        await this.darkWebService.checkEmailBreaches(req.user.email, req.user.userId);
        return { message: 'Breach check initiated' };
    }

    @Post('check-email')
    async checkPublicEmail(@Body('email') email: string) {
        // Ad-hoc check, returns list of breaches directly
        return this.darkWebService.getPublicEmailBreaches(email);
    }

    @Post('check-password')
    async checkPassword(@Body('prefix') prefix: string) {
        // K-Anonymity check
        const count = await this.darkWebService.checkPasswordHash(prefix);
        return { count };
    }

    @Post('resolve/:id')
    async resolveBreach(@Param('id') id: string, @Request() req) {
        await this.darkWebService.resolveBreach(id, req.user.userId);
        return { message: 'Breach marked as resolved' };
    }
}

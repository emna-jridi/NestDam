import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { DarkWebMonitoringService } from './darkweb.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckPasswordDto } from './dto/check-password.dto';

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
    async checkPassword(@Body() dto: CheckPasswordDto) {
        // K-anonymity: the app sends a 5-char hash prefix and matches its own suffix in this list.
        const suffixes = await this.darkWebService.getPwnedPasswordRange(dto.prefix);
        return { suffixes };
    }

    @Post('resolve/:id')
    async resolveBreach(@Param('id') id: string, @Request() req) {
        await this.darkWebService.resolveBreach(id, req.user.userId);
        return { message: 'Breach marked as resolved' };
    }
}

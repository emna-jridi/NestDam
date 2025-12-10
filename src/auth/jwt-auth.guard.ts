import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    
    this.logger.debug(`[JwtAuthGuard] canActivate called`);
    this.logger.debug(`[JwtAuthGuard] Authorization header: ${authHeader ? `Present (${authHeader.substring(0, 20)}...)` : 'MISSING'}`);
    this.logger.debug(`[JwtAuthGuard] Request URL: ${request.method} ${request.url}`);

    if (!authHeader) {
      this.logger.error(`[JwtAuthGuard] ✗ No Authorization header`);
      throw new UnauthorizedException('No authorization header');
    }

    if (!authHeader.startsWith('Bearer ')) {
      this.logger.error(`[JwtAuthGuard] ✗ Invalid Authorization format: ${authHeader.substring(0, 20)}`);
      throw new UnauthorizedException('Invalid authorization format');
    }

    const token = authHeader.substring(7);
    this.logger.debug(`[JwtAuthGuard] Token length: ${token.length} chars`);

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    this.logger.debug(`[JwtAuthGuard] handleRequest called`);
    
    if (err) {
      this.logger.error(`[JwtAuthGuard] ✗ Error during auth: ${err.message}`);
      throw err;
    }

    if (info) {
      this.logger.error(`[JwtAuthGuard] ✗ Auth info error: ${info.message || JSON.stringify(info)}`);
      
      if (info.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired');
      }
      if (info.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid token');
      }
      throw new UnauthorizedException(info.message || 'Authentication failed');
    }

    if (!user) {
      this.logger.error(`[JwtAuthGuard] ✗ No user returned from strategy`);
      throw new UnauthorizedException('User not found');
    }

    this.logger.log(`[JwtAuthGuard] ✓ Authentication successful for user: ${user.email || user.userId}`);
    return user;
  }
}
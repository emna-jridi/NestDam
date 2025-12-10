
import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Trop de requêtes. Veuillez réessayer plus tard.');
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Utilise l'IP et l'ID utilisateur pour le rate limiting
    const userId = req.user?.id || 'anonymous';
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    return `${ip}-${userId}`;
  }
}


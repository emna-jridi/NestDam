import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createClient } from 'redis';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        const client = createClient({
          socket: {
            host: process.env.REDIS_HOST ?? '127.0.0.1',
            port: Number(process.env.REDIS_PORT ?? '6379'),
          },
          password: process.env.REDIS_PASSWORD || undefined,
        });

        client.on('error', (err) => {
          console.error('[Redis] Error:', err);
        });

        await client.connect();
        console.log('[Redis] Connected');

        return client; // <-- NO TYPE ANNOTATION
      },
    },
    RedisService,
  ],

  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}

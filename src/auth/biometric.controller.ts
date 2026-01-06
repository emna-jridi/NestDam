import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Ip,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';
import { BiometricService } from './biometric.service';
import {
  RegisterBiometricDeviceDto,
  RequestChallengeDto,
  VerifyBiometricDto,
  RevokeDeviceDto,
} from './dto/biometric.dto';

@ApiTags('Biometric Authentication')
@Controller('auth/biometric')
export class BiometricController {
  private readonly logger = new Logger(BiometricController.name);

  constructor(private readonly biometricService: BiometricService) {}

  // ================================================
  // REGISTER DEVICE (requires authentication)
  // ================================================
  @Post('register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Register a biometric device',
    description:
      'Register a new device for biometric authentication. Requires prior authentication with email/password.',
  })
  @ApiResponse({
    status: 201,
    description: 'Device registered successfully',
    schema: {
      example: {
        success: true,
        deviceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        message: 'Device registered successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid public key format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async registerDevice(
    @Request() req,
    @Body() dto: RegisterBiometricDeviceDto,
  ) {
    this.logger.log(`[API] Register device for user: ${req.user.sub}`);
    return this.biometricService.registerDevice(req.user.sub, dto);
  }

  // ================================================
  // REQUEST CHALLENGE (public - device must exist)
  // ================================================
  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request authentication challenge',
    description:
      'Request a random challenge to sign with the device private key. Challenge is valid for 5 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Challenge generated',
    schema: {
      example: {
        challenge: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678',
        expiresAt: '2025-01-06T14:30:00.000Z',
        expiresIn: 300,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Device not registered' })
  @ApiResponse({ status: 401, description: 'Device locked due to failed attempts' })
  async requestChallenge(
    @Body() dto: RequestChallengeDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    this.logger.log(`[API] Challenge requested for device: ${dto.deviceId}`);
    return this.biometricService.requestChallenge(
      dto.deviceId,
      ipAddress,
      userAgent,
    );
  }

  // ================================================
  // VERIFY SIGNATURE & LOGIN (public)
  // ================================================
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify biometric signature and authenticate',
    description:
      'Verify the signed challenge and return authentication tokens if valid.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful',
    schema: {
      example: {
        success: true,
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: '507f1f77bcf86cd799439011',
          email: 'user@example.com',
          name: 'John Doe',
          role: 'user',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid signature or challenge' })
  @ApiResponse({ status: 404, description: 'Device not registered' })
  async verifyAndAuthenticate(@Body() dto: VerifyBiometricDto) {
    this.logger.log(`[API] Verify biometric for device: ${dto.deviceId}`);
    return this.biometricService.verifyAndAuthenticate(dto);
  }

  // ================================================
  // GET USER DEVICES (requires authentication)
  // ================================================
  @Get('devices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all registered biometric devices',
    description: 'Returns a list of all biometric devices registered by the current user.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of devices',
    schema: {
      example: [
        {
          id: '507f1f77bcf86cd799439011',
          deviceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          deviceName: 'Samsung Galaxy S24 Ultra',
          platform: 'android',
          osVersion: 'Android 14',
          isActive: true,
          lastUsedAt: '2025-01-06T12:00:00.000Z',
          authCount: 42,
          createdAt: '2025-01-01T10:00:00.000Z',
        },
      ],
    },
  })
  async getUserDevices(@Request() req) {
    this.logger.log(`[API] Get devices for user: ${req.user.sub}`);
    return this.biometricService.getUserDevices(req.user.sub);
  }

  // ================================================
  // CHECK BIOMETRIC STATUS (requires authentication)
  // ================================================
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check if user has biometric enabled',
    description: 'Returns whether the user has any active biometric devices.',
  })
  @ApiResponse({
    status: 200,
    description: 'Biometric status',
    schema: {
      example: {
        biometricEnabled: true,
        deviceCount: 2,
      },
    },
  })
  async getBiometricStatus(@Request() req) {
    const devices = await this.biometricService.getUserDevices(req.user.sub);
    const activeDevices = devices.filter((d) => d.isActive);
    return {
      biometricEnabled: activeDevices.length > 0,
      deviceCount: activeDevices.length,
    };
  }

  // ================================================
  // REVOKE DEVICE (requires authentication)
  // ================================================
  @Post('devices/:deviceId/revoke')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke a biometric device',
    description:
      'Revoke (disable) a device. The device can be re-registered later.',
  })
  @ApiParam({ name: 'deviceId', description: 'Device ID to revoke' })
  @ApiResponse({ status: 200, description: 'Device revoked' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async revokeDevice(
    @Request() req,
    @Param('deviceId') deviceId: string,
    @Body() dto: RevokeDeviceDto,
  ) {
    this.logger.log(`[API] Revoke device ${deviceId} for user: ${req.user.sub}`);
    return this.biometricService.revokeDevice(req.user.sub, deviceId, dto.reason);
  }

  // ================================================
  // DELETE DEVICE (requires authentication)
  // ================================================
  @Delete('devices/:deviceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a biometric device permanently',
    description: 'Permanently delete a device registration.',
  })
  @ApiParam({ name: 'deviceId', description: 'Device ID to delete' })
  @ApiResponse({ status: 200, description: 'Device deleted' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async deleteDevice(@Request() req, @Param('deviceId') deviceId: string) {
    this.logger.log(`[API] Delete device ${deviceId} for user: ${req.user.sub}`);
    return this.biometricService.deleteDevice(req.user.sub, deviceId);
  }
}

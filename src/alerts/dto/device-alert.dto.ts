import { ApiProperty } from '@nestjs/swagger';

export class DeviceAlertDto {
  @ApiProperty({ description: 'Alert ID' })
  id: string;

  @ApiProperty({ description: 'Package name' })
  packageName: string;

  @ApiProperty({ description: 'Event description' })
  event: string;

  @ApiProperty({ description: 'Severity level', enum: ['critical', 'high', 'medium', 'info'] })
  severity: string;

  @ApiProperty({ description: 'Event timestamp' })
  timestamp: number;

  @ApiProperty({ description: 'Alert creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Whether notification was sent' })
  notified: boolean;

  @ApiProperty({ description: 'Additional details', required: false })
  details?: Record<string, any>;
}

export class DeviceWithAlertsDto {
  @ApiProperty({ description: 'Device ID' })
  id: string;

  @ApiProperty({ description: 'Device identifier' })
  deviceIdentifier: string;

  @ApiProperty({ description: 'Platform (android/ios)' })
  platform: string;

  @ApiProperty({ description: 'OS version', required: false })
  osVersion?: string;

  @ApiProperty({ description: 'Device model', required: false })
  deviceModel?: string;

  @ApiProperty({ description: 'App version', required: false })
  appVersion?: string;

  @ApiProperty({ description: 'Last seen timestamp' })
  lastSeen?: Date;

  @ApiProperty({ description: 'Total number of alerts for this device' })
  alertCount: number;

  @ApiProperty({ description: 'Critical alerts count' })
  criticalAlerts: number;

  @ApiProperty({ description: 'High severity alerts count' })
  highAlerts: number;

  @ApiProperty({ description: 'List of alerts for this device', type: [DeviceAlertDto] })
  alerts: DeviceAlertDto[];
}

export class UserDevicesWithAlertsDto {
  @ApiProperty({ description: 'Total number of devices' })
  totalDevices: number;

  @ApiProperty({ description: 'Total number of alerts across all devices' })
  totalAlerts: number;

  @ApiProperty({ description: 'List of devices with their alerts', type: [DeviceWithAlertsDto] })
  devices: DeviceWithAlertsDto[];
}


import { Matches } from 'class-validator';

export class CheckPasswordDto {
    // Only the first 5 hex characters of the SHA-1 hash: the password itself never leaves the device.
    @Matches(/^[0-9a-fA-F]{5}$/, { message: 'prefix must be 5 hexadecimal characters' })
    prefix: string;
}

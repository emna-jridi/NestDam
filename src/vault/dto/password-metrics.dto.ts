import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class PasswordMetricsDto {
    @IsNumber()
    length: number;

    @IsNumber()
    score: number;

    @IsNumber()
    entropy: number;

    @IsArray()
    @IsString({ each: true })
    issues: string[];

    @IsString()
    estimatedCrackTime: string;
}

export class OllamaAdviceDto {
    @IsString()
    summary: string;

    @IsArray()
    @IsString({ each: true })
    recommendations: string[];

    @IsString()
    tone: string;
}

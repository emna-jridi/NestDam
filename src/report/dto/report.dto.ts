export class ReportDto {
  packageName: string;
  appName: string;
  riskLevel: 'High' | 'Medium' | 'Low';
  lastUpdate: string;
  dataPrivacy: string;
  recommendations: string[];
}
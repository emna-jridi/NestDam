export function getRiskColor(riskLevel: string): string {
  switch (riskLevel?.toUpperCase()) {
    case 'LOW':
      return '#2ECC71';
    case 'MEDIUM':
      return '#F39C12';
    case 'HIGH':
      return '#E67E22';
    case 'CRITICAL':
      return '#E74C3C';
    default:
      return '#95A5A6';
  }
}
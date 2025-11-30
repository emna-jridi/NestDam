export interface EtipTracker {
  id: string;
  name: string;
  description?: string;
  website?: string;

  code_signature?: string | null;
  network_signature?: string | null;

  is_in_exodus?: boolean;
  capability?: Record<string, any>;
  advertising?: Record<string, any>;
  analytic?: Record<string, any>;
  network?: Record<string, any>;
}

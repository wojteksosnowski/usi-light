export interface LicenseRecord {
  key: string;
  days: number;
  status: 'unactivated' | 'active' | 'expired';
  createdAt: number;
  activatedAt: number | null;
  expiresAt: number | null;
  customerEmail: string | null;
  stripeSessionId: string;
}

export interface LicenseState {
  licenseKey: string | null;
  isPro: boolean;
  status: 'unactivated' | 'active' | 'expired' | 'none';
  days: number | null;
  daysLeft: number | null;
  activatedAt: number | null;
  expiresAt: number | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  activateLicense: (key: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  checkLicense: (key?: string) => Promise<boolean>;
  clearLicense: () => void;
  initializeLicense: () => Promise<void>;
}

export interface PricingPlan {
  id: '7d' | '30d';
  title: string;
  durationLabel: string;
  badge?: string;
  priceFormatted: string;
  description: string;
  features: string[];
}

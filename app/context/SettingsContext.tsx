import React, { createContext, useContext, useState } from 'react';
import type { GlobalSettings } from '../types';

interface SettingsContextValue {
  settings: GlobalSettings;
  updateSettings: (s: Partial<GlobalSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<GlobalSettings>({
    maxLoanAmount: 500000,
    repaymentPeriod: 12,
    interestRate: 30,
  });

  const updateSettings = (s: Partial<GlobalSettings>) => {
    setSettings((prev) => ({ ...prev, ...s }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

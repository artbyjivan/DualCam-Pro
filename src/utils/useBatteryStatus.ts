import { useEffect, useState } from 'react';

interface BatteryManagerLike extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
}

export interface BatteryStatusInfo {
  supported: boolean;
  levelPct: number;
  charging: boolean;
  dischargingTimeSec: number;
  isLow: boolean; // <= 20% and not charging
  isCritical: boolean; // <= 10% and not charging
}

const UNSUPPORTED_BATTERY: BatteryStatusInfo = {
  supported: false,
  levelPct: 100,
  charging: false,
  dischargingTimeSec: Infinity,
  isLow: false,
  isCritical: false,
};

export function useBatteryStatus(): BatteryStatusInfo {
  const [status, setStatus] = useState<BatteryStatusInfo>(UNSUPPORTED_BATTERY);

  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManagerLike>;
    };
    if (typeof nav.getBattery !== 'function') {
      return;
    }

    let mounted = true;
    let batteryObj: BatteryManagerLike | null = null;

    const syncFromManager = (bm: BatteryManagerLike) => {
      if (!mounted) return;
      const levelPct = Math.round(Math.max(0, Math.min(1, bm.level)) * 100);
      const charging = Boolean(bm.charging);
      setStatus({
        supported: true,
        levelPct,
        charging,
        dischargingTimeSec: bm.dischargingTime,
        isLow: !charging && levelPct <= 20,
        isCritical: !charging && levelPct <= 10,
      });
    };

    const handleChange = () => {
      if (batteryObj) syncFromManager(batteryObj);
    };

    nav
      .getBattery()
      .then((bm) => {
        if (!mounted) return;
        batteryObj = bm;
        syncFromManager(bm);
        bm.addEventListener('levelchange', handleChange);
        bm.addEventListener('chargingchange', handleChange);
        bm.addEventListener('dischargingtimechange', handleChange);
      })
      .catch(() => {
        if (mounted) setStatus(UNSUPPORTED_BATTERY);
      });

    return () => {
      mounted = false;
      if (batteryObj) {
        batteryObj.removeEventListener('levelchange', handleChange);
        batteryObj.removeEventListener('chargingchange', handleChange);
        batteryObj.removeEventListener('dischargingtimechange', handleChange);
      }
    };
  }, []);

  return status;
}

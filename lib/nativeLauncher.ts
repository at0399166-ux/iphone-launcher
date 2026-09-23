import { Linking, NativeModules, Platform } from 'react-native';

export type InstalledApp = {
  id: string;
  label: string;
  packageName: string;
};

type LauncherKitModule = {
  getInstalledApps?: () => Promise<InstalledApp[]>;
  launchApp?: (packageName: string) => Promise<void>;
};

type SiriVoiceBridgeModule = {
  startListening?: () => Promise<string | void>;
};

const launcherKit = NativeModules.LauncherKit as LauncherKitModule | undefined;
const siriVoiceBridge = NativeModules.SiriVoiceBridge as SiriVoiceBridgeModule | undefined;

export const isNativeLauncherBridgeAvailable = Boolean(
  Platform.OS === 'android' && (launcherKit?.launchApp || launcherKit?.getInstalledApps),
);

export async function getInstalledApps(): Promise<InstalledApp[]> {
  if (launcherKit?.getInstalledApps) {
    return launcherKit.getInstalledApps();
  }
  return [];
}

export async function launchInstalledApp(packageName: string): Promise<boolean> {
  if (launcherKit?.launchApp) {
    await launcherKit.launchApp(packageName);
    return true;
  }
  if (Platform.OS === 'android') {
    const intentUrl = `intent://#Intent;package=${packageName};end`;
    const canOpen = await Linking.canOpenURL(intentUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(intentUrl);
      return true;
    }
  }
  return false;
}

export async function startVoiceListening(): Promise<string | undefined> {
  if (siriVoiceBridge?.startListening) {
    return (await siriVoiceBridge.startListening()) ?? undefined;
  }
  return undefined;
}
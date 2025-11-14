import { NativeModules, Platform } from 'react-native';

function isLocalhost(host?: string | null): boolean {
  return host === 'localhost' || host === '127.0.0.1';
}

function getDevServerHost(): string | null {
  const scriptURL: string | undefined = (NativeModules as any)?.SourceCode?.scriptURL;
  if (!scriptURL) return null;
  const match = scriptURL.match(/^[^:]+:\/\/([^/:]+)(?::\d+)?/);
  return match ? match[1] : null;
}

function resolveHost(): string {
  if (Platform.OS === 'web') {
    const w: any = globalThis as any;
    return w?.location?.hostname ?? 'localhost';
  }
  const host = getDevServerHost();
  if (Platform.OS === 'android') {
    if (!host || isLocalhost(host)) {
      return '10.0.2.2';
    }
    return host;
  }
  return host || 'localhost';
}

function buildApiUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_URL as string | undefined;
  if (override && override.trim().length > 0) {
    return override;
  }
  return 'https://neurolink-auth-backend.onrender.com';
}

export const API_URL: string = buildApiUrl();


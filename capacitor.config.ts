import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.caveflap.game',
  appName: 'Cave Flap',
  webDir: 'dist',
  backgroundColor: '#0b0a1c',
  ios: {
    contentInset: 'always',
  },
  android: {
    backgroundColor: '#0b0a1c',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0b0a1c',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0b0a1c',
    },
  },
};

export default config;

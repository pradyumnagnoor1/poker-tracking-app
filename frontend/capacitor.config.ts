import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.stacklab.app",
  appName: "StackLab",
  webDir: "out",
  server: {
    // Loads the live Vercel deployment — no static export needed.
    // Remove this `server` block when switching to a fully bundled static build.
    url: "https://poker-tracking-app.vercel.app",
    cleartext: false,
  },
  ios: {
    // Respect safe-area insets (notch / Dynamic Island / home indicator)
    contentInset: "always",
  },
};

export default config;

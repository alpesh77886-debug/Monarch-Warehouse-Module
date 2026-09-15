import { defineConfig, devices } from "@playwright/test";

/**
 * Loop 18 (Browser/E2E verification). Uses the pre-installed Chromium
 * at PLAYWRIGHT_BROWSERS_PATH via an explicit executablePath, since
 * this project pins its own @playwright/test version rather than
 * whatever revision that install expects - per this environment's own
 * guidance, not a workaround invented here.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
          // Every test in this suite only ever talks to baseURL
          // (127.0.0.1:3100) - no outbound network is ever needed, so
          // the browser should never route through this environment's
          // own egress proxy. Some sandboxes have Chromium pick up an
          // HTTPS_PROXY/https_proxy env var and try to CONNECT-tunnel
          // even loopback requests through it, which that proxy
          // correctly refuses (not a real destination) - surfacing as
          // ERR_TUNNEL_CONNECTION_FAILED on every single page.goto.
          args: ["--no-proxy-server"],
        },
      },
    },
  ],
});

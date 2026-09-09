import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    use: {
        baseURL: "http://127.0.0.1:5174",
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        screenshot: "only-on-failure",
        trace: "retain-on-failure"
    },
    projects: [
        { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
        { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }
    ],
    webServer: {
        command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
        url: "http://127.0.0.1:5174",
        reuseExistingServer: !process.env.CI
    }
});

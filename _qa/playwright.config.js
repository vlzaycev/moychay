// QA config for teaphuket.com
// Local run (default): serves the repo folder on :8811 and tests it.
// Production smoke: BASE_URL=https://teaphuket.com npx playwright test --project=chromium-desktop
const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8811';
const isLocal = BASE_URL.startsWith('http://localhost');

const desktop = (w, h) => ({ viewport: { width: w, height: h } });

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: isLocal ? 4 : 1, // be gentle with production
  reporter: [['list'], ['json', { outputFile: 'results/results.json' }]],
  use: { baseURL: BASE_URL, trace: 'off', screenshot: 'only-on-failure' },
  outputDir: 'results/artifacts',
  webServer: isLocal ? {
    command: 'python3 -m http.server 8811 -d ..',
    url: 'http://localhost:8811/',
    reuseExistingServer: true, stdout: 'ignore', stderr: 'ignore',
  } : undefined,
  projects: [
    { name: 'chromium-1920', use: { ...devices['Desktop Chrome'], ...desktop(1920, 1080) } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], ...desktop(1440, 900) } },
    { name: 'chromium-tablet', use: { ...devices['Desktop Chrome'], ...desktop(768, 1024), hasTouch: true } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'chromium-375', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'], ...desktop(1440, 900) } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], ...desktop(1440, 900) } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 15'] } },
  ],
});

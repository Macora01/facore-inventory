import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setViewport({ width: 480, height: 680 });

const htmlPath = path.join(__dirname, 'preview-login.html');
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

const outputPath = path.join(__dirname, 'login-preview.png');
await page.screenshot({ path: outputPath, fullPage: true });

console.log(`Screenshot saved: ${outputPath}`);
await browser.close();

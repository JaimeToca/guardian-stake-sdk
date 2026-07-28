// Drives the smoke-test page in real (system Chrome) headless, clicks "Run all",
// and prints each card's status + detail plus any console/page errors. This is the
// runtime proof the vite build alone can't give (WASM instantiation, Buffer global).
import { chromium } from "playwright-core";

const URL = process.env.SMOKE_URL ?? "http://localhost:5199/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();

const logs = [];
page.on("console", (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Run all" }).click();

// Wait until no card is still RUNNING (cap at 30s).
await page
  .waitForFunction(() => !document.body.innerText.includes("RUNNING"), null, { timeout: 30000 })
  .catch(() => {});

const cards = await page.evaluate(() =>
  [...document.querySelectorAll("div")]
    .filter((d) => d.querySelector("strong") && d.querySelector("span"))
    .map((d) => ({
      name: d.querySelector("strong")?.textContent,
      status: d.querySelector("span")?.textContent,
      detail: d.querySelector("pre")?.textContent ?? "",
    }))
);

console.log("=== CARD RESULTS ===");
for (const c of cards) {
  console.log(`\n[${c.status}] ${c.name}`);
  if (c.detail) console.log(c.detail.split("\n").slice(0, 6).join("\n"));
}
console.log("\n=== BROWSER CONSOLE / ERRORS ===");
console.log(logs.length ? logs.join("\n") : "(none)");

await browser.close();

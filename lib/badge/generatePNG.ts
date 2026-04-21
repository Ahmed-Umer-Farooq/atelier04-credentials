import puppeteer from "puppeteer";
import path from "path";
import fs from "fs/promises";

const BADGES_DIR = path.join(process.cwd(), "public", "badges");

export async function generatePNG(
  svg: string,
  credential_id: string
): Promise<{ svgPath: string; pngPath: string; svgUrl: string; pngUrl: string }> {
  await fs.mkdir(BADGES_DIR, { recursive: true });

  const svgFile = path.join(BADGES_DIR, `${credential_id}.svg`);
  const pngFile = path.join(BADGES_DIR, `${credential_id}.png`);

  await fs.writeFile(svgFile, svg, "utf-8");

  // Puppeteer renders the SVG exactly as a browser would (fonts, layout, everything)
  // The SVG has viewBox="140 105 370 490" which already crops to the badge area
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 420, height: 520, deviceScaleFactor: 6 });

    await page.goto(`file:///${svgFile.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" });

    const svgEl = await page.$("svg");
    await svgEl!.screenshot({ path: pngFile as `${string}.png`, omitBackground: false });
  } finally {
    await browser.close();
  }

  const base = process.env.BASE_URL!;
  return {
    svgPath: svgFile,
    pngPath: pngFile,
    svgUrl: `${base}/badges/${credential_id}.svg`,
    pngUrl: `${base}/badges/${credential_id}.png`,
  };
}

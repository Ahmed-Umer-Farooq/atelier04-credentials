import sharp from "sharp";
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
  await sharp(Buffer.from(svg)).png().toFile(pngFile);

  const base = process.env.BASE_URL!;
  return {
    svgPath: svgFile,
    pngPath: pngFile,
    svgUrl: `${base}/badges/${credential_id}.svg`,
    pngUrl: `${base}/badges/${credential_id}.png`,
  };
}

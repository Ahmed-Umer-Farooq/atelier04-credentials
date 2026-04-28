import QRCode from "qrcode-svg";
import fs from "fs/promises";
import path from "path";

interface BadgeData {
  credential_id: string;
  participant_name: string;
  course_title: string;
  completion_date: string;
  organization: string;
  verification_url: string;
  course_code?: string;
  duration_hours?: number;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function splitTitle(title: string): { line1: string; line2: string } {
  const emDashIdx = title.indexOf(" \u2014 ");
  if (emDashIdx !== -1) {
    return { line1: title.slice(0, emDashIdx), line2: title.slice(emDashIdx + 3) };
  }
  if (title.length <= 25) return { line1: title, line2: "" };
  const mid = Math.floor(title.length / 2);
  let splitAt = title.lastIndexOf(" ", mid);
  if (splitAt === -1) splitAt = title.indexOf(" ", mid);
  if (splitAt === -1) return { line1: title.slice(0, 25), line2: title.slice(25) };
  return { line1: title.slice(0, splitAt), line2: title.slice(splitAt + 1) };
}

function generateQRPath(url: string): string {
  const qr = new QRCode({
    content: url,
    join: true,
    width: 75,
    height: 75,
    color: "#ffffff",
    background: "transparent",
    padding: 1,
  });
  const match = qr.svg().match(/d="([^"]+)"/);
  return match ? match[1] : "";
}

function injectQR(svg: string, url: string): string {
  // Replace Frame 6 rect opacity 0.01 → 0.85 for solid dark background
  svg = svg.replace(
    `<g id="Frame 6" filter="url(#filter0_d_2_2)">\n<rect x="291" y="457" width="94.5191" height="94.5191" rx="10.66" fill="black" fill-opacity="0.01" shape-rendering="crispEdges"/>\n</g>`,
    `<g id="Frame 6" filter="url(#filter0_d_2_2)"><rect x="291" y="457" width="94.5191" height="94.5191" rx="10.66" fill="black" fill-opacity="0.85" shape-rendering="crispEdges"/></g>`
  );
  // Replace qr-placeholder group contents with real QR at translate(291,457)
  const qrPath = generateQRPath(url);
  const startMarker = '<g id="qr-placeholder">';
  const start = svg.indexOf(startMarker);
  if (start === -1 || !qrPath) return svg;
  let depth = 1;
  let i = start + startMarker.length;
  while (i < svg.length) {
    if (svg.startsWith("</g>", i)) {
      if (--depth === 0) {
        const newGroup = `<g id="qr-placeholder"><path transform="translate(300.949,467.66)" style="fill:#ffffff;shape-rendering:crispEdges;" d="${qrPath}"/></g>`;
        return svg.slice(0, start) + newGroup + svg.slice(i + 4);
      }
    } else if (svg.startsWith("<g", i) && (svg[i + 2] === " " || svg[i + 2] === ">")) {
      depth++;
    }
    i++;
  }
  return svg;
}

export async function generateSVG(data: BadgeData): Promise<string> {
  const templatePath = path.join(process.cwd(), "lib", "badge", "template.svg");
  let svg = await fs.readFile(templatePath, "utf-8");

  // 1. Student name — replace entire text element, centered
  svg = svg.replace(
    `<text id="{{STUDENT_NAME}}" fill="white" style="white-space: pre" xml:space="preserve" font-family="Inter" font-size="28.4268" letter-spacing="0em"><tspan x="203.811" y="342.459">{{STUDENT_NAME}}</tspan></text>`,
    `<text fill="white" font-family="Inter" font-size="28.4268" text-anchor="middle" x="338.987" y="342.459">${escapeXml(data.participant_name)}</text>`
  );

  // 2. Course title — replace entire text element, centered, split on em dash
  const { line1, line2 } = splitTitle(data.course_title);
  const titleTspan = line2
    ? `<tspan x="338.987" y="264.892">${escapeXml(line1)}</tspan><tspan x="338.987" dy="30">${escapeXml(line2)}</tspan>`
    : `<tspan x="338.987" y="264.892">${escapeXml(line1)}</tspan>`;
  svg = svg.replace(
    `<text id="{{COURSE_TITLE}}" fill="white" style="white-space: pre" xml:space="preserve" font-family="Inter" font-size="24.8734" font-weight="bold" letter-spacing="0em"><tspan x="226.818" y="274.892">{{COURSE_TITLE}}</tspan></text>`,
    `<text fill="white" font-family="Inter" font-size="24.8734" font-weight="bold" text-anchor="middle">${titleTspan}</text>`
  );

  // 3. Completion date — replace entire text element, font-weight 600
  svg = svg.replace(
    `<text id="{{COMPLETION_DATE}}" fill="#53C4C7" style="white-space: pre" xml:space="preserve" font-family="Inter" font-size="10" letter-spacing="0em"><tspan x="211" y="401.636">{{COMPLETION_DATE}}</tspan></text>`,
    `<text fill="#53C4C7" font-family="Inter" font-size="10" font-weight="600"><tspan x="211" y="401.636">${escapeXml(data.completion_date)}</tspan></text>`
  );

  // 4. Credential ID — replace entire text element, font-weight 600
  svg = svg.replace(
    `<text id="{{CREDENTIAL_ID}}" fill="#53C4C7" style="white-space: pre" xml:space="preserve" font-family="Inter" font-size="10" letter-spacing="0em"><tspan x="348.365" y="402.636">{{CREDENTIAL_ID}}</tspan></text>`,
    `<text fill="#53C4C7" font-family="Inter" font-size="10" font-weight="600"><tspan x="348.365" y="402.636">${escapeXml(data.credential_id)}</tspan></text>`
  );

  // 5. QR code injection
  svg = injectQR(svg, data.verification_url);

  // 6. Crop to single badge
  svg = svg.replace(
    `<svg width="1080" height="2904" viewBox="0 0 1080 2904" fill="none" xmlns="http://www.w3.org/2000/svg">`,
    `<svg width="420" height="520" viewBox="140 105 370 490" fill="none" xmlns="http://www.w3.org/2000/svg">`
  );

  return svg;
}

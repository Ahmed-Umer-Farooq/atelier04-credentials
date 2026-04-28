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

// Split on em dash — drop the dash. Fall back to word boundary.
function splitTitle(title: string): { title: string; subtitle: string } {
  for (const sep of [" \u2014 ", " - "]) {
    const idx = title.indexOf(sep);
    if (idx !== -1) return { title: title.slice(0, idx), subtitle: title.slice(idx + sep.length) };
  }
  if (title.length <= 20) return { title, subtitle: "" };
  const mid = Math.floor(title.length / 2);
  let splitAt = title.lastIndexOf(" ", mid);
  if (splitAt === -1) splitAt = title.indexOf(" ", mid);
  return splitAt !== -1
    ? { title: title.slice(0, splitAt), subtitle: title.slice(splitAt + 1) }
    : { title, subtitle: "" };
}

// Format ISO date to DD.MM.YYYY
function formatDate(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
}

// Compute centred x for left-anchored text. Figtree avg char width ≈ fontSize × 0.52
function centreX(text: string, fontSize: number, centre = 338.987): number {
  return Math.round((centre - (text.length * fontSize * 0.52) / 2) * 1000) / 1000;
}

// Scale font size so text fits within maxWidth px
function fitFontSize(text: string, defaultSize: number, maxWidth: number): number {
  const charW = defaultSize * 0.52;
  const textW = text.length * charW;
  if (textW <= maxWidth) return defaultSize;
  return Math.round((defaultSize * maxWidth / textW) * 100) / 100;
}

function generateQRPath(url: string): string {
  const qr = new QRCode({ content: url, join: true, width: 94, height: 94, color: "#ffffff", background: "transparent", padding: 5 });
  const match = qr.svg().match(/d="([^"]+)"/);
  return match ? match[1] : "";
}

function replaceQRGroupContents(svg: string, contents: string): string {
  const marker = '<g id="qr-placeholder">';
  const start = svg.indexOf(marker);
  if (start === -1) return svg;
  const contentStart = start + marker.length;
  let depth = 1, i = contentStart;
  while (i < svg.length) {
    if (svg.startsWith("</g>", i)) { if (--depth === 0) return svg.slice(0, contentStart) + contents + svg.slice(i); }
    else if (svg.startsWith("<g", i) && (svg[i + 2] === " " || svg[i + 2] === ">")) depth++;
    i++;
  }
  return svg;
}

export async function generateSVG(data: BadgeData): Promise<string> {
  // Template path: BADGE_TEMPLATE_PATH env var (optional) or default lib/badge/template.svg
  const templatePath = process.env.BADGE_TEMPLATE_PATH
    ? path.isAbsolute(process.env.BADGE_TEMPLATE_PATH)
      ? process.env.BADGE_TEMPLATE_PATH
      : path.join(process.cwd(), process.env.BADGE_TEMPLATE_PATH)
    : path.join(process.cwd(), "lib", "badge", "template.svg");

  let svg = await fs.readFile(templatePath, "utf-8");

  const fullName = data.participant_name.trim();
  const { title: courseTitle, subtitle: courseSubtitle } = splitTitle(data.course_title);
  const displayDate = formatDate(data.completion_date);
  const idText = `ID:${data.credential_id}`;

  // Max usable width inside the hexagon
  const NAME_MAX = 190;
  const NAME_BASE = 28.4268;

  // Decide: one line or two lines
  const fullNameWidth = fullName.length * NAME_BASE * 0.52;
  let line1: string, line2: string;

  const words = fullName.split(" ");

  if (fullNameWidth <= NAME_MAX || words.length <= 1) {
    // Fits on one line — centre vertically between the two slots (y=354)
    line1 = fullName;
    line2 = "";
  } else {
    // Split at the space closest to the middle, producing two balanced lines
    const mid = Math.ceil(words.length / 2);
    const candidate1 = words.slice(0, mid).join(" ");
    const candidate2 = words.slice(mid).join(" ");
    // Only split if line2 is non-empty and the full name actually needs splitting
    if (candidate2 && fullNameWidth > NAME_MAX) {
      line1 = candidate1;
      line2 = candidate2;
    } else {
      line1 = fullName;
      line2 = "";
    }
  }

  // Font size — same for both lines, fit the longer one
  const longerLine = line2.length > line1.length ? line2 : line1;
  const nameSize = fitFontSize(longerLine, NAME_BASE, NAME_MAX);

  if (line2 === "") {
    // Single line — place at vertical midpoint y=354, hide second line
    const x1 = centreX(line1, nameSize);
    svg = svg.replace(
      `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="28.4268" letter-spacing="0em"><tspan x="312.715" y="352.071">Max&#10;</tspan></text>`,
      `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="${nameSize}" letter-spacing="0em"><tspan x="${x1}" y="354">${escapeXml(line1)}</tspan></text>`
    );
    // Remove second name line entirely
    svg = svg.replace(
      `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="28.4268" letter-spacing="0em"><tspan x="239.122" y="381.071">MUSTERMANN</tspan></text>`,
      `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="0" letter-spacing="0em"><tspan x="0" y="0"></tspan></text>`
    );
  } else {
    // Two lines — same font size, no caps
    const x1 = centreX(line1, nameSize);
    const x2 = centreX(line2, nameSize);
    svg = svg.replace(
      `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="28.4268" letter-spacing="0em"><tspan x="312.715" y="352.071">Max&#10;</tspan></text>`,
      `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="${nameSize}" letter-spacing="0em"><tspan x="${x1}" y="340">${escapeXml(line1)}</tspan></text>`
    );
    svg = svg.replace(
      `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="28.4268" letter-spacing="0em"><tspan x="239.122" y="381.071">MUSTERMANN</tspan></text>`,
      `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="${nameSize}" letter-spacing="0em"><tspan x="${x2}" y="369">${escapeXml(line2)}</tspan></text>`
    );
  }

  // 3. Course title — centred, bold, as-is casing
  const titleSize = fitFontSize(courseTitle, 24.8734, 200);
  const titleX = centreX(courseTitle, titleSize);
  svg = svg.replace(
    `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="24.8734" font-weight="bold" letter-spacing="0em"><tspan x="210.216" y="274.553">CINEMA 4D / LUMION</tspan></text>`,
    `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="${titleSize}" font-weight="bold" letter-spacing="0em"><tspan x="${titleX}" y="274.553">${escapeXml(courseTitle)}</tspan></text>`
  );

  // 4. Course subtitle — centred always, EXCEPT when wider than hex (too long to centre nicely)
  const subtitleSize = fitFontSize(courseSubtitle, 15, 200);
  const subtitleX = centreX(courseSubtitle, subtitleSize);
  svg = svg.replace(
    `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="15" letter-spacing="0em"><tspan x="299.701" y="294.442">Grundlagen</tspan></text>`,
    `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="${subtitleSize}" letter-spacing="0em"><tspan x="${subtitleX}" y="294.442">${escapeXml(courseSubtitle)}</tspan></text>`
  );

  // 5. Date — centred pair with ID (wider budget — date+ID span the full hex)
  const dateSize = fitFontSize(displayDate + "  " + idText, 27, 220);
  const charW = dateSize * 0.52;
  const dateW = displayDate.length * charW;
  const idW = idText.length * charW;
  const gap = 14;
  const totalW = dateW + gap + idW;
  const pairStart = 338.987 - totalW / 2;
  const dateX = Math.round(pairStart * 1000) / 1000;
  const idX = Math.round((pairStart + dateW + gap) * 1000) / 1000;

  svg = svg.replace(
    `<text fill="#53C4C7" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="17.7667" letter-spacing="0em"><tspan x="245.148" y="405.725">03.27.2026</tspan></text>`,
    `<text fill="#53C4C7" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="${dateSize}" letter-spacing="0em"><tspan x="${dateX}" y="405.725">${escapeXml(displayDate)}</tspan></text>`
  );
  svg = svg.replace(
    `<text fill="#53C4C7" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="17.7667" letter-spacing="0em"><tspan x="342.342" y="405.725">ID:G52D5H</tspan></text>`,
    `<text fill="#53C4C7" style="white-space: pre" xml:space="preserve" font-family="Figtree" font-size="${dateSize}" letter-spacing="0em"><tspan x="${idX}" y="405.725">${escapeXml(idText)}</tspan></text>`
  );

  // 6. QR code
  const qrPath = generateQRPath(data.verification_url);
  // Darken the frame rect behind QR (0.01 → 0.85) so QR stands out
  svg = svg.replace(
    `fill="black" fill-opacity="0.01" shape-rendering="crispEdges"/>`,
    `fill="black" fill-opacity="0.85" shape-rendering="crispEdges"/>`
  );
  // Replace the static QR paths in Frame1 (they are loose paths, not in a named group)
  // First QR path starts at M320.913 467.66, last ends with the corner squares
  const qrFirstPath = `<path d="M320.913 467.66H318.695V469.857H320.913V467.66Z" fill="white"/>`;
  const qrLastPath  = `<path fill-rule="evenodd" clip-rule="evenodd" d="M300.949 524.772H316.476V540.148H300.949V524.772ZM303.168 526.969H314.258V537.952H303.168V526.969Z" fill="white"/>
<path d="M312.04 529.165H305.386V535.755H312.04V529.165Z" fill="white"/>`;
  const qrStart = svg.indexOf(qrFirstPath);
  const qrEnd   = svg.indexOf(qrLastPath);
  if (qrStart !== -1 && qrEnd !== -1 && qrPath) {
    const qrGroup = `<path transform="translate(291,457)" style="fill:#ffffff;shape-rendering:crispEdges;" d="${qrPath}"/>`;
    svg = svg.slice(0, qrStart) + qrGroup + svg.slice(qrEnd + qrLastPath.length);
  }

  svg = svg.replace(
    `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Bornia" font-size="12" letter-spacing="0em"><tspan x="270.521" y="428.54"><a href="http://www.atelier04.at/verification">atelier04.at/verification</a></tspan></text>`,
    `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Bornia" font-size="12" letter-spacing="0em"><tspan x="285" y="428.54"><a href="http://www.atelier04.at/verification">atelier04.at/verification</a></tspan></text>`
  );
  svg = svg.replace(
    `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Bornia" font-size="14.2134" letter-spacing="0em"><tspan x="235.472" y="234.692">EUROPEAN DIGITAL CREDENTIAL</tspan></text>`,
    `<text fill="white" style="white-space: pre" xml:space="preserve" font-family="Bornia" font-size="11.5" letter-spacing="0em"><tspan x="249.268" y="234.692">EUROPEAN DIGITAL CREDENTIAL</tspan></text>`
  );
  svg = svg.replace(
    `<svg width="1080" height="2904" viewBox="0 0 1080 2904" fill="none" xmlns="http://www.w3.org/2000/svg">`,
    `<svg width="420" height="520" viewBox="140 105 370 490" fill="none" xmlns="http://www.w3.org/2000/svg">`
  );

  return svg;
}

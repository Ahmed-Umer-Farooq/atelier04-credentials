import QRCode from "qrcode";

interface BadgeData {
  credential_id: string;
  participant_name: string;
  course_title: string;
  completion_date: string;
  organization: string;
  verification_url: string;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function generateSVG(data: BadgeData): Promise<string> {
  const year = data.completion_date.slice(0, 4);
  const name = escapeXml(data.participant_name);
  const title = escapeXml(data.course_title);
  const credId = escapeXml(data.credential_id);
  const date = escapeXml(data.completion_date);

  const qrDataUrl = await QRCode.toDataURL(data.verification_url, {
    width: 80,
    margin: 1,
    color: { dark: "#1a1a2e", light: "#e8c97e" },
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#1a1a2e" rx="16"/>
  <rect x="20" y="20" width="560" height="360" fill="none" stroke="#e8c97e" stroke-width="2" rx="12"/>
  <text x="300" y="70" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#e8c97e" text-anchor="middle">ATELIER04 ESKE GmbH</text>
  <line x1="60" y1="85" x2="540" y2="85" stroke="#e8c97e" stroke-width="1" opacity="0.4"/>
  <text x="300" y="120" font-family="Arial, sans-serif" font-size="13" fill="#ffffff" text-anchor="middle" opacity="0.7">DIGITAL CREDENTIAL</text>
  <text x="270" y="175" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">${title}</text>
  <text x="270" y="225" font-family="Arial, sans-serif" font-size="14" fill="#cccccc" text-anchor="middle">Awarded to</text>
  <text x="270" y="262" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#e8c97e" text-anchor="middle">${name}</text>
  <text x="270" y="305" font-family="Arial, sans-serif" font-size="12" fill="#aaaaaa" text-anchor="middle">${date} · ${year}</text>
  <text x="270" y="365" font-family="Arial, sans-serif" font-size="10" fill="#888888" text-anchor="middle">ID: ${credId}</text>
  <image x="480" y="285" width="90" height="90" href="${qrDataUrl}"/>
  <rect x="478" y="283" width="94" height="94" fill="none" stroke="#e8c97e" stroke-width="1" rx="4" opacity="0.5"/>
  <text x="525" y="390" font-family="Arial, sans-serif" font-size="8" fill="#888888" text-anchor="middle">Verify</text>
</svg>`;
}

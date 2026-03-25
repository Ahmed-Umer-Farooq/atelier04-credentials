interface BadgeData {
  credential_id: string;
  participant_name: string;
  course_title: string;
  completion_date: string;
  organization: string;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function generateSVG(data: BadgeData): string {
  const year = data.completion_date.slice(0, 4);
  const name = escapeXml(data.participant_name);
  const title = escapeXml(data.course_title);
  const credId = escapeXml(data.credential_id);
  const date = escapeXml(data.completion_date);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#1a1a2e" rx="16"/>
  <rect x="20" y="20" width="560" height="360" fill="none" stroke="#e8c97e" stroke-width="2" rx="12"/>
  <text x="300" y="70" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#e8c97e" text-anchor="middle">ATELIER04 ESKE GmbH</text>
  <line x1="60" y1="85" x2="540" y2="85" stroke="#e8c97e" stroke-width="1" opacity="0.4"/>
  <text x="300" y="120" font-family="Arial, sans-serif" font-size="13" fill="#ffffff" text-anchor="middle" opacity="0.7">DIGITAL CREDENTIAL</text>
  <text x="300" y="175" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">${title}</text>
  <text x="300" y="230" font-family="Arial, sans-serif" font-size="14" fill="#cccccc" text-anchor="middle">Awarded to</text>
  <text x="300" y="265" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#e8c97e" text-anchor="middle">${name}</text>
  <text x="300" y="310" font-family="Arial, sans-serif" font-size="12" fill="#aaaaaa" text-anchor="middle">${date} · ${year}</text>
  <text x="300" y="370" font-family="Arial, sans-serif" font-size="10" fill="#888888" text-anchor="middle">ID: ${credId}</text>
</svg>`;
}

interface CredentialData {
  credential_id: string;
  participant_name: string;
  participant_email: string;
  course_title: string;
  course_code: string;
  duration_hours: number;
  completion_date: string;
  result?: string | null;
  organization: string;
  country: string;
}

export function buildXML(data: CredentialData): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<europassCredential xmlns="http://data.europa.eu/snb/model/edci/edci-credential/1#"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://data.europa.eu/snb/model/edci/edci-credential/1#">
  <identifier>${data.credential_id}</identifier>
  <title>${data.course_title}</title>
  <issuer>
    <name>${data.organization}</name>
    <country>${data.country}</country>
  </issuer>
  <credentialSubject>
    <name>${data.participant_name}</name>
    <email>${data.participant_email}</email>
  </credentialSubject>
  <learningAchievement>
    <title>${data.course_title}</title>
    <courseCode>${data.course_code}</courseCode>
    <durationHours>${data.duration_hours}</durationHours>
    <completionDate>${data.completion_date}</completionDate>
    ${data.result ? `<result>${data.result}</result>` : ""}
  </learningAchievement>
</europassCredential>`;
}

import "dotenv/config";

async function main() {
  const email = "test@atelier04.at";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<europassCredential xmlns="http://data.europa.eu/snb/model/edci/edci-credential/1#">
  <identifier>A04-2026-TEST</identifier>
  <title>Test Credential</title>
  <issuer><name>Atelier04 ESKE GmbH</name><country>AT</country></issuer>
  <credentialSubject><name>Test User</name><email>test@atelier04.at</email></credentialSubject>
</europassCredential>`;

  const url = `${process.env.EUROPASS_WALLET_URL}/${encodeURIComponent(email)}/credentials`;
  console.log("POST", url);

  const formData = new FormData();
  formData.append("_credentialXML", new Blob([xml], { type: "application/xml" }), "credential.xml");

  const res = await fetch(url, { method: "POST", body: formData });
  console.log("Status:", res.status, res.statusText);
  const text = await res.text();
  console.log("Response:", text);
}

main();

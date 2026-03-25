interface WalletResult {
  uuid: string;
  viewerURL: string;
}

/**
 * Submits signed EDCI XML to Europass wallet API.
 * API is open — no registration required.
 * NOTE: XML must be signed with eSeal (.p12) — unsigned XML will be rejected by Europass.
 * Until client provides .p12, signXML() returns unsigned XML and this will fail at Europass.
 */
export async function submitToWallet(
  email: string,
  signedXML: string
): Promise<WalletResult> {
  const url = `${process.env.EUROPASS_WALLET_URL}/${encodeURIComponent(email)}/credentials`;

  const formData = new FormData();
  formData.append(
    "_credentialXML",
    new Blob([signedXML], { type: "application/xml" }),
    "credential.xml"
  );

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Europass API error ${res.status}: ${text}`);
  }

  const data = await res.json() as { uuid: string; viewerURL: string };
  return { uuid: data.uuid, viewerURL: data.viewerURL };
}

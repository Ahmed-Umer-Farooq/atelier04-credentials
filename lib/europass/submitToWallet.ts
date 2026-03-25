interface WalletResult {
  uuid: string;
  viewerURL: string;
}

/**
 * MOCK: Returns fake viewerURL until client provides Europass EDCI issuer registration.
 * Replace body with real multipart/form-data POST to Europass API when ready.
 */
export async function submitToWallet(
  _email: string,
  _signedXML: string
): Promise<WalletResult> {
  const uuid = `mock-uuid-${Date.now()}`;
  return {
    uuid,
    viewerURL: `https://europass.europa.eu/share/${uuid}`,
  };
}

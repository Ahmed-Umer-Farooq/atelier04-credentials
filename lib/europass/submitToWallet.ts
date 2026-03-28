interface WalletResult {
  uuid: string;
  viewerURL: string;
}

/**
 * MOCK: Returns fake uuid + viewerURL.
 * Real Europass API call is ready but blocked until:
 *   1. Client provides qualified eSeal (.p12 file) — signXML.ts
 *   2. Client confirms Europass wallet host URL from issuer onboarding
 * See lib/europass/signXML.ts and .env EUROPASS_WALLET_URL
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

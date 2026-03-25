/**
 * MOCK: Returns unsigned XML — Europass will reject this.
 * Replace with real node-forge signing when client provides .p12 eSeal file.
 * 
 * To implement:
 *   1. Set ESEAL_P12_PATH and ESEAL_P12_PASSWORD in .env
 *   2. Load .p12 with node-forge
 *   3. Sign the XML using XAdES/XMLDSig
 */
export function signXML(xml: string): string {
  return xml;
}

import * as forge from "node-forge";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

/**
 * Signs an EDCI XML document using the eSeal .p12 file (XMLDSig enveloped signature).
 * Falls back to unsigned XML if ESEAL_P12_PATH or ESEAL_P12_PASSWORD are not set.
 */
export function signXML(xml: string): string {
  const p12Path = process.env.ATRUST_P12_PATH;
  const p12Password = process.env.ATRUST_P12_PASSWORD;

  if (!p12Path || !p12Password) {
    console.warn("[signXML] ATRUST_P12_PATH or ATRUST_P12_PASSWORD not set — returning unsigned XML");
    return xml;
  }

  const resolvedPath = path.isAbsolute(p12Path)
    ? p12Path
    : path.join(process.cwd(), p12Path);

  const p12Der = fs.readFileSync(resolvedPath).toString("binary");
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, p12Password);

  // Extract private key
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag =
    keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];

  if (!keyBag?.key) throw new Error("[signXML] No private key found in .p12");

  // Extract certificate
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("[signXML] No certificate found in .p12");

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
  const certPem = forge.pki.certificateToPem(certBag.cert);
  const certDer = forge.util.encode64(
    forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert)).getBytes()
  );

  // Canonicalize XML (C14N — strip XML declaration, normalize)
  const xmlBody = xml.replace(/<\?xml[^?]*\?>\s*/i, "").trim();

  // Compute digest over the document body
  const bodyDigest = crypto
    .createHash("sha256")
    .update(Buffer.from(xmlBody, "utf8"))
    .digest("base64");

  const signedInfoXml =
    `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>` +
    `<ds:Reference URI="">` +
    `<ds:Transforms>` +
    `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `</ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${bodyDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `</ds:SignedInfo>`;

  // Sign the SignedInfo block
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signedInfoXml, "utf8");
  const signatureValue = sign.sign(privateKeyPem, "base64");

  const signatureBlock =
    `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfoXml +
    `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
    `<ds:KeyInfo>` +
    `<ds:X509Data><ds:X509Certificate>${certDer}</ds:X509Certificate></ds:X509Data>` +
    `</ds:KeyInfo>` +
    `</ds:Signature>`;

  // Inject signature before closing root element tag
  const rootCloseMatch = xmlBody.match(/<\/([a-zA-Z0-9:]+)\s*>$/);
  if (!rootCloseMatch) throw new Error("[signXML] Cannot find root closing tag");

  const rootClose = rootCloseMatch[0];
  const signed = xmlBody.slice(0, xmlBody.lastIndexOf(rootClose)) +
    signatureBlock +
    rootClose;

  return `<?xml version="1.0" encoding="UTF-8"?>\n${signed}`;
}

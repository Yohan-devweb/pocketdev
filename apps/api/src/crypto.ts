/** Utilitaires cryptographiques (WebCrypto, disponible dans Workers et Node). */

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Jeton aléatoire de 256 bits, sûr pour une URL. */
export function randomToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Chiffrement des secrets au repos. La clé (32 octets en base64) vient du secret SECRETS_KEY. */
export class SecretBox {
  private constructor(private readonly key: CryptoKey) {}

  static async fromBase64Key(base64Key: string): Promise<SecretBox> {
    const raw = base64Decode(base64Key);
    if (raw.length !== 32) throw new Error("SECRETS_KEY doit faire 32 octets encodés en base64");
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    return new SecretBox(key);
  }

  async seal(plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, encoder.encode(plaintext));
    return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(sealed))}`;
  }

  async open(sealed: string): Promise<string> {
    const [iv, data] = sealed.split(".");
    if (!iv || !data) throw new Error("Secret chiffré illisible");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64Decode(iv) }, this.key, base64Decode(data));
    return new TextDecoder().decode(plain);
  }
}

function derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  while (length > 0) {
    bytes.unshift(length & 0xff);
    length >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

/** GitHub fournit des clés PKCS#1 ; WebCrypto n'accepte que PKCS#8. On enveloppe la clé. */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const rsaAlgorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octetString = [0x04, ...derLength(pkcs1.length), ...pkcs1];
  const body = [0x02, 0x01, 0x00, ...rsaAlgorithm, ...octetString];
  return new Uint8Array([0x30, ...derLength(body.length), ...body]);
}

export async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
  const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const der = base64Decode(body);
  return crypto.subtle.importKey(
    "pkcs8",
    isPkcs1 ? pkcs1ToPkcs8(der) : der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** JWT RS256 signé avec la clé privée de la GitHub App (valable 9 minutes). */
export async function signAppJwt(appId: string, privateKeyPem: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const key = await importRsaPrivateKey(privateKeyPem);
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  // iat légèrement dans le passé pour tolérer un décalage d'horloge.
  const payload = base64UrlEncode(
    encoder.encode(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 9 * 60, iss: appId })),
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

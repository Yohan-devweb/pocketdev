import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { randomToken, SecretBox, sha256Hex, signAppJwt } from "./crypto";

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

describe("SecretBox", () => {
  it("chiffre puis déchiffre un secret, sans le laisser en clair", async () => {
    const box = await SecretBox.fromBase64Key(KEY);
    const sealed = await box.seal("ghu_secret");
    expect(sealed).not.toContain("ghu_secret");
    expect(await box.open(sealed)).toBe("ghu_secret");
  });

  it("refuse une clé de mauvaise taille", async () => {
    await expect(SecretBox.fromBase64Key(btoa("court"))).rejects.toThrow();
  });
});

describe("signAppJwt", () => {
  for (const type of ["pkcs1", "pkcs8"] as const) {
    it(`signe un JWT vérifiable avec une clé ${type}`, async () => {
      const { privateKey, publicKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        privateKeyEncoding: { type, format: "pem" },
        publicKeyEncoding: { type: "spki", format: "pem" },
      });
      const jwt = await signAppJwt("12345", privateKey, 1_000_000);
      const [header, payload, signature] = jwt.split(".");
      const verifier = createVerify("RSA-SHA256");
      verifier.update(`${header}.${payload}`);
      expect(verifier.verify(publicKey, Buffer.from(signature!, "base64url"))).toBe(true);
      expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toEqual({
        iat: 999_940,
        exp: 1_000_540,
        iss: "12345",
      });
    });
  }
});

describe("jetons", () => {
  it("génère des jetons distincts et une empreinte stable", async () => {
    expect(randomToken()).not.toBe(randomToken());
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

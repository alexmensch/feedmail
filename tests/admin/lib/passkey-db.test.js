import { describe, it, expect } from "vitest";
import {
  createPasskeyCredential,
  getPasskeyCredentials,
  getPasskeyCredentialById,
  getPasskeyCredentialCount,
  updatePasskeyCredentialCounter,
  updatePasskeyCredentialName,
  deletePasskeyCredential,
  createWebAuthnChallenge,
  getWebAuthnChallenge,
  deleteWebAuthnChallenge,
  cleanupExpiredChallenges
} from "../../../src/admin/lib/db.js";
import { mockDb } from "../../helpers/mock-db.js";

describe("passkey DB helpers", () => {
  // ─── Passkey Credentials ───────────────────────────────────────────────────

  describe("createPasskeyCredential", () => {
    it("inserts a credential into passkey_credentials table", async () => {
      const db = mockDb({});

      await createPasskeyCredential(db, {
        credentialId: "cred-id-base64url",
        publicKey: "public-key-base64url",
        counter: 0,
        transports: ["internal"],
        name: "MacBook Pro"
      });

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO passkey_credentials")
      );
      expect(db._chain.bind).toHaveBeenCalledWith(
        "cred-id-base64url",
        "public-key-base64url",
        0,
        '["internal"]',
        "MacBook Pro"
      );
      expect(db._chain.run).toHaveBeenCalled();
    });

    it("stores null transports when not provided", async () => {
      const db = mockDb({});

      await createPasskeyCredential(db, {
        credentialId: "abc123",
        publicKey: "pk-xyz",
        counter: 5,
        name: "iPhone"
      });

      const bindArgs = db._chain.bind.mock.calls[0];
      expect(bindArgs[0]).toBe("abc123");
      expect(bindArgs[1]).toBe("pk-xyz");
      expect(bindArgs[2]).toBe(5);
      expect(bindArgs[3]).toBeNull();
      expect(bindArgs[4]).toBe("iPhone");
    });
  });

  describe("getPasskeyCredentials", () => {
    it("returns all passkey credentials as an array", async () => {
      const rows = [
        {
          credential_id: "cred-1",
          public_key: "pk-1",
          counter: 0,
          name: "MacBook",
          created_at: "2025-01-01 12:00:00"
        },
        {
          credential_id: "cred-2",
          public_key: "pk-2",
          counter: 3,
          name: "iPhone",
          created_at: "2025-01-02 12:00:00"
        }
      ];
      const db = mockDb({ results: rows });

      const result = await getPasskeyCredentials(db);

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("passkey_credentials")
      );
      expect(db._chain.all).toHaveBeenCalled();
      expect(result).toEqual(rows);
    });

    it("returns empty array when no credentials exist", async () => {
      const db = mockDb({ results: [] });

      const result = await getPasskeyCredentials(db);

      expect(result).toEqual([]);
    });
  });

  describe("getPasskeyCredentialById", () => {
    it("queries passkey_credentials by credential_id", async () => {
      const credential = {
        credential_id: "cred-1",
        public_key: "pk-1",
        counter: 0,
        name: "MacBook",
        created_at: "2025-01-01 12:00:00"
      };
      const db = mockDb(credential);

      const result = await getPasskeyCredentialById(db, "cred-1");

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("passkey_credentials")
      );
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("credential_id = ?")
      );
      expect(db._chain.bind).toHaveBeenCalledWith("cred-1");
      expect(db._chain.first).toHaveBeenCalled();
      expect(result).toEqual(credential);
    });

    it("returns null when credential does not exist", async () => {
      const db = mockDb(null);

      const result = await getPasskeyCredentialById(db, "nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getPasskeyCredentialCount", () => {
    it("returns the count of passkey credentials as an integer", async () => {
      const db = mockDb({ count: 3 });

      const result = await getPasskeyCredentialCount(db);

      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("COUNT"));
      expect(db._chain.first).toHaveBeenCalled();
      expect(result).toBe(3);
    });

    it("returns zero when no credentials exist", async () => {
      const db = mockDb({ count: 0 });

      const result = await getPasskeyCredentialCount(db);

      expect(result).toBe(0);
    });
  });

  describe("updatePasskeyCredentialCounter", () => {
    it("updates counter for a specific credential", async () => {
      const db = mockDb({});

      await updatePasskeyCredentialCounter(db, "cred-1", 42);

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE")
      );
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("passkey_credentials")
      );
      expect(db._chain.bind).toHaveBeenCalledWith(42, "cred-1");
      expect(db._chain.run).toHaveBeenCalled();
    });
  });

  describe("updatePasskeyCredentialName", () => {
    it("updates the name for a specific credential", async () => {
      const db = mockDb({});

      await updatePasskeyCredentialName(db, "cred-1", "My New Name");

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE")
      );
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("name"));
      expect(db._chain.bind).toHaveBeenCalledWith("My New Name", "cred-1");
      expect(db._chain.run).toHaveBeenCalled();
    });
  });

  describe("deletePasskeyCredential", () => {
    it("deletes a credential by credential_id", async () => {
      const db = mockDb({});

      await deletePasskeyCredential(db, "cred-1");

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM passkey_credentials")
      );
      expect(db._chain.bind).toHaveBeenCalledWith("cred-1");
      expect(db._chain.run).toHaveBeenCalled();
    });

    it("does not fail when credential does not exist", async () => {
      const db = mockDb({});

      await expect(
        deletePasskeyCredential(db, "nonexistent")
      ).resolves.not.toThrow();
    });
  });

  // ─── WebAuthn Challenges ──────────────────────────────────────────────────

  describe("createWebAuthnChallenge", () => {
    it("inserts a challenge into webauthn_challenges table", async () => {
      const db = mockDb({});

      await createWebAuthnChallenge(db, {
        sessionToken: "session-123",
        challenge: "challenge-value",
        type: "registration",
        expiresAt: "2025-01-01T12:05:00.000Z"
      });

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO webauthn_challenges")
      );
      expect(db._chain.bind).toHaveBeenCalledWith(
        "session-123",
        "challenge-value",
        "registration",
        "2025-01-01T12:05:00.000Z"
      );
      expect(db._chain.run).toHaveBeenCalled();
    });
  });

  describe("getWebAuthnChallenge", () => {
    it("queries webauthn_challenges by session_token and type", async () => {
      const row = {
        session_token: "session-123",
        challenge: "challenge-value",
        type: "registration",
        expires_at: "2025-01-01 12:05:00",
        created_at: "2025-01-01 12:00:00"
      };
      const db = mockDb(row);

      const result = await getWebAuthnChallenge(
        db,
        "session-123",
        "registration"
      );

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("webauthn_challenges")
      );
      expect(db._chain.bind).toHaveBeenCalledWith(
        "session-123",
        "registration"
      );
      expect(db._chain.first).toHaveBeenCalled();
      expect(result).toEqual(row);
    });

    it("returns null when challenge does not exist", async () => {
      const db = mockDb(null);

      const result = await getWebAuthnChallenge(
        db,
        "nonexistent",
        "registration"
      );

      expect(result).toBeNull();
    });
  });

  describe("deleteWebAuthnChallenge", () => {
    it("deletes a challenge by session_token and type", async () => {
      const db = mockDb({});

      await deleteWebAuthnChallenge(db, "session-123", "registration");

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM webauthn_challenges")
      );
      expect(db._chain.bind).toHaveBeenCalledWith(
        "session-123",
        "registration"
      );
      expect(db._chain.run).toHaveBeenCalled();
    });
  });

  describe("cleanupExpiredChallenges", () => {
    it("deletes expired challenges from webauthn_challenges", async () => {
      const db = mockDb({});

      await cleanupExpiredChallenges(db);

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM webauthn_challenges")
      );
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("expires_at")
      );
      expect(db._chain.run).toHaveBeenCalled();
    });
  });
});

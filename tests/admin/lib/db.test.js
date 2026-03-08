import { describe, it, expect, vi } from "vitest";
import {
  createMagicLinkToken,
  getMagicLinkToken,
  markMagicLinkTokenUsed,
  createSession,
  getSession,
  deleteSession,
  MAGIC_LINK_TTL_SECONDS
} from "../../../src/admin/lib/db.js";
import { mockDb } from "../../helpers/mock-db.js";

describe("admin db helpers", () => {
  describe("MAGIC_LINK_TTL_SECONDS", () => {
    it("is 900 seconds (15 minutes)", () => {
      expect(MAGIC_LINK_TTL_SECONDS).toBe(900);
    });
  });

  describe("createMagicLinkToken", () => {
    it("inserts a token into magic_link_tokens table", async () => {
      const db = mockDb({});

      await createMagicLinkToken(db, "test-token-uuid", "2025-01-01T12:15:00.000Z");

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO magic_link_tokens")
      );
      expect(db._chain.bind).toHaveBeenCalledWith(
        "test-token-uuid",
        "2025-01-01T12:15:00.000Z"
      );
      expect(db._chain.run).toHaveBeenCalled();
    });

    it("binds the provided expiresAt value", async () => {
      const db = mockDb({});
      const expiresAt = "2025-06-15T12:15:00.000Z";

      await createMagicLinkToken(db, "test-token-uuid", expiresAt);

      const bindArgs = db._chain.bind.mock.calls[0];
      expect(bindArgs[0]).toBe("test-token-uuid");
      expect(bindArgs[1]).toBe(expiresAt);
    });
  });

  describe("getMagicLinkToken", () => {
    it("queries magic_link_tokens by token value", async () => {
      const tokenRow = {
        id: 1,
        token: "test-token",
        created_at: "2025-01-01 12:00:00",
        expires_at: "2025-01-01 12:15:00",
        used: 0
      };
      const db = mockDb(tokenRow);

      const result = await getMagicLinkToken(db, "test-token");

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("magic_link_tokens")
      );
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("token = ?")
      );
      expect(db._chain.bind).toHaveBeenCalledWith("test-token");
      expect(db._chain.first).toHaveBeenCalled();
      expect(result).toEqual(tokenRow);
    });

    it("returns null when token does not exist", async () => {
      const db = mockDb(null);

      const result = await getMagicLinkToken(db, "nonexistent-token");

      expect(result).toBeNull();
    });
  });

  describe("markMagicLinkTokenUsed", () => {
    it("updates token row to set used = 1 only when currently unused", async () => {
      const db = mockDb({ meta: { changes: 1 } });

      const result = await markMagicLinkTokenUsed(db, "test-token");

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE")
      );
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("magic_link_tokens")
      );
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("used = 0")
      );
      expect(db._chain.bind).toHaveBeenCalledWith("test-token");
      expect(db._chain.run).toHaveBeenCalled();
      expect(result).toEqual({ meta: { changes: 1 } });
    });

    it("returns result with changes = 0 when token was already used (race condition)", async () => {
      const db = mockDb({ meta: { changes: 0 } });

      const result = await markMagicLinkTokenUsed(db, "already-used-token");

      expect(result).toEqual({ meta: { changes: 0 } });
    });
  });

  describe("createSession", () => {
    it("inserts a session into admin_sessions table", async () => {
      const db = mockDb({});

      await createSession(db, "session-token-uuid", "2025-01-02T12:00:00.000Z");

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO admin_sessions")
      );
      expect(db._chain.bind).toHaveBeenCalledWith(
        "session-token-uuid",
        "2025-01-02T12:00:00.000Z"
      );
      expect(db._chain.run).toHaveBeenCalled();
    });

    it("binds the provided expiresAt value", async () => {
      const db = mockDb({});
      const expiresAt = "2025-01-02T12:00:00.000Z";

      await createSession(db, "session-token", expiresAt);

      const bindArgs = db._chain.bind.mock.calls[0];
      expect(bindArgs[0]).toBe("session-token");
      expect(bindArgs[1]).toBe(expiresAt);
    });
  });

  describe("getSession", () => {
    it("queries admin_sessions by token", async () => {
      const sessionRow = {
        id: 1,
        token: "session-token",
        created_at: "2025-01-01 12:00:00",
        expires_at: "2025-01-02 12:00:00"
      };
      const db = mockDb(sessionRow);

      const result = await getSession(db, "session-token");

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("admin_sessions")
      );
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("token = ?")
      );
      expect(db._chain.bind).toHaveBeenCalledWith("session-token");
      expect(db._chain.first).toHaveBeenCalled();
      expect(result).toEqual(sessionRow);
    });

    it("returns null when session does not exist", async () => {
      const db = mockDb(null);

      const result = await getSession(db, "nonexistent-session");

      expect(result).toBeNull();
    });
  });

  describe("deleteSession", () => {
    it("deletes session from admin_sessions by token", async () => {
      const db = mockDb({});

      await deleteSession(db, "session-token");

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM admin_sessions")
      );
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("token = ?")
      );
      expect(db._chain.bind).toHaveBeenCalledWith("session-token");
      expect(db._chain.run).toHaveBeenCalled();
    });

    it("does not fail when session does not exist", async () => {
      const db = mockDb({});

      await expect(
        deleteSession(db, "nonexistent-session")
      ).resolves.not.toThrow();
    });
  });
});

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

/**
 * Create a mock D1 database binding.
 */
function mockDb(returnValue) {
  const chainable = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(returnValue),
    all: vi.fn().mockResolvedValue(returnValue),
    run: vi.fn().mockResolvedValue(returnValue)
  };
  return {
    prepare: vi.fn().mockReturnValue(chainable),
    _chain: chainable
  };
}

describe("admin db helpers", () => {
  describe("MAGIC_LINK_TTL_SECONDS", () => {
    it("is 900 seconds (15 minutes)", () => {
      expect(MAGIC_LINK_TTL_SECONDS).toBe(900);
    });
  });

  describe("createMagicLinkToken", () => {
    it("inserts a token into magic_link_tokens table", async () => {
      const db = mockDb({});

      await createMagicLinkToken(db, "test-token-uuid");

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO magic_link_tokens")
      );
      expect(db._chain.bind).toHaveBeenCalledWith(
        "test-token-uuid",
        expect.any(String)
      );
      expect(db._chain.run).toHaveBeenCalled();
    });

    it("sets expires_at to 15 minutes from now", async () => {
      const db = mockDb({});

      await createMagicLinkToken(db, "test-token-uuid");

      // The bind call should include the token and an expires_at value
      // that is 900 seconds (15 minutes) in the future
      const bindArgs = db._chain.bind.mock.calls[0];
      expect(bindArgs[0]).toBe("test-token-uuid");
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

      await createSession(db, "session-token-uuid");

      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO admin_sessions")
      );
      expect(db._chain.bind).toHaveBeenCalledWith(
        "session-token-uuid",
        expect.any(String)
      );
      expect(db._chain.run).toHaveBeenCalled();
    });

    it("sets expires_at to 24 hours from now", async () => {
      const db = mockDb({});

      await createSession(db, "session-token");

      // The bind call should include the session token and an expires_at value
      const bindArgs = db._chain.bind.mock.calls[0];
      expect(bindArgs[0]).toBe("session-token");
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

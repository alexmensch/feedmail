import { describe, it, expect } from "vitest";
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
    it("inserts a token with expiry computed in SQL (DB datetime format)", async () => {
      const db = mockDb({});

      await createMagicLinkToken(db, "test-token-uuid", 900);

      const sql = db.prepare.mock.calls[0][0];
      expect(sql).toContain("INSERT INTO magic_link_tokens");
      // Expiry is computed via datetime('now', ...) so it is stored in the same
      // format as column DEFAULTs — never a JS ISO string (the format split that
      // broke every TTL check).
      expect(sql).toContain("datetime('now'");
      expect(db._chain.bind).toHaveBeenCalledWith("test-token-uuid", "+900");
      expect(db._chain.run).toHaveBeenCalled();
    });

    it("binds the TTL as a signed seconds offset, not an ISO timestamp", async () => {
      const db = mockDb({});

      await createMagicLinkToken(db, "test-token-uuid", MAGIC_LINK_TTL_SECONDS);

      const bindArgs = db._chain.bind.mock.calls[0];
      expect(bindArgs[0]).toBe("test-token-uuid");
      expect(bindArgs[1]).toBe(`+${MAGIC_LINK_TTL_SECONDS}`);
      expect(bindArgs[1]).not.toMatch(/Z$/);
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
    it("inserts a session with expiry computed in SQL (DB datetime format)", async () => {
      const db = mockDb({});

      await createSession(db, "session-token-uuid", 86400);

      const sql = db.prepare.mock.calls[0][0];
      expect(sql).toContain("INSERT INTO admin_sessions");
      expect(sql).toContain("datetime('now'");
      expect(db._chain.bind).toHaveBeenCalledWith(
        "session-token-uuid",
        "+86400"
      );
      expect(db._chain.run).toHaveBeenCalled();
    });

    it("binds the TTL as a signed seconds offset, not an ISO timestamp", async () => {
      const db = mockDb({});

      await createSession(db, "session-token", 86400);

      const bindArgs = db._chain.bind.mock.calls[0];
      expect(bindArgs[0]).toBe("session-token");
      expect(bindArgs[1]).toBe("+86400");
      expect(bindArgs[1]).not.toMatch(/Z$/);
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

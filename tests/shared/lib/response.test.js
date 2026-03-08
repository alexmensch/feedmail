import { describe, it, expect } from "vitest";
import {
  jsonResponse,
  htmlResponse
} from "../../../src/shared/lib/response.js";

describe("response helpers", () => {
  describe("jsonResponse", () => {
    it("returns JSON content type", () => {
      const response = jsonResponse(200, { ok: true });

      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("stringifies the body", async () => {
      const response = jsonResponse(200, { ok: true });
      const body = await response.json();

      expect(body).toEqual({ ok: true });
    });

    it("uses the provided status code", () => {
      const response = jsonResponse(404, { error: "Not found" });

      expect(response.status).toBe(404);
    });
  });

  describe("htmlResponse", () => {
    it("returns HTML content type", () => {
      const response = htmlResponse("<html>test</html>");

      expect(response.headers.get("Content-Type")).toBe(
        "text/html; charset=utf-8"
      );
    });

    it("defaults to status 200", () => {
      const response = htmlResponse("<html>test</html>");

      expect(response.status).toBe(200);
    });

    it("accepts a custom status code", () => {
      const response = htmlResponse("<html>error</html>", 500);

      expect(response.status).toBe(500);
    });

    it("returns the HTML body", async () => {
      const response = htmlResponse("<html>hello</html>");
      const body = await response.text();

      expect(body).toBe("<html>hello</html>");
    });
  });
});

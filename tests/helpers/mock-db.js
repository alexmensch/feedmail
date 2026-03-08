import { vi } from "vitest";

/**
 * Create a mock D1 database binding.
 * Returns a db object with prepare() that yields a chainable statement
 * (bind, first, all, run). All terminal methods resolve with `returnValue`.
 * Access the chainable via `db._chain` for assertion on bind() args.
 */
export function mockDb(returnValue) {
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

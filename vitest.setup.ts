import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest doesn't put `afterEach` on the global namespace unless
// `test.globals: true` is set, which is what @testing-library/react's
// auto-cleanup detection relies on — so it's wired explicitly here instead
// of turning on globals just for this one thing.
afterEach(() => {
  cleanup();
});

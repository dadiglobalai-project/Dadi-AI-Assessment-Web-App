import assert from "node:assert/strict";
import { isMobileOrTabletDevice } from "./device";

assert.equal(
  isMobileOrTabletDevice({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    platform: "iPhone",
    maxTouchPoints: 5
  }),
  true
);

assert.equal(
  isMobileOrTabletDevice({
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36",
    platform: "Linux armv8l",
    maxTouchPoints: 5
  }),
  true
);

assert.equal(
  isMobileOrTabletDevice({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
    platform: "MacIntel",
    maxTouchPoints: 5
  }),
  true
);

assert.equal(
  isMobileOrTabletDevice({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    platform: "Win32",
    maxTouchPoints: 0
  }),
  false
);

console.log("frontend device tests passed");

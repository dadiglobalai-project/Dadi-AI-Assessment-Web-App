import assert from "node:assert/strict";
import { isBlockedAssessmentDevice } from "./device";

assert.equal(
  isBlockedAssessmentDevice({
    "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
  }),
  true
);

assert.equal(
  isBlockedAssessmentDevice({
    "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
  }),
  true
);

assert.equal(
  isBlockedAssessmentDevice({
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "sec-ch-ua-mobile": "?1"
  }),
  true
);

assert.equal(
  isBlockedAssessmentDevice({
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "sec-ch-ua-mobile": "?0"
  }),
  false
);

console.log("backend device tests passed");

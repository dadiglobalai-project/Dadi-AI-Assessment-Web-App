import type { IncomingHttpHeaders } from "http";

const MOBILE_OR_TABLET_UA_PATTERN =
  /android|iphone|ipad|ipod|mobile|tablet|kindle|silk|playbook|webos|windows phone|iemobile|opera mini/i;

export const ASSESSMENT_DEVICE_BLOCK_MESSAGE =
  "Assessments require a desktop or laptop browser with screen sharing support. Please use Chrome, Edge, or Firefox on a computer.";

const getHeaderValue = (value: string | string[] | undefined) => {
  return Array.isArray(value) ? value.join(" ") : value ?? "";
};

export const isMobileOrTabletUserAgent = (userAgent: string) => {
  return MOBILE_OR_TABLET_UA_PATTERN.test(userAgent);
};

export const isBlockedAssessmentDevice = (headers: IncomingHttpHeaders) => {
  const userAgent = getHeaderValue(headers["user-agent"]);
  const secChUaMobile = getHeaderValue(headers["sec-ch-ua-mobile"]);

  if (secChUaMobile === "?1") {
    return true;
  }

  return isMobileOrTabletUserAgent(userAgent);
};

export const unsupportedAssessmentDeviceBody = () => ({
  success: false,
  code: "UNSUPPORTED_DEVICE",
  message: ASSESSMENT_DEVICE_BLOCK_MESSAGE
});

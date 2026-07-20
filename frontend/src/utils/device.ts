export type DeviceCheckInput = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
};

const MOBILE_OR_TABLET_UA_PATTERN =
  /android|iphone|ipad|ipod|mobile|tablet|kindle|silk|playbook|webos|windows phone|iemobile|opera mini/i;

export const isMobileOrTabletDevice = (input: DeviceCheckInput = {}) => {
  const userAgent = input.userAgent ?? navigator.userAgent;
  const platform = input.platform ?? navigator.platform;
  const maxTouchPoints = input.maxTouchPoints ?? navigator.maxTouchPoints ?? 0;

  if (MOBILE_OR_TABLET_UA_PATTERN.test(userAgent)) {
    return true;
  }

  // iPadOS can identify itself as a Mac while still exposing touch points.
  return /mac/i.test(platform) && maxTouchPoints > 1;
};

export const ASSESSMENT_DEVICE_BLOCK_MESSAGE =
  "Assessments require a desktop or laptop browser with screen sharing support. Please use Chrome, Edge, or Firefox on a computer.";

import { promises as dns } from "dns";

export const isNonEmptyString = (value: unknown) => {
  return typeof value === "string" && value.trim().length > 0;
};

export const isPositiveNumber = (value: unknown) => {
  return Number.isFinite(Number(value)) && Number(value) > 0;
};

export async function hasValidMailDomain(email: string): Promise<boolean> {
  const domain = email.split("@")[1];

  if (!domain) {
    return false;
  }

  try {
    const mxRecords = await dns.resolveMx(domain);
    return mxRecords.length > 0;
  } catch {
    return false;
  }
}

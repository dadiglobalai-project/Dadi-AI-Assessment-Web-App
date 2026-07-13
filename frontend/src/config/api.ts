type ViteImportMeta = ImportMeta & {
  env?: {
    VITE_API_BASE_URL?: string;
  };
};

const env = (import.meta as ViteImportMeta).env;

export const API_BASE_URL =
  env?.VITE_API_BASE_URL ||
  "https://dadi-ai-assessment-web-app.onrender.com";

export function apiUrl(endpoint: string): string {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL.replace(/\/$/, "")}${normalizedEndpoint}`;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers = new Headers(options.headers);

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(apiUrl(endpoint), {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    const errorBody = contentType.includes("application/json")
      ? JSON.stringify(await response.json())
      : await response.text();

    throw new Error(
      `API request failed: ${response.status} ${response.statusText}. ${errorBody}`
    );
  }

  if (!contentType.includes("application/json")) {
    const responseText = await response.text();

    throw new Error(
      `Expected JSON response but received ${contentType || "unknown content type"}: ${responseText}`
    );
  }

  return response.json() as Promise<T>;
}

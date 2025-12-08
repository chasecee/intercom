const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL;

if (!SIGNALING_URL) {
  throw new Error("NEXT_PUBLIC_SIGNALING_URL is required");
}

export const SIGNALING_URL_STRING: string = SIGNALING_URL;

export const sanitizeDeviceName = (name: string): string | null => {
  if (typeof name !== "string") return null;
  const sanitized = name
    .trim()
    .slice(0, 50)
    .replace(/[<>\"'&]/g, "");
  return sanitized || null;
};

export type Device = {
  deviceId: string;
  displayName: string;
};


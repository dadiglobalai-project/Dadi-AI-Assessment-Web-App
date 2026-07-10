export const timestampId = (prefix: string) => `${prefix}-${Date.now()}`;

export const randomAnswerId = () => `ans-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const randomRecordingFileName = (extension = ".webm") => {
  return `recording-${Date.now()}-${Math.random().toString(36).slice(2, 11)}${extension}`;
};

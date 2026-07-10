# Dadi AI Assessment Web App

Dadi AI Assessment is a web application for online applicant assessments with separate Admin and Applicant portals. Applicants complete timed assessments while screen recording is captured; admins manage assessments/questions and review submissions, answers, scores, and recordings.

## Project Structure

- `frontend/` contains the React/Vite client and the compatibility server entrypoint.
- `backend/` contains the Express backend source, Supabase config, upload middleware, services, route/controller extraction targets, and backend TypeScript config.

The existing API URLs are unchanged. For compatibility, `frontend/server.ts` imports `backend/src/server.ts`, so the current `frontend` workflow still starts the full app.

## Development

From `frontend/`:

```bash
npm run dev
```

Useful checks:

```bash
npm run lint
npm run backend:lint
```

## Storage

Screen recordings are uploaded to the private Supabase Storage bucket:

```text
recordings
```

The `recordings.file_url` database column stores the Storage path only, such as:

```text
aa-1783476406356/recording-1783561234567.webm
```

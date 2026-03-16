# worker.js

Small Cloudflare Worker that proxies chat messages to the Gemini API.

## What it does
- Accepts `POST` requests with JSON `{ "message": "..." }`.
- Sends the message to `gemini-pro:generateContent`.
- Returns the raw Gemini JSON response.
- Handles CORS (allows `POST` + `OPTIONS` from any origin).

## Required environment variable
- `GEMINI_API_KEY`

## Example request
```json
{ "message": "Hello from the pediatrician locator." }
```

## Responses
- `200` on success (Gemini JSON).
- `405` for non-POST methods.
- `500` if the worker fails to call Gemini.

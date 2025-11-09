# chart

## Development

This project requires Node.js version 20. It is recommended to use a version manager like [nvm](https://github.com/nvm-sh/nvm) to ensure you are using the correct Node.js version.

To use the correct node version, run the following command in the project root:

```bash
nvm use
```

If you don't have the required version installed, you can install it with `nvm install`.

### Run the API server

The lightweight API serves normalized vulnerability data and powers the UI.

```bash
npm run server
# Optional environment variables:
#   PORT=8787           # default 8787
#   API_BASE=/api/v1    # default /api/v1
#   DATA_FILE=public/uiDemoData.json  # default demo data
```

Endpoints:
- `GET/HEAD /health`
- `GET/HEAD ${API_BASE}/summary`
- `GET/HEAD ${API_BASE}/vulns`
- `GET ${API_BASE}/vulns/:id`

### Run the client (Vite dev)

In development, point the UI at the API using `VITE_API_URL`:

```bash
# In one terminal
npm run server

# In another terminal
VITE_API_URL=http://localhost:8787/api/v1/vulns npm run dev
```

The UI also works with a relative path when hosted behind the same origin as the API (no `VITE_API_URL` needed). In dev (different ports), prefer the explicit `VITE_API_URL`.

Note: The client now uses a remote, page-based API and no longer ingests raw JSON directly in the browser. The server reads `public/uiDemoData.json` by default; you can swap to another local file via `DATA_FILE`.

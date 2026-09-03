---
paths:
  - "src-tauri/src/auth/**"
---

# Authentication

## Overview

OAuth 2.0 with EVE Online SSO. Tokens stored in the local SQLite database.

## OAuth Flow

1. Frontend calls `start_eve_login` Tauri command
2. Backend generates OAuth URL with client ID, scopes, callback URL, CSRF state param
3. Browser opens with OAuth URL
4. User authorizes on EVE SSO
5. Callback received (HTTP server in dev, deep link in prod)
6. Auth code exchanged for access + refresh tokens
7. Tokens stored in `tokens` table; character info stored in `characters` table
8. `auth-success` event emitted with `character_id`

## Callback Handling

### Development
- HTTP server on `localhost:1421` (configurable via `EVE_CALLBACK_URL`)
- Auto-started in Tauri setup when callback URL starts with `http://`
- See `src-tauri/src/auth/callback_server.rs`

### Production
- Callback URL registered with EVE: `https://skillmon.app/callback` (configurable via `EVE_CALLBACK_URL`)
- That page redirects the browser to the `eveauth-skillmon://callback` deep link, preserving the query string, and tells the user the tab can be closed
- Scheme configured in `tauri.conf.json` under `plugins.deep-link.desktop.schemes`, handled by `tauri-plugin-deep-link`

Both branches resolve through `auth::callback_url()` — EVE SSO rejects a token exchange whose `redirect_uri` differs from the authorization request's.

## State Management

- **In-Memory**: `AuthStateMap` (`Mutex<HashMap<String, AuthState>>`) stores OAuth state during flow
- **Persistent**: Tokens stored in `tokens` table with expiration

## Token Storage (`tokens` table)

| Column | Description |
|--------|-------------|
| `character_id` | Primary key, references `characters` |
| `access_token` | Bearer token for ESI requests |
| `refresh_token` | Used to obtain new access tokens |
| `expires_at` | Unix timestamp when access token expires |

## Token Refresh

Tokens are automatically refreshed when expired:
- Check `expires_at` before ESI requests
- Use `refresh_token` to get new `access_token`
- Update `tokens` table with new tokens + expiration
- See `src-tauri/src/auth/oauth.rs`

## Tauri Events

| Event | Payload | Description |
|-------|---------|-------------|
| `auth-success` | `character_id: i64` | Authentication succeeded |
| `auth-error` | `String` | Authentication failed |

Frontend listens in `src/routes/__root.tsx` via `useAuthEvents`.

## ESI Scopes

Base scopes (always requested) are defined in `esi::BASE_SCOPES`. Optional feature scopes are appended in `commands/auth.rs` based on enabled features — see `features` rule.

## Security

- State param prevents CSRF
- Tokens stored in local DB only (not in memory long-term)
- App-specific deep link scheme (`eveauth-skillmon://`)

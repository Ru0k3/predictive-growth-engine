# Predictive Growth Engine integrations

The dashboard supports live aggregate provider connections and content evidence indexing. Configure these server-side environment variables before enabling the connection buttons:

```text
PROVIDER_TOKEN_ENCRYPTION_KEY=<long-random-secret>
YOUTUBE_CLIENT_ID=<Google OAuth client id>
YOUTUBE_CLIENT_SECRET=<Google OAuth client secret>
INSTAGRAM_CLIENT_ID=<Meta/Instagram app id>
INSTAGRAM_CLIENT_SECRET=<Meta/Instagram app secret>
INSTAGRAM_SCOPES=instagram_basic,instagram_manage_insights,pages_read_engagement
TIKTOK_CLIENT_KEY=<TikTok client key>
TIKTOK_CLIENT_SECRET=<TikTok client secret>
TIKTOK_SCOPES=user.info.basic,user.info.profile,user.info.stats,video.list
APP_ORIGIN=https://your-production-host.example
# Or use ALLOWED_APP_ORIGINS for comma-separated staging/production origins.
```

Register the exact callback URL shown by the deployed app as `/api/provider-oauth/callback` with each provider. The frontend passes its current origin into the OAuth start procedure, and the callback verifies a host-only state cookie before exchanging a code. Access and refresh tokens are encrypted with AES-256-GCM before they are stored. Disconnect revokes the remote token where the provider supports revocation and deletes the local connection.

YouTube uses the Data API channel statistics endpoint for the initial aggregate snapshot and requests YouTube Analytics read scope for future targeted reports. Instagram requires a professional account and uses account Insights metrics through the Graph API. TikTok uses the User Info API and the OAuth v2 refresh/revoke endpoints. Provider permissions and available metrics remain subject to each platform’s app review and account eligibility rules.

Dashboard reads use the newest persisted provider snapshots and never call provider APIs during page queries. Manual sync and scheduled heartbeat callbacks share the controlled worker in `server/sync.ts`, which refreshes tokens, retries 408/429/5xx responses with bounded backoff, honors `Retry-After`, persists errors, and prevents scheduled duplicate syncs inside the five-minute minimum interval.

Content uploads currently accept text, Markdown, and JSON exports. The original bytes are stored through the project storage layer; the server builds a normalized outline and event index, and the evidence procedure returns complete neighboring sections around a requested structural position. The upload and evidence procedures require a signed-in workspace.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type Provider = "youtube" | "instagram" | "tiktok";

type ProviderConfig = {
  authUrl: string;
  tokenUrl: string;
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
};

export type ProviderCredentials = { clientId: string; clientSecret: string; scopes?: string[] };

export type ProviderTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
  token_type?: string;
  open_id?: string;
};

export type AggregateSnapshot = {
  provider: Provider;
  externalAccountId: string;
  accountName: string;
  reach: number;
  impressions: number;
  followers: number;
  engagement: number;
  demographicVector: number[];
  observedAt: string;
  source: string;
};

export type TargetedVideoMetric = { id: string; title: string; publishedAt?: string; views: number; reach?: number; likes: number; comments: number; shares?: number; saves?: number; averageWatchSeconds?: number; averageRetentionPercent?: number; source: string };
export type TargetedMetrics = { provider: Provider; accountName: string; windowDays: number; videos: TargetedVideoMetric[]; retentionAvailable: boolean; retentionNote: string; refreshedAt: string };

const providerConfig: Record<Provider, () => ProviderConfig> = {
  youtube: () => ({
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    apiUrl: "https://www.googleapis.com/youtube/v3",
    clientId: process.env.YOUTUBE_CLIENT_ID ?? "",
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
    scopes: ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"],
  }),
  instagram: () => ({
    authUrl: process.env.INSTAGRAM_AUTH_URL ?? "https://www.facebook.com/v23.0/dialog/oauth",
    tokenUrl: process.env.INSTAGRAM_TOKEN_URL ?? "https://graph.facebook.com/v23.0/oauth/access_token",
    apiUrl: process.env.INSTAGRAM_API_URL ?? "https://graph.facebook.com/v23.0",
    clientId: process.env.INSTAGRAM_CLIENT_ID ?? "",
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET ?? "",
    scopes: (process.env.INSTAGRAM_SCOPES ?? "instagram_basic,instagram_manage_insights,pages_read_engagement").split(","),
  }),
  tiktok: () => ({
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    apiUrl: "https://open.tiktokapis.com/v2",
    clientId: process.env.TIKTOK_CLIENT_KEY ?? "",
    clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "",
    scopes: (process.env.TIKTOK_SCOPES ?? "user.info.basic,user.info.profile,user.info.stats,video.list").split(","),
  }),
};

export function getProviderConfig(provider: Provider) {
  return providerConfig[provider]();
}

export function assertProviderConfigured(provider: Provider, credentials?: ProviderCredentials) {
  const config = { ...getProviderConfig(provider), ...(credentials ?? {}) };
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`${provider} OAuth is not configured. Set the provider client ID and secret.`);
  }
  return config;
}

export function createProviderState() {
  return randomBytes(32).toString("base64url");
}

export function buildProviderAuthorizationUrl(provider: Provider, redirectUri: string, state: string, credentials?: ProviderCredentials) {
  const config = assertProviderConfigured(provider, credentials);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    scope: config.scopes.join(provider === "youtube" ? " " : ","),
  });
  if (provider === "youtube") params.set("access_type", "offline");
  if (provider === "youtube") params.set("prompt", "consent");
  if (provider === "tiktok") {
    params.set("client_key", config.clientId);
    params.set("scope", config.scopes.join(","));
    params.set("response_type", "code");
  }
  return `${config.authUrl}?${params.toString()}`;
}

export async function exchangeProviderCode(provider: Provider, code: string, redirectUri: string, credentials?: ProviderCredentials) {
  const config = assertProviderConfigured(provider, credentials);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (provider === "tiktok") {
    body.set("client_key", config.clientId);
    body.delete("client_id");
  }
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Provider token exchange failed (${response.status})`);
  return (await response.json()) as ProviderTokenResponse;
}

export async function refreshProviderToken(provider: Provider, refreshToken: string, credentials?: ProviderCredentials) {
  const config = assertProviderConfigured(provider, credentials);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (provider === "tiktok") {
    body.set("client_key", config.clientId);
    body.delete("client_id");
  }
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Provider token refresh failed (${response.status})`);
  return (await response.json()) as ProviderTokenResponse;
}

export async function revokeProviderToken(provider: Provider, accessToken: string, externalAccountId?: string, credentials?: ProviderCredentials) {
  const config = { ...getProviderConfig(provider), ...(credentials ?? {}) };
  if (provider === "youtube") {
    const url = new URL("https://oauth2.googleapis.com/revoke");
    url.searchParams.set("token", accessToken);
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    return;
  }
  if (provider === "tiktok") {
    const body = new URLSearchParams({ client_key: config.clientId, client_secret: config.clientSecret, token: accessToken });
    await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    return;
  }
  if (externalAccountId) {
    const url = new URL(`${config.apiUrl}/${externalAccountId}/permissions`);
    url.searchParams.set("access_token", accessToken);
    await fetch(url, { method: "DELETE" });
  }
}

export function encryptSecret(value: string) {
  const secret = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY ?? process.env.JWT_SECRET;
  if (!secret) throw new Error("Set PROVIDER_TOKEN_ENCRYPTION_KEY before storing provider tokens.");
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string) {
  const secret = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY ?? process.env.JWT_SECRET;
  if (!secret) throw new Error("Set PROVIDER_TOKEN_ENCRYPTION_KEY before reading provider tokens.");
  const [ivEncoded, tagEncoded, encryptedEncoded] = value.split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error("Invalid encrypted provider token.");
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, "base64url")), decipher.final()]).toString("utf8");
}

async function getJson(url: URL, accessToken: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Provider API request failed (${response.status})`);
  return response.json() as Promise<Record<string, any>>;
}

async function postJson(url: URL, accessToken: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Provider API request failed (${response.status})`);
  return response.json() as Promise<Record<string, any>>;
}

export async function fetchAggregateSnapshot(provider: Provider, accessToken: string): Promise<AggregateSnapshot> {
  const config = getProviderConfig(provider);
  if (provider === "youtube") {
    const channelUrl = new URL(`${config.apiUrl}/channels`);
    channelUrl.searchParams.set("part", "snippet,statistics");
    channelUrl.searchParams.set("mine", "true");
    const data = await getJson(channelUrl, accessToken);
    const channel = data.items?.[0];
    if (!channel) throw new Error("No YouTube channel is available for this account.");
    return {
      provider,
      externalAccountId: channel.id,
      accountName: channel.snippet?.title ?? "YouTube channel",
      reach: 0,
      impressions: Number(channel.statistics?.viewCount ?? 0),
      followers: Number(channel.statistics?.subscriberCount ?? 0),
      engagement: 0,
      demographicVector: [],
      observedAt: new Date().toISOString(),
      source: "YouTube Data API v3 + OAuth",
    };
  }
  if (provider === "instagram") {
    const profileUrl = new URL(`${config.apiUrl}/me`);
    profileUrl.searchParams.set("fields", "id,username,name,followers_count");
    const profile = await getJson(profileUrl, accessToken);
    const insightUrl = new URL(`${config.apiUrl}/${profile.id}/insights`);
    insightUrl.searchParams.set("metric", "impressions,reach,profile_views");
    insightUrl.searchParams.set("period", "day");
    const insights = await getJson(insightUrl, accessToken);
    const values = Object.fromEntries((insights.data ?? []).map((metric: any) => [metric.name, Number(metric.values?.at(-1)?.value ?? 0)]));
    return {
      provider,
      externalAccountId: profile.id,
      accountName: profile.username ?? profile.name ?? "Instagram professional account",
      reach: values.reach ?? 0,
      impressions: values.impressions ?? 0,
      followers: Number(profile.followers_count ?? 0),
      engagement: values.profile_views ?? 0,
      demographicVector: [],
      observedAt: new Date().toISOString(),
      source: "Instagram Graph API Insights + OAuth",
    };
  }
  const userUrl = new URL(`${config.apiUrl}/user/info/`);
  userUrl.searchParams.set("fields", "open_id,display_name,follower_count,likes_count,video_count");
  const data = await getJson(userUrl, accessToken);
  const user = data.data?.user ?? data.user ?? data.data ?? {};
  return {
    provider,
    externalAccountId: user.open_id ?? "tiktok-user",
    accountName: user.display_name ?? "TikTok creator",
    reach: 0,
    impressions: 0,
    followers: Number(user.follower_count ?? 0),
    engagement: 0,
    demographicVector: [],
    observedAt: new Date().toISOString(),
    source: "TikTok User Info API + OAuth",
  };
}


export async function fetchTargetedMetrics(provider: Provider, accessToken: string, externalAccountId: string, windowDays = 28): Promise<TargetedMetrics> {
  const config = getProviderConfig(provider);
  if (provider === "youtube") {
    const searchUrl = new URL(`${config.apiUrl}/search`); searchUrl.searchParams.set("part", "snippet"); searchUrl.searchParams.set("forMine", "true"); searchUrl.searchParams.set("type", "video"); searchUrl.searchParams.set("maxResults", "10");
    const search = await getJson(searchUrl, accessToken); const ids = (search.items ?? []).map((item: any) => item.id?.videoId).filter(Boolean);
    const videosUrl = new URL(`${config.apiUrl}/videos`); videosUrl.searchParams.set("part", "snippet,statistics"); videosUrl.searchParams.set("id", ids.join(","));
    const videos = ids.length ? await getJson(videosUrl, accessToken) : { items: [] };
    const reportUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports"); reportUrl.searchParams.set("ids", "channel==MINE"); reportUrl.searchParams.set("startDate", new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10)); reportUrl.searchParams.set("endDate", new Date().toISOString().slice(0, 10)); reportUrl.searchParams.set("metrics", "views,averageViewDuration,averageViewPercentage"); reportUrl.searchParams.set("dimensions", "video");
    const report = await getJson(reportUrl, accessToken).catch(() => ({ rows: [] })); const retention = new Map<string, any>((report.rows ?? []).map((row: any[]) => [String(row[0]), row]));
    return { provider, accountName: externalAccountId || "YouTube channel", windowDays, videos: (videos.items ?? []).map((item: any) => { const row = retention.get(item.id); return { id: item.id, title: item.snippet?.title ?? "Untitled video", publishedAt: item.snippet?.publishedAt, views: Number(item.statistics?.viewCount ?? 0), likes: Number(item.statistics?.likeCount ?? 0), comments: Number(item.statistics?.commentCount ?? 0), averageWatchSeconds: row ? Number(row[2] ?? 0) : undefined, averageRetentionPercent: row ? Number(row[3] ?? 0) : undefined, source: "YouTube Data API + Analytics API" }; }), retentionAvailable: retention.size > 0, retentionNote: retention.size ? "Average view duration and percentage are available for this channel." : "YouTube Analytics returned no retention rows for this window.", refreshedAt: new Date().toISOString() };
  }
  if (provider === "instagram") {
    const mediaUrl = new URL(`${config.apiUrl}/${externalAccountId}/media`); mediaUrl.searchParams.set("fields", "id,caption,timestamp,like_count,comments_count,media_type"); mediaUrl.searchParams.set("limit", "10");
    const media = await getJson(mediaUrl, accessToken); const rows = await Promise.all((media.data ?? []).map(async (item: any) => { const insightUrl = new URL(`${config.apiUrl}/${item.id}/insights`); insightUrl.searchParams.set("metric", "reach,impressions,engagement,saved,shares"); const insights = await getJson(insightUrl, accessToken).catch(() => ({ data: [] })); return { item, values: Object.fromEntries((insights.data ?? []).map((metric: any) => [metric.name, Number(metric.values?.[0]?.value ?? 0)])) }; }));
    return { provider, accountName: externalAccountId || "Instagram professional account", windowDays, videos: rows.map(({ item, values }) => ({ id: item.id, title: item.caption?.split("\n")[0] || `${item.media_type ?? "Media"} post`, publishedAt: item.timestamp, views: values.impressions ?? 0, reach: values.reach ?? 0, likes: Number(item.like_count ?? 0), comments: Number(item.comments_count ?? 0), shares: values.shares, saves: values.saved, source: "Instagram Graph API media + insights" })), retentionAvailable: false, retentionNote: "Instagram exposes media reach and engagement insights, but not viewer-retention curves through this API path.", refreshedAt: new Date().toISOString() };
  }
  const videoUrl = new URL(`${config.apiUrl}/video/list/`); videoUrl.searchParams.set("fields", "id,title,create_time,video_description,view_count,like_count,comment_count,share_count"); const data = await postJson(videoUrl, accessToken, { max_count: 10 }); const items = data.data?.videos ?? data.videos ?? [];
  return { provider, accountName: externalAccountId || "TikTok creator", windowDays, videos: items.map((item: any) => ({ id: item.id, title: item.title ?? item.video_description ?? "TikTok video", publishedAt: item.create_time ? new Date(Number(item.create_time) * 1000).toISOString() : undefined, views: Number(item.view_count ?? 0), likes: Number(item.like_count ?? 0), comments: Number(item.comment_count ?? 0), shares: Number(item.share_count ?? 0), source: "TikTok Video List API" })), retentionAvailable: false, retentionNote: "TikTok’s standard creator API exposes video engagement counts; viewer-retention curves require an approved analytics product scope.", refreshedAt: new Date().toISOString() };
}

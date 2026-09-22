import { afterEach, describe, expect, it, vi } from "vitest";
import { extractContentData } from "./content";
import { fetchTargetedMetrics } from "./providers";

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("extended content extraction", () => {
  it("extracts timestamped transcript segments", async () => {
    const result = await extractContentData("episode.vtt", "text/vtt", Buffer.from("WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nWelcome to the show."));
    expect(result.metadata.kind).toBe("transcript");
    expect(result.metadata.timestampedSegments).toHaveLength(1);
  });

  it("returns a safe metadata record when video tags are unavailable", async () => {
    const result = await extractContentData("clip.mp4", "video/mp4", Buffer.from("not-a-real-video"));
    expect(result.metadata.kind).toBe("video-metadata");
    expect(result.text).toContain("transcript");
  });
});

describe("targeted provider metrics", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("combines YouTube stats with retention rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: URL) => {
      if (input.toString().includes("/search")) return jsonResponse({ items: [{ id: { videoId: "v1" } }] });
      if (input.toString().includes("/videos")) return jsonResponse({ items: [{ id: "v1", snippet: { title: "Launch" }, statistics: { viewCount: "1000", likeCount: "80", commentCount: "12" } }] });
      return jsonResponse({ rows: [["v1", 1000, 42, 68.5]] });
    }));
    const result = await fetchTargetedMetrics("youtube", "token", "channel");
    expect(result.videos[0]).toMatchObject({ id: "v1", views: 1000, averageWatchSeconds: 42, averageRetentionPercent: 68.5 });
  });

  it("maps Instagram media insights", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: URL) => input.toString().includes("/insights") ? jsonResponse({ data: [{ name: "reach", values: [{ value: 500 }] }, { name: "impressions", values: [{ value: 800 }] }, { name: "saved", values: [{ value: 14 }] }] }) : jsonResponse({ data: [{ id: "m1", caption: "Carousel", like_count: 44, comments_count: 5, media_type: "VIDEO" }] })));
    const result = await fetchTargetedMetrics("instagram", "token", "account");
    expect(result.videos[0]).toMatchObject({ id: "m1", reach: 500, views: 800, saves: 14 });
  });

  it("maps TikTok video engagement", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: { videos: [{ id: "t1", title: "Hook", view_count: 900, like_count: 70, comment_count: 8, share_count: 4 }] } })));
    const result = await fetchTargetedMetrics("tiktok", "token", "creator");
    expect(result.videos[0]).toMatchObject({ id: "t1", views: 900, likes: 70, comments: 8, shares: 4 });
  });
});

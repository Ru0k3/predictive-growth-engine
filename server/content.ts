import { compressTimeSeries } from "./analytics";
import { PDFParse } from "pdf-parse";
import { parseBuffer } from "music-metadata";

export type StructuralSection = { index: number; heading: string; text: string; position: number; paragraphRange: [number, number] };

export function buildStructuralOutline(text: string): StructuralSection[] {
  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  return paragraphs.map((paragraph, index) => {
    const firstLine = paragraph.split("\n")[0]?.trim() ?? "Section";
    const heading = firstLine.length <= 90 && (/^#{1,6}\s/.test(firstLine) || firstLine.endsWith(":"))
      ? firstLine.replace(/^#{1,6}\s*/, "").replace(/:$/, "")
      : `Section ${index + 1}`;
    return { index, heading, text: paragraph, position: paragraphs.length <= 1 ? 0 : index / (paragraphs.length - 1), paragraphRange: [index, index] };
  });
}

export function buildEvidenceEvents(outline: StructuralSection[]) {
  const points = outline.map((section) => ({ t: section.position, value: Math.min(1, section.text.length / 1200) }));
  const events = compressTimeSeries(points, 0.04);
  return events.map((event) => {
    const nearest = outline.reduce((best, section) => Math.abs(section.position - event.position) < Math.abs(best.position - event.position) ? section : best, outline[0]!);
    return {
      eventType: event.type,
      position: String(event.position),
      magnitude: String(event.magnitude),
      label: `${event.label} · ${nearest.heading}`,
      evidenceText: nearest.text,
    };
  });
}

export function retrieveEvidence(outline: StructuralSection[], position: string, radius = 1) {
  if (outline.length === 0) return { sections: [], text: "" };
  const target = Number(position);
  const closestIndex = outline.reduce((best, section, index) => Math.abs(section.position - target) < Math.abs(outline[best]!.position - target) ? index : best, 0);
  const sections = outline.slice(Math.max(0, closestIndex - radius), Math.min(outline.length, closestIndex + radius + 1));
  return { sections, text: sections.map((section) => section.text).join("\n\n") };
}

export function decodeTextUpload(mimeType: string, base64: string) {
  const buffer = Buffer.from(base64, "base64");
  if (mimeType.startsWith("text/") || mimeType.includes("json") || mimeType.includes("markdown")) return buffer.toString("utf8");
  return `[${mimeType} uploaded successfully. Add a transcript or extracted text to enable evidence retrieval.]`;
}

export async function extractContentData(name: string, mimeType: string, buffer: Buffer) {
  const lowerName = name.toLowerCase();
  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return { text: result.text, metadata: { kind: "pdf", pages: result.total ?? null, sourceName: name } };
  }
  if (mimeType.startsWith("video/") || mimeType.startsWith("audio/") || /\.(mp4|mov|webm|m4a|mp3|wav)$/i.test(lowerName)) {
    try {
      const media = await parseBuffer(buffer, mimeType);
      return { text: media.common.title ?? `[${mimeType} media uploaded. Add a transcript to enable evidence retrieval.]`, metadata: { kind: "video-metadata", sourceName: name, durationSeconds: media.format.duration ?? null, bitrate: media.format.bitrate ?? null, codec: media.format.codec ?? null, title: media.common.title ?? null, artist: media.common.artist ?? null } };
    } catch {
      return { text: `[${mimeType} media uploaded. Add a transcript to enable evidence retrieval.]`, metadata: { kind: "video-metadata", sourceName: name, parseStatus: "metadata-unavailable" } };
    }
  }
  const text = buffer.toString("utf8").replace(/\r/g, "");
  const timestampedSegments = Array.from(text.matchAll(/(?:^|\n)\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)\s*[-–>]+\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)\s*\n?([^\n]+)/g)).map((match) => ({ start: match[1], end: match[2], text: match[3]?.trim() ?? "" }));
  return { text: text.replace(/^WEBVTT\s*/i, "").trim(), metadata: { kind: timestampedSegments.length ? "transcript" : "text", sourceName: name, timestampedSegments } };
}

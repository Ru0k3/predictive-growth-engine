import { compressTimeSeries } from "./analytics";

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

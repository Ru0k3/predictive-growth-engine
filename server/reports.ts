import type { Express, Request, Response } from "express";
import PDFDocument from "pdfkit";
import { sdk } from "./_core/sdk";
import * as db from "./db";

function rowsForReport(snapshots: any[]) {
  return snapshots.map((row) => ({ date: new Date(row.observedAt).toISOString(), platform: row.channel, reach: row.reach ?? 0, impressions: row.impressions ?? 0, followers: row.followers ?? 0, engagement: row.engagement ?? 0, source: row.source }));
}

export function buildCsv(rows: Array<{ date: string; platform: string; reach: number; impressions: number; followers: number; engagement: number; source: string }>) {
  const header = "date,platform,reach,impressions,followers,engagement,source";
  return [header, ...rows.map((row) => [row.date, row.platform, row.reach, row.impressions, row.followers, row.engagement, JSON.stringify(row.source)].join(","))].join("\n");
}

export function registerReportRoutes(app: Express) {
  app.get("/api/reports/:format", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.isCron) return res.status(403).json({ error: "user-only" });
      const days = Math.min(365, Math.max(7, Number(req.query.days ?? 90) || 90));
      const rows = rowsForReport(await db.listAudienceSnapshots(user.id, days));
      if (req.params.format === "csv") {
        const csv = buildCsv(rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename=signal-lab-${days}d.csv`);
        return res.send(csv);
      }
      if (req.params.format !== "pdf") return res.status(400).json({ error: "format must be csv or pdf" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=signal-lab-${days}d.pdf`);
      const doc = new PDFDocument({ margin: 44 });
      doc.pipe(res);
      doc.fontSize(20).fillColor("#17352a").text("Signal / Lab analytics report");
      doc.fontSize(10).fillColor("#66756e").text(`Historical social performance · last ${days} days · generated ${new Date().toLocaleString()}`);
      doc.moveDown();
      const byPlatform = rows.reduce<Record<string, { reach: number; impressions: number; followers: number; engagement: number }>>((acc, row) => { const item = acc[row.platform] ?? { reach: 0, impressions: 0, followers: 0, engagement: 0 }; item.reach += row.reach; item.impressions += row.impressions; item.followers = row.followers; item.engagement += row.engagement; acc[row.platform] = item; return acc; }, {});
      doc.fontSize(13).fillColor("#17352a").text("Platform summary");
      Object.entries(byPlatform).forEach(([platform, value]) => doc.fontSize(10).fillColor("#263a32").text(`${platform}: reach ${value.reach.toLocaleString()} · impressions ${value.impressions.toLocaleString()} · followers ${value.followers.toLocaleString()} · engagement ${value.engagement.toLocaleString()}`));
      doc.moveDown(); doc.fontSize(13).fillColor("#17352a").text("Snapshot history");
      rows.slice(-40).forEach((row) => doc.fontSize(8).fillColor("#52635a").text(`${row.date.slice(0, 16).replace("T", " ")}  ${row.platform.padEnd(10)}  reach ${row.reach.toLocaleString()}  impressions ${row.impressions.toLocaleString()}  followers ${row.followers.toLocaleString()}`));
      doc.end();
    } catch (error) { return res.status(401).json({ error: String(error) }); }
  });
}

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  FlaskConical,
  Gauge,
  LockKeyhole,
  Menu,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";

const retentionData = [
  { position: "0%", attention: 94 },
  { position: "14%", attention: 91 },
  { position: "28%", attention: 86 },
  { position: "42%", attention: 62 },
  { position: "56%", attention: 58 },
  { position: "70%", attention: 59 },
  { position: "84%", attention: 43 },
  { position: "100%", attention: 40 },
];

const navItems = [
  { label: "Overview", icon: Gauge, active: true },
  { label: "Audience overlap", icon: Users },
  { label: "Content signals", icon: Activity },
  { label: "Connect channels", icon: Radio },
];

function formatReach(value: number) {
  return value >= 1000
    ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2).replace(/\.0$/, "")}k`
    : value.toLocaleString();
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
  accent: string;
}) {
  return (
    <Card className="metric-card group relative overflow-hidden border-0 bg-[#111924] text-white shadow-[0_18px_45px_rgba(0,0,0,.14)]">
      <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${accent}`} />
      <CardContent className="relative p-5">
        <div className="mb-7 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8491a4]">
            {label}
          </span>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-[#a6f1c6]">
            <Icon size={16} />
          </div>
        </div>
        <div className="text-3xl font-semibold tracking-[-0.04em]">{value}</div>
        <p className="mt-2 text-xs text-[#8d9aac]">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const { data, isLoading, refetch } = trpc.analysis.dashboard.useQuery();
  const advisory = trpc.analysis.advisory.useMutation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const fallback = useMemo(
    () => ({
      result: {
        estimatedUniqueReach: 0,
        interval: { low: 0, high: 0, confidence: 0.95 },
        pairwise: [],
        assumptions: [],
        modelVersion: "growth-engine-v1",
      },
      events: [],
      channels: [],
      refreshedAt: "",
      freshness: "Loading analytical snapshot…",
    }),
    [],
  );
  const snapshot = data ?? fallback;
  const largestEvent = snapshot.events.find((event) => event.type === "drop") ?? snapshot.events[0];

  const requestAdvisory = () => {
    advisory.mutate({
      focus: largestEvent
        ? `${largestEvent.label} at ${Math.round(largestEvent.position * 100)}% of the asset`
        : "Audience overlap and retention",
      evidence: largestEvent
        ? "Compressed retention event from the latest content performance snapshot."
        : "Aggregate cross-channel reach snapshot.",
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f7f8] text-[#19232f]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-[#101923] px-5 py-6 text-white transition-transform duration-200 lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#a6f1c6] text-[#10201b]">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="font-semibold tracking-tight">signal / lab</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-[#7e8b9e]">
                growth intelligence
              </div>
            </div>
          </div>
          <button
            className="text-[#738195] lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-12 space-y-1">
          <div className="mb-4 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#667489]">
            Workspace
          </div>
          {navItems.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${active ? "bg-white/10 font-medium text-[#a6f1c6]" : "text-[#91a0b4] hover:bg-white/5 hover:text-white"}`}
            >
              <Icon size={16} />
              {label}
              {active && <ChevronRight size={14} className="ml-auto" />}
            </button>
          ))}
        </div>

        <div className="mt-auto space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-[#d9e3ec]">
              <ShieldCheck size={15} className="text-[#a6f1c6]" /> Privacy mode on
            </div>
            <p className="text-[11px] leading-relaxed text-[#78879b]">
              Aggregate signals only. No cookies, fingerprints, or individual identities.
            </p>
          </div>
          <div className="flex items-center gap-3 border-t border-white/10 px-2 pt-4">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[#293746] text-xs font-semibold text-[#a6f1c6]">
              {user?.name?.slice(0, 1) ?? "D"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{user?.name ?? "Demo workspace"}</div>
              <div className="truncate text-[10px] text-[#778599]">Creator account</div>
            </div>
            {isAuthenticated ? (
              <button onClick={() => logout()} className="text-[10px] text-[#778599] hover:text-white">
                Log out
              </button>
            ) : (
              <button onClick={() => startLogin()} className="text-[10px] text-[#a6f1c6] hover:text-white">
                Sign in
              </button>
            )}
          </div>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}
      <main className="lg:pl-[250px]">
        <header className="flex h-[76px] items-center justify-between border-b border-[#dde4e7] bg-[#f8fafb]/90 px-5 backdrop-blur-md sm:px-8 lg:px-11">
          <div className="flex items-center gap-3">
            <button
              className="text-[#657485] lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#84909e]">
                Workspace / Overview
              </div>
              <div className="mt-1 text-sm font-medium text-[#334151]">Monday, September 13, 2026</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="hidden border-[#cae8d6] bg-[#e9f8ef] text-[10px] font-semibold text-[#27744b] sm:flex">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-[#4dbb7a]" /> All systems nominal
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-9 gap-2 border-[#dce4e7] bg-white text-xs text-[#536171] hover:bg-[#eef5f1]"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> Refresh
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-11 lg:py-10">
          <div className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#4a9b71]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4dbb7a]" /> Signal health · 94%
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#172330] sm:text-[38px]">
                Your growth signal, <span className="text-[#6e7e8e]">decoded.</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#71808d]">
                A calm, aggregate view of what your audience is doing across every connected channel.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#8895a0]">
              <Database size={14} /> {snapshot.freshness}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Estimated unique reach"
              value={isLoading ? "—" : formatReach(snapshot.result.estimatedUniqueReach)}
              detail={`95% confidence · ${formatReach(snapshot.result.interval.low)}–${formatReach(snapshot.result.interval.high)}`}
              icon={Target}
              accent="bg-[#a6f1c6]/20"
            />
            <MetricCard
              label="Cross-channel signal"
              value="4 channels"
              detail="Native + owned audience sources"
              icon={Radio}
              accent="bg-[#93c5fd]/20"
            />
            <MetricCard
              label="Attention retained"
              value="58.4%"
              detail="+6.2% vs. previous snapshot"
              icon={Activity}
              accent="bg-[#f6c980]/20"
            />
            <MetricCard
              label="AI opportunities"
              value={String(Math.max(snapshot.events.length, 3))}
              detail="2 high-confidence signals"
              icon={Bot}
              accent="bg-[#f49c9c]/20"
            />
          </div>

          <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,.8fr)]">
            <Card className="border-0 bg-white shadow-[0_16px_50px_rgba(39,56,72,.07)]">
              <CardHeader className="flex-row items-start justify-between pb-2">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8895a0]">
                    <Activity size={13} className="text-[#4a9b71]" /> Content signals
                  </div>
                  <CardTitle className="text-lg tracking-[-0.02em] text-[#22303d]">Attention curve · latest asset</CardTitle>
                </div>
                <button className="text-xs font-medium text-[#4a9b71] hover:text-[#27744b]">
                  View details <ArrowUpRight size={13} className="ml-1 inline" />
                </button>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={retentionData} margin={{ top: 8, right: 8, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="signalFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#62c38d" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#62c38d" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#eef1f2" />
                      <XAxis dataKey="position" tickLine={false} axisLine={false} tick={{ fill: "#9aa6af", fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "#9aa6af", fontSize: 11 }} tickFormatter={(value) => `${value}%`} />
                      <Tooltip contentStyle={{ border: "0", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.1)", fontSize: 12 }} />
                      <Area type="monotone" dataKey="attention" stroke="#4a9b71" strokeWidth={3} fill="url(#signalFill)" dot={{ fill: "#fff", stroke: "#4a9b71", strokeWidth: 2, r: 3 }} activeDot={{ r: 5, fill: "#4a9b71" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {snapshot.events.slice(0, 4).map((event) => (
                    <div key={`${event.position}-${event.type}`} className={`rounded-lg border px-3 py-2 text-[11px] ${event.type === "drop" ? "border-[#f3d4d4] bg-[#fff7f7] text-[#aa5b5b]" : "border-[#d5eddf] bg-[#f5fcf7] text-[#397854]"}`}>
                      <span className="font-semibold">{event.type === "drop" ? "Drop" : event.type === "spike" ? "Spike" : "Plateau"}</span>
                      <span className="mx-1.5 text-[#bdc6ca]">·</span>
                      {Math.round(event.position * 100)}% position
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-[#e6f6ec] shadow-[0_16px_50px_rgba(39,56,72,.07)]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#438360]"><Sparkles size={14} /> AI next move</div>
                  <Badge className="border-0 bg-[#c9ebd5] text-[10px] text-[#377650]">Level 5 verified</Badge>
                </div>
                <CardTitle className="mt-3 text-xl leading-snug tracking-[-0.03em] text-[#1d3d2b]">{advisory.data?.title ?? "Your opening loses the room."}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-[#527364]">{advisory.data?.recommendation ?? "A sharp attention drop appears around the first transition. Tighten the promise and move the first payoff earlier."}</p>
                <div className="my-5 h-px bg-[#c8e5d2]" />
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#b5e4c6] text-[#2b724a]"><Check size={14} /></div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6a8d78]">Evidence found</div>
                    <p className="mt-1 text-xs leading-relaxed text-[#527364]">{advisory.data?.rationale ?? "Retention compression isolated one major drop and preserved the surrounding context for review."}</p>
                  </div>
                </div>
                <Button onClick={requestAdvisory} disabled={advisory.isPending} className="mt-6 w-full gap-2 bg-[#1b5a3a] text-xs text-white shadow-none hover:bg-[#14462d]">
                  {advisory.isPending ? "Validating evidence…" : "Regenerate advisory"}<ArrowUpRight size={14} />
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card className="border-0 bg-white shadow-[0_16px_50px_rgba(39,56,72,.07)]">
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8895a0]"><Users size={13} className="text-[#4a9b71]" /> Audience model</div>
                  <CardTitle className="text-lg tracking-[-0.02em] text-[#22303d]">One audience, four signals</CardTitle>
                </div>
                <button className="text-[#8a98a3] hover:text-[#4a9b71]" aria-label="About audience model"><CircleHelp size={17} /></button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {snapshot.channels.map((channel, index) => (
                    <div key={channel.name} className="flex items-center gap-3">
                      <div className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-semibold ${index % 2 === 0 ? "bg-[#e9f8ef] text-[#438360]" : "bg-[#eef3fb] text-[#55739a]"}`}>{channel.name.slice(0, 1)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between text-xs"><span className="font-medium text-[#344351]">{channel.name}</span><span className="text-[#82909b]">{formatReach(channel.reach)} reach</span></div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf1f2]"><div className="h-full rounded-full bg-[#77c899]" style={{ width: `${Math.max(14, (channel.reach / 18200) * 100)}%` }} /></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex items-start gap-3 rounded-xl bg-[#f7faf8] p-3.5"><LockKeyhole size={15} className="mt-0.5 shrink-0 text-[#4a9b71]" /><p className="text-[11px] leading-relaxed text-[#718078]">Reach is deduplicated statistically using demographic vectors. No person-level identity is collected or inferred.</p></div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-[#111924] text-white shadow-[0_16px_50px_rgba(39,56,72,.12)]">
              <CardHeader><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7c8b9d]"><FlaskConical size={13} className="text-[#a6f1c6]" /> Model notes</div><CardTitle className="text-lg tracking-[-0.02em]">A transparent signal stack</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    ["01", "Native inputs", "Aggregate reach + audience vectors"],
                    ["02", "Duplication model", "Cosine-calibrated pairwise overlap"],
                    ["03", "Monte Carlo", "1,000 seeded passes · 95% interval"],
                    ["04", "Evidence layer", "Compressed events → next move"],
                  ].map(([number, title, description]) => <div key={number} className="flex gap-3"><div className="text-[10px] font-semibold text-[#78ca9a]">{number}</div><div><div className="text-xs font-medium text-[#e2eaf0]">{title}</div><div className="mt-1 text-[11px] text-[#8190a2]">{description}</div></div></div>)}
                </div>
                <div className="mt-7 border-t border-white/10 pt-4 text-[10px] leading-relaxed text-[#77879a]">Model v{snapshot.result.modelVersion.replace("growth-engine-v", "")} · Results are directional estimates, not census counts.</div>
              </CardContent>
            </Card>
          </div>

          <footer className="mt-10 flex flex-col justify-between gap-3 border-t border-[#dde4e7] pt-5 text-[10px] text-[#8a97a1] sm:flex-row"><div className="flex items-center gap-2"><ShieldCheck size={13} className="text-[#4a9b71]" />Privacy-first by default · aggregate data only</div><div className="flex items-center gap-4"><span>Last updated {snapshot.refreshedAt ? new Date(snapshot.refreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span><a href="#" className="flex items-center gap-1 hover:text-[#4a9b71]">Methodology <ExternalLink size={11} /></a></div></footer>
        </div>
      </main>
    </div>
  );
}

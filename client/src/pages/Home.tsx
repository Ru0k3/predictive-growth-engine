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
  Link2,
  Menu,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  UploadCloud,
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
  const connections = trpc.connections.list.useQuery();
  const providerConfig = trpc.connections.config.useQuery();
  const startConnection = trpc.connections.start.useMutation();
  const disconnectConnection = trpc.connections.disconnect.useMutation({ onSuccess: () => connections.refetch() });
  const contentAssets = trpc.content.list.useQuery(undefined, { enabled: isAuthenticated });
  const uploadContent = trpc.content.upload.useMutation({ onSuccess: () => contentAssets.refetch() });
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const evidence = trpc.content.evidence.useQuery({ assetId: selectedAssetId ?? 0 }, { enabled: Boolean(selectedAssetId && isAuthenticated) });
  const [targetedProvider, setTargetedProvider] = useState<"youtube" | "instagram" | "tiktok">("youtube");
  const targeted = trpc.analysis.targeted.useQuery({ provider: targetedProvider, windowDays: 28 }, { enabled: Boolean(isAuthenticated && connections.data?.some((connection) => connection.provider === targetedProvider)) });
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

  const connectProvider = async (provider: "youtube" | "instagram" | "tiktok") => {
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    try {
      const result = await startConnection.mutateAsync({ provider, origin: window.location.origin });
      window.location.assign(result.url);
    } catch (error) {
      console.error("Unable to start provider connection", error);
    }
  };

  const uploadFile = async (file: File) => {
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const result = await uploadContent.mutateAsync({ name: file.name, mimeType: file.type || "text/plain", base64 });
    setSelectedAssetId(result.id);
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

          <Card className="mb-7 border-0 bg-[#101923] text-white shadow-[0_16px_50px_rgba(39,56,72,.12)]">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7c8b9d]"><Link2 size={13} className="text-[#a6f1c6]" /> Live channel connections</div>
                  <h2 className="text-lg font-semibold tracking-[-0.02em]">Bring the native signal in.</h2>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-[#8998aa]">Connect professional accounts to replace demo fixtures with aggregate reach, impressions, and audience metrics. Tokens are encrypted at rest.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    ["youtube", "YouTube", providerConfig.data?.youtube],
                    ["instagram", "Instagram", providerConfig.data?.instagram],
                    ["tiktok", "TikTok", providerConfig.data?.tiktok],
                  ] as const).map(([provider, label, configured]) => {
                    const connected = connections.data?.some((connection) => connection.provider === provider);
                    return <button key={provider} onClick={() => connectProvider(provider)} disabled={startConnection.isPending || (!configured && !connected)} className={`flex min-w-[118px] items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${connected ? "border-[#87d9a8]/40 bg-[#1d5a3b]" : configured ? "border-white/10 bg-white/[.05] hover:border-[#a6f1c6]/50 hover:bg-white/[.09]" : "cursor-not-allowed border-white/5 bg-white/[.03] opacity-70"}`}><span><span className="block text-xs font-medium">{label}</span><span className="mt-1 block text-[10px] text-[#90a2b3]">{connected ? "Connected" : configured ? "Connect" : "Needs app keys"}</span></span><span className={`h-2 w-2 rounded-full ${connected ? "bg-[#a6f1c6]" : configured ? "bg-[#f6c980]" : "bg-[#637385]"}`} /></button>;
                  })}
                </div>
              </div>
              {connections.data?.length ? <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">{connections.data.map((connection) => <button key={connection.id} onClick={() => disconnectConnection.mutate({ id: connection.id })} className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-[#9aabba] hover:border-[#f49c9c]/40 hover:text-[#ffd0d0]">Disconnect {connection.accountName}<span className="text-[#718397]">· revoke token</span></button>)}</div> : null}
            </CardContent>
          </Card>

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

          <Card className="mt-7 border-0 bg-white shadow-[0_16px_50px_rgba(39,56,72,.07)]">
            <CardHeader className="flex-row items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8895a0]"><Activity size={13} className="text-[#4a9b71]" /> Targeted video signals</div><CardTitle className="text-lg tracking-[-0.02em] text-[#22303d]">Retention and release-level detail</CardTitle><p className="mt-2 text-xs text-[#71808d]">Provider-native video metrics with explicit retention availability.</p></div><div className="flex gap-2">{(["youtube", "instagram", "tiktok"] as const).map((provider) => <button key={provider} onClick={() => setTargetedProvider(provider)} className={`rounded-lg px-3 py-2 text-[10px] font-semibold capitalize ${targetedProvider === provider ? "bg-[#dcefe3] text-[#27744b]" : "bg-[#f5f8f6] text-[#87968e]"}`}>{provider}</button>)}</div></CardHeader>
            <CardContent>{targeted.data ? <><div className="mb-4 flex items-center gap-2 rounded-xl bg-[#f7faf8] p-3 text-xs text-[#5d7567]"><Timer size={14} className="text-[#4a9b71]" />{targeted.data.retentionNote}<span className="ml-auto text-[10px] text-[#8a9a92]">{targeted.data.windowDays}d</span></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-b border-[#e8eeea] text-[10px] uppercase tracking-[0.14em] text-[#8a9991]"><th className="pb-3">Video</th><th className="pb-3">Views / reach</th><th className="pb-3">Engagement</th><th className="pb-3">Retention</th></tr></thead><tbody>{targeted.data.videos.slice(0, 6).map((video) => <tr key={video.id} className="border-b border-[#f0f3f1] last:border-0"><td className="max-w-[280px] truncate py-3 pr-4 text-xs font-medium text-[#344b3e]">{video.title}</td><td className="py-3 pr-4 text-xs text-[#60746a]">{formatReach(video.views)}{video.reach ? ` / ${formatReach(video.reach)}` : ""}</td><td className="py-3 pr-4 text-xs text-[#60746a]">{formatReach(video.likes + video.comments + (video.shares ?? 0))}</td><td className="py-3 text-xs font-medium text-[#438360]">{video.averageRetentionPercent ? `${video.averageRetentionPercent.toFixed(1)}%` : "Not exposed"}</td></tr>)}</tbody></table></div></> : <div className="rounded-xl border border-dashed border-[#cbded2] bg-[#f8fbf9] p-6 text-center text-xs text-[#8b9b92]">Connect the selected provider to load targeted metrics.</div>}</CardContent>
          </Card>

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

          <Card className="mt-7 border-0 bg-white shadow-[0_16px_50px_rgba(39,56,72,.07)]">
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8895a0]"><UploadCloud size={13} className="text-[#4a9b71]" /> Content evidence lab</div>
                <CardTitle className="text-lg tracking-[-0.02em] text-[#22303d]">Upload the source. Retrieve the proof.</CardTitle>
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[#71808d]">Drop a transcript, Markdown brief, PDF, or video/audio file. The engine extracts text or media metadata and preserves evidence for retrieval.</p>
              </div>
              <label className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition ${isAuthenticated ? "bg-[#1b5a3a] text-white hover:bg-[#14462d]" : "bg-[#edf3f0] text-[#4a9b71]"}`}>
                <UploadCloud size={15} /> {uploadContent.isPending ? "Indexing…" : "Upload content"}
                <input type="file" className="hidden" accept=".txt,.md,.markdown,.json,.srt,.vtt,.pdf,.mp4,.mov,.webm,.m4a,.mp3,.wav,text/plain,text/markdown,application/json,application/pdf,video/*,audio/*" disabled={uploadContent.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); event.currentTarget.value = ""; }} />
              </label>
            </CardHeader>
            <CardContent>
              {!isAuthenticated && <div className="mb-4 rounded-xl border border-[#dce9e1] bg-[#f7fbf8] p-3 text-xs text-[#5d7567]">Sign in to upload content and keep its evidence private to your workspace.</div>}
              <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
                <div className="rounded-2xl border border-dashed border-[#cbded2] bg-[#f8fbf9] p-4">
                  <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#789087]">Indexed assets</span><span className="rounded-full bg-[#e5f4e9] px-2 py-1 text-[10px] font-semibold text-[#438360]">{contentAssets.data?.length ?? 0}</span></div>
                  <div className="space-y-2">
                    {(contentAssets.data ?? []).map((asset) => <button key={asset.id} onClick={() => setSelectedAssetId(asset.id)} className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${selectedAssetId === asset.id ? "bg-[#dcefe3]" : "bg-white hover:bg-[#eef7f1]"}`}><span className="min-w-0"><span className="block truncate text-xs font-medium text-[#344b3e]">{asset.name}</span><span className="mt-1 block text-[10px] text-[#82968b]">{asset.mimeType}</span></span><ChevronRight size={14} className="shrink-0 text-[#91a99b]" /></button>)}
                    {(contentAssets.data ?? []).length === 0 && <div className="py-7 text-center text-xs leading-relaxed text-[#8b9b92]">No indexed content yet.<br />Upload a text source to begin.</div>}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#e1e7e4] bg-white p-4">
                  <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#789087]">Evidence retrieval</span>{evidence.data?.events?.length ? <Badge className="border-0 bg-[#fff2df] text-[10px] text-[#9a6b2e]">{evidence.data.events.length} events</Badge> : null}</div>
                  {evidence.data ? <><div className="mb-3 text-xs font-medium text-[#344b3e]">{evidence.data.asset.name}</div><div className="max-h-32 overflow-auto rounded-xl bg-[#f6f9f7] p-3 text-xs leading-relaxed text-[#60746a]">{evidence.data.evidence.text || "No nearby evidence found."}</div><div className="mt-3 flex flex-wrap gap-2">{evidence.data.events.slice(0, 4).map((event) => <span key={event.id} className="rounded-lg border border-[#e4ebe7] bg-white px-2.5 py-1.5 text-[10px] text-[#6b8275]">{event.label}</span>)}</div></> : <div className="flex min-h-[132px] items-center justify-center text-center text-xs leading-relaxed text-[#97a49d]">Select an indexed asset to retrieve<br />the nearest complete evidence window.</div>}
                </div>
              </div>
            </CardContent>
          </Card>

          <footer className="mt-10 flex flex-col justify-between gap-3 border-t border-[#dde4e7] pt-5 text-[10px] text-[#8a97a1] sm:flex-row"><div className="flex items-center gap-2"><ShieldCheck size={13} className="text-[#4a9b71]" />Privacy-first by default · aggregate data only</div><div className="flex items-center gap-4"><span>Last updated {snapshot.refreshedAt ? new Date(snapshot.refreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span><a href="#" className="flex items-center gap-1 hover:text-[#4a9b71]">Methodology <ExternalLink size={11} /></a></div></footer>
        </div>
      </main>
    </div>
  );
}

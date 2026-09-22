import { useMemo, useState } from "react";
import { ArrowLeft, Check, KeyRound, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const providers = [
  { id: "youtube" as const, label: "YouTube", scopes: "https://www.googleapis.com/auth/youtube.readonly,https://www.googleapis.com/auth/yt-analytics.readonly" },
  { id: "instagram" as const, label: "Instagram", scopes: "instagram_basic,instagram_manage_insights,pages_read_engagement" },
  { id: "tiktok" as const, label: "TikTok", scopes: "user.info.basic,user.info.profile,user.info.stats,video.list" },
];

export default function Settings() {
  const { isAuthenticated } = useAuth();
  const settings = trpc.providerSettings.list.useQuery(undefined, { enabled: isAuthenticated });
  const save = trpc.providerSettings.save.useMutation({ onSuccess: () => settings.refetch() });
  const remove = trpc.providerSettings.remove.useMutation({ onSuccess: () => settings.refetch() });
  const [provider, setProvider] = useState<"youtube" | "instagram" | "tiktok">("youtube");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState(providers[0].scopes);
  const [saved, setSaved] = useState(false);
  const callbackUrl = useMemo(() => `${window.location.origin}/api/provider-oauth/callback`, []);
  if (!isAuthenticated) return <div className="grid min-h-screen place-items-center bg-[#f5f7f8] p-6"><Card className="max-w-md border-0 shadow-xl"><CardContent className="p-8 text-center"><ShieldCheck className="mx-auto mb-4 text-[#4a9b71]" size={28} /><h1 className="text-xl font-semibold text-[#22303d]">Sign in to manage integrations</h1><p className="mt-2 text-sm text-[#71808d]">Credentials are encrypted server-side and never returned after saving.</p><Button onClick={() => startLogin()} className="mt-6 bg-[#1b5a3a]">Sign in</Button></CardContent></Card></div>;
  const configured = settings.data?.some((item) => item.provider === provider);
  const selectProvider = (next: typeof provider) => { setProvider(next); setScopes(providers.find((item) => item.id === next)?.scopes ?? ""); setSaved(false); };
  const saveSettings = async () => { await save.mutateAsync({ provider, clientId, clientSecret, redirectUri: callbackUrl, scopes }); setClientSecret(""); setSaved(true); };
  return <div className="min-h-screen bg-[#f5f7f8] text-[#19232f]"><main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-12"><Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-[#5e7569]"><ArrowLeft size={14} /> Back to overview</Link><div className="mt-8"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#4a9b71]"><KeyRound size={14} /> Integration settings</div><h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#172330]">Configure provider OAuth.</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#71808d]">Use workspace-owned developer credentials for live APIs. Client secrets are write-only and encrypted before persistence.</p></div><div className="mt-8 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"><Card className="border-0 bg-[#101923] text-white shadow-xl"><CardContent className="space-y-2 p-3">{providers.map((item) => <button key={item.id} onClick={() => selectProvider(item.id)} className={`w-full rounded-xl px-3 py-3 text-left text-sm ${provider === item.id ? "bg-white/10 text-[#a6f1c6]" : "text-[#91a0b4]"}`}>{item.label}<span className="mt-1 block text-[10px] text-[#77899b]">{settings.data?.some((setting) => setting.provider === item.id) ? "Configured" : "Not configured"}</span></button>)}</CardContent></Card><Card className="border-0 bg-white shadow-[0_16px_50px_rgba(39,56,72,.07)]"><CardHeader><CardTitle className="text-lg text-[#22303d]">{providers.find((item) => item.id === provider)?.label} OAuth</CardTitle></CardHeader><CardContent className="space-y-5"><div><Label htmlFor="client-id">Client ID / key</Label><Input id="client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder={configured ? "Saved · enter a new value to rotate" : "Paste client ID"} className="mt-2" /></div><div><Label htmlFor="client-secret">Client secret</Label><Input id="client-secret" type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={configured ? "Saved · enter a new value to rotate" : "Paste client secret"} className="mt-2" /></div><div><Label htmlFor="callback-url">Callback URL</Label><Input id="callback-url" readOnly value={callbackUrl} className="mt-2 bg-[#f7faf8] text-xs" /><p className="mt-2 text-[11px] text-[#81918a]">Add this exact URL to the provider developer console.</p></div><div><Label htmlFor="scopes">Scopes</Label><Input id="scopes" value={scopes} onChange={(event) => setScopes(event.target.value)} className="mt-2 text-xs" /></div><div className="flex flex-wrap items-center gap-3 border-t border-[#e6ece8] pt-5"><Button onClick={() => void saveSettings()} disabled={save.isPending || !clientId || !clientSecret} className="gap-2 bg-[#1b5a3a]"><Save size={14} /> {save.isPending ? "Encrypting…" : "Save credentials"}</Button>{configured && <Button variant="outline" onClick={() => remove.mutate({ provider })} className="gap-2 text-[#a55e5e]"><Trash2 size={14} /> Remove settings</Button>}{saved && <span className="flex items-center gap-1 text-xs text-[#438360]"><Check size={14} /> Saved securely</span>}</div></CardContent></Card></div></main></div>;
}

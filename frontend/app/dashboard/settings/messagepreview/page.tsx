'use client';

import { useState, useEffect } from 'react';
import Script from 'next/script';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import {
  Eye, ChevronLeft, Package, ShoppingCart,
  Zap, MessageSquare, TrendingUp, List,
} from 'lucide-react';
import Link from 'next/link';

// Extract only the <stripe-buy-button> custom element — strip the <script> tag
// (the script is loaded once via next/script at page level)
function extractStripeElement(code: string): string {
  return code
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .trim();
}

const getApi = () =>
  (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '') + '/api/v1';

const getBase = () =>
  (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '');

// ─── Telegram-style chat bubble ──────────────────────────────────────────────
function TgBubble({
  text, button, bannerSrc, bannerType,
}: {
  text: string;
  button?: string;
  bannerSrc?: string | null;
  bannerType?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 items-start" style={{ maxWidth: 280 }}>
      {/* Banner / image */}
      {bannerSrc ? (
        bannerType?.startsWith('video') ? (
          <video
            src={bannerSrc}
            muted
            className="w-full rounded-xl object-cover"
            style={{ maxHeight: 180 }}
          />
        ) : (
          <img
            src={bannerSrc}
            alt="banner"
            className="w-full rounded-xl object-cover"
            style={{ maxHeight: 180 }}
          />
        )
      ) : null}

      {/* Text bubble */}
      <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-muted text-sm leading-relaxed whitespace-pre-wrap break-words w-full">
        {text}
      </div>

      {/* Inline button */}
      {button && (
        <div className="px-4 py-2 rounded-xl bg-primary/15 border border-primary/30 text-xs font-semibold text-primary text-center w-full cursor-default">
          {button}
        </div>
      )}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({
  icon, label, color, children,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', color)}>
          {icon}
        </div>
        <span className="font-semibold text-sm">{label}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Build price-list menu (mirrors backend _build_package_menu_text) ─────────
function buildPriceList(packages: any[]): string {
  const lines: string[] = ['hier sind meine aktuellen angebote 🔥\n'];
  for (const pkg of packages) {
    const name     = pkg.name || '';
    const price    = pkg.price || '';
    const curr     = pkg.currency || '€';
    const desc     = pkg.description || pkg.tagline || '';
    const link     = pkg.payment_link || '';
    const files    = pkg.media_files || [];
    const imgs     = files.filter((f: any) => String(f.type || '').startsWith('image')).length;
    const vids     = files.filter((f: any) => String(f.type || '').startsWith('video')).length;
    const parts: string[] = [];
    if (vids) parts.push(`${vids} video${vids > 1 ? 's' : ''}`);
    if (imgs) parts.push(`${imgs} bild${imgs > 1 ? 'er' : ''}`);
    const fileSummary = parts.length ? ` (${parts.join(', ')})` : '';
    const priceStr = price ? `${price} ${curr}`.trim() : '';

    let block = `📦 *${name}*`;
    if (desc) block += `\n${desc}`;
    if (fileSummary) block += `\ninhalt:${fileSummary}`;
    if (priceStr) block += `\n💰 ${priceStr}`;
    if (link) block += `\n🔗 ${link}`;
    lines.push(block);
  }
  lines.push('\nwelches interessiert dich? 😊');
  return lines.join('\n\n');
}

// ─── Build the package text sent after selection (mirrors message_handler) ────
function buildPackageText(pkg: any, orderNum: string): string {
  const pkgText = (
    pkg.package_text?.trim() ||
    pkg.package_preview_description?.trim() ||
    pkg.description?.trim() ||
    ''
  );
  if (pkgText) return `🧾 ${orderNum}\n\n${pkgText}`;
  const name     = pkg.name || '';
  const price    = pkg.price ? `${pkg.price} ${pkg.currency || '€'}`.trim() : '';
  return `🧾 ${orderNum} — ${name}\n\n💰 ${price}\n\nKlick auf den Button um sicher zu bezahlen 🔐`;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MessagePreviewPage() {
  const { withCreator } = useCreator();
  const api  = getApi();
  const base = getBase();

  const [loading, setLoading]             = useState(true);
  const [packages, setPackages]           = useState<any[]>([]);
  const [mediaLib, setMediaLib]           = useState<any[]>([]);
  const [replySettings, setReplySettings] = useState<any>(null);
  const [systemSettings, setSystemSettings] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch(withCreator(`${api}/config/packages`)).then(r => r.json()).catch(() => ({ value: [] })),
      fetch(withCreator(`${api}/config/media_library`)).then(r => r.json()).catch(() => ({ value: [] })),
      fetch(withCreator(`${api}/config/reply_settings`)).then(r => r.json()).catch(() => ({ value: null })),
      fetch(withCreator(`${api}/config/system_settings`)).then(r => r.json()).catch(() => ({ value: null })),
    ]).then(([pkgs, lib, rs, ss]) => {
      if (Array.isArray(pkgs.value)) setPackages(pkgs.value.filter((p: any) => p.active !== false && p.name));
      if (Array.isArray(lib.value)) setMediaLib(lib.value);
      if (rs.value)  setReplySettings(rs.value);
      if (ss.value)  setSystemSettings(ss.value);
      setLoading(false);
    });
  }, [api, withCreator]);

  // Resolve banner image URL from media library
  const bannerFor = (pkg: any): { src: string | null; type: string } => {
    if (!pkg.banner_image_id) return { src: null, type: '' };
    const item = mediaLib.find((m: any) => m.id === pkg.banner_image_id);
    if (!item) return { src: null, type: '' };
    const src = item.fileUrl ? `${base}${item.fileUrl}` : item.dataUrl || null;
    return { src, type: item.type || '' };
  };

  const activePackages = packages;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings" className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-pink-500/10 flex items-center justify-center">
            <Eye className="h-4 w-4 text-pink-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Message Preview</h1>
            <p className="text-xs text-muted-foreground">Exactly what gets sent in Telegram — pixel-perfect preview</p>
          </div>
        </div>

        {/* Load Stripe buy button script once for the whole page */}
        {activePackages.some((p: any) => p.stripe_button_code) && (
          <Script src="https://js.stripe.com/v3/buy-button.js" strategy="lazyOnload" />
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : (
          <>

            {/* ── 1. Price List ────────────────────────────────────────────── */}
            {activePackages.length > 0 && (
              <Section
                icon={<List className="h-3.5 w-3.5" />}
                label="Price List"
                color="bg-cyan-500/10 text-cyan-400"
              >
                <div className="px-4 py-4 space-y-2">
                  <div className="text-xs text-muted-foreground font-medium">
                    Sent before a user selects a package — shows all active offers
                  </div>
                  <TgBubble text={buildPriceList(activePackages)} />
                </div>
              </Section>
            )}

            {/* ── 2. Package Messages ──────────────────────────────────────── */}
            {activePackages.length > 0 && (
              <Section
                icon={<Package className="h-3.5 w-3.5" />}
                label="Package Messages"
                color="bg-blue-500/10 text-blue-400"
              >
                <div className="divide-y divide-border">
                  {activePackages.map((pkg: any, i: number) => {
                    const { src, type } = bannerFor(pkg);
                    const price   = pkg.price ? `${pkg.price} ${pkg.currency || '€'}`.trim() : '';
                    const orderEx = `NIKA-${String(i + 1).padStart(6, '0')}`;
                    const text    = buildPackageText(pkg, orderEx);
                    const button  = pkg.payment_link
                      ? `💳 Jetzt kaufen${price ? ` — ${price}` : ''}`
                      : undefined;
                    return (
                      <div key={pkg.id || i} className="px-4 py-4 space-y-2">
                        <div className="text-xs text-muted-foreground font-medium">
                          {pkg.name}{price ? ` · ${price}` : ''}
                          {src && (
                            <span className="ml-2 text-green-400">✓ banner attached</span>
                          )}
                        </div>
                        <TgBubble
                          text={text}
                          button={button}
                          bannerSrc={src}
                          bannerType={type}
                        />
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ── 3. Purchase Previews ─────────────────────────────────────── */}
            {activePackages.some((p: any) => p.payment_link || p.stripe_button_code) && (
              <Section
                icon={<ShoppingCart className="h-3.5 w-3.5" />}
                label="Purchase Previews"
                color="bg-green-500/10 text-green-400"
              >
                <div className="divide-y divide-border">
                  {activePackages
                    .filter((p: any) => p.payment_link || p.stripe_button_code)
                    .map((pkg: any, i: number) => {
                      const price   = pkg.price ? `${pkg.price} ${pkg.currency || '€'}`.trim() : '';
                      const orderEx = `NIKA-${String(i + 1).padStart(6, '0')}`;
                      const pkgText = (
                        pkg.package_text?.trim() ||
                        pkg.package_preview_description?.trim() ||
                        pkg.description?.trim() ||
                        ''
                      );
                      const text = pkgText
                        ? `🧾 ${orderEx}\n\n${pkgText}`
                        : `🧾 ${orderEx} — ${pkg.name}\n\n💰 ${price}\n\nKlick auf den Button um sicher zu bezahlen 🔐`;

                      const stripeEl = pkg.stripe_button_code
                        ? extractStripeElement(pkg.stripe_button_code)
                        : null;

                      return (
                        <div key={pkg.id || i} className="px-4 py-4 space-y-3">
                          <div className="text-xs text-muted-foreground font-medium">
                            {pkg.name}{price ? ` · ${price}` : ''} — payment message
                          </div>

                          {/* Telegram message bubble */}
                          <TgBubble text={text} />

                          {/* Stripe buy button — rendered live */}
                          {stripeEl ? (
                            <div className="space-y-1.5">
                              <div className="text-[10px] text-green-400 font-semibold uppercase tracking-wide">
                                💳 Stripe Buy Button (live)
                              </div>
                              <div
                                className="rounded-xl overflow-hidden bg-card p-3 border border-border"
                                dangerouslySetInnerHTML={{ __html: stripeEl }}
                              />
                            </div>
                          ) : pkg.payment_link ? (
                            <div className="space-y-1.5">
                              <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                                💳 Inline Button (Telethon)
                              </div>
                              <div className="px-4 py-2.5 rounded-xl bg-primary/15 border border-primary/30 text-xs font-semibold text-primary text-center">
                                💳 Jetzt kaufen{price ? ` — ${price}` : ''}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono break-all">
                                🔗 {pkg.payment_link}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
              </Section>
            )}

            {/* ── 4. Upsell Follow-up ──────────────────────────────────────── */}
            {replySettings?.upsell_enabled && replySettings?.upsell_message && (
              <Section
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Upsell Follow-up"
                color="bg-amber-500/10 text-amber-400"
              >
                <div className="px-4 py-4 space-y-2">
                  <div className="text-xs text-muted-foreground font-medium">
                    Sent automatically {replySettings.upsell_delay_hours}h after buy link
                  </div>
                  <TgBubble text={replySettings.upsell_message} />
                </div>
              </Section>
            )}

            {/* ── 5. Cash Alarm ────────────────────────────────────────────── */}
            {systemSettings?.use_cash_workflow && (
              <Section
                icon={<Zap className="h-3.5 w-3.5" />}
                label="Cash Alarm Notification"
                color="bg-orange-500/10 text-orange-400"
              >
                <div className="px-4 py-4 space-y-2">
                  <div className="text-xs text-muted-foreground font-medium">
                    Internal notification — triggered after buy link is sent
                  </div>
                  <TgBubble text="🚨 Cash Alarm — buy link sent to a lead! Check the dashboard." />
                </div>
              </Section>
            )}

            {/* ── 6. Custom Instructions ───────────────────────────────────── */}
            {replySettings?.custom_instructions?.trim() && (
              <Section
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label="Custom Instructions (injected into every prompt)"
                color="bg-purple-500/10 text-purple-400"
              >
                <div className="px-4 py-4 space-y-2">
                  <div className="text-xs text-muted-foreground font-medium">
                    Not a sent message — added to Claude's system prompt
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-muted border border-border text-xs leading-relaxed whitespace-pre-wrap font-mono">
                    {replySettings.custom_instructions.trim()}
                  </div>
                </div>
              </Section>
            )}

            {/* Empty state */}
            {activePackages.length === 0 && !replySettings?.upsell_enabled && (
              <div className="rounded-xl border border-dashed border-border bg-card/50 py-12 text-center text-sm text-muted-foreground">
                No messages configured yet.
                <span className="text-xs mt-1 block">Set up packages to see previews here.</span>
              </div>
            )}

            {/* ── Timing summary ───────────────────────────────────────────── */}
            {replySettings && (
              <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-1.5">
                <div className="font-semibold text-foreground text-sm mb-2">Timing & Constraints</div>
                <div>
                  <span className="text-foreground">Delay:</span>{' '}
                  {replySettings.random_delay_enabled
                    ? `${replySettings.min_delay_seconds}–${replySettings.max_delay_seconds}s random`
                    : 'Disabled'}
                </div>
                <div>
                  <span className="text-foreground">Max length:</span>{' '}
                  {replySettings.max_sentences} sentences · {replySettings.max_words} words · {replySettings.max_emojis} emoji
                </div>
                <div>
                  <span className="text-foreground">Tone:</span>{' '}
                  {replySettings.tone || 'casual'} · Flirt {replySettings.flirt_level}/5 · Warmth {replySettings.warmth_level}/5
                </div>
                {replySettings.forbidden_openers && (
                  <div>
                    <span className="text-foreground">Forbidden openers:</span>{' '}
                    {replySettings.forbidden_openers.split('\n').filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            )}

          </>
        )}

      </div>
    </DashboardLayout>
  );
}

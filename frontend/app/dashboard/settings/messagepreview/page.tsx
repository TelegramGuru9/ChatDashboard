'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { Eye, ChevronLeft, Package, ShoppingCart, Zap, MessageSquare, TrendingUp } from 'lucide-react';
import Link from 'next/link';

const getApi = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '') + '/api/v1';

interface TelegramBubble {
  id: string;
  category: string;
  categoryIcon: React.ReactNode;
  label: string;
  messages: string[];
  hasButton?: string;
  hasImage?: boolean;
  imageLabel?: string;
  color: string;
}

function TgBubble({ text, hasButton, hasImage, imageLabel }: { text: string; hasButton?: string; hasImage?: boolean; imageLabel?: string }) {
  return (
    <div className="flex flex-col gap-1.5 items-start max-w-[260px]">
      {hasImage && (
        <div className="w-full rounded-xl bg-muted/60 border border-border flex items-center justify-center py-6 text-xs text-muted-foreground">
          {imageLabel || '📷 Package image'}
        </div>
      )}
      <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-muted text-sm leading-relaxed whitespace-pre-wrap break-words">
        {text}
      </div>
      {hasButton && (
        <div className="px-4 py-2 rounded-xl bg-primary/15 border border-primary/30 text-xs font-semibold text-primary text-center w-full">
          {hasButton}
        </div>
      )}
    </div>
  );
}

function PreviewSection({ icon, label, color, bubbles }: { icon: React.ReactNode; label: string; color: string; bubbles: { label: string; text: string; button?: string; image?: boolean; imageLabel?: string }[] }) {
  if (bubbles.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', color)}>
          {icon}
        </div>
        <span className="font-semibold text-sm">{label}</span>
      </div>
      <div className="divide-y divide-border">
        {bubbles.map((b, i) => (
          <div key={i} className="px-4 py-4 space-y-2">
            <div className="text-xs text-muted-foreground font-medium">{b.label}</div>
            <TgBubble text={b.text} hasButton={b.button} hasImage={b.image} imageLabel={b.imageLabel} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MessagePreviewPage() {
  const { withCreator } = useCreator();
  const api = getApi();
  const [loading, setLoading] = useState(true);

  const [packages, setPackages] = useState<any[]>([]);
  const [replySettings, setReplySettings] = useState<any>(null);
  const [systemSettings, setSystemSettings] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch(withCreator(`${api}/config/packages`)).then(r => r.json()).catch(() => ({ value: [] })),
      fetch(withCreator(`${api}/config/reply_settings`)).then(r => r.json()).catch(() => ({ value: null })),
      fetch(withCreator(`${api}/config/system_settings`)).then(r => r.json()).catch(() => ({ value: null })),
    ]).then(([pkgs, rs, ss]) => {
      if (Array.isArray(pkgs.value)) setPackages(pkgs.value);
      if (rs.value) setReplySettings(rs.value);
      if (ss.value) setSystemSettings(ss.value);
      setLoading(false);
    });
  }, [api, withCreator]);

  // Build package bubbles
  const packageBubbles = packages.map((pkg: any, i: number) => {
    const name = pkg.name || `Package ${i + 1}`;
    const price = pkg.price || '—';
    const text = pkg.package_text?.trim() || pkg.package_preview_description?.trim() || pkg.description?.trim() || `${name}\n\n💰 ${price}`;
    return {
      label: `${name} · ${price}`,
      text,
      button: pkg.buy_link ? '💳 Buy Now' : undefined,
      image: !!(pkg.preview_image_url || pkg.banner_url),
      imageLabel: pkg.preview_image_url ? '📷 Preview image' : pkg.banner_url ? '🖼 Banner' : undefined,
    };
  });

  // Upsell bubble
  const upsellBubbles = replySettings?.upsell_enabled && replySettings?.upsell_message
    ? [{ label: `Sent after buy link (+${replySettings.upsell_delay_hours}h)`, text: replySettings.upsell_message }]
    : [];

  // Cash Alarm
  const cashBubbles = systemSettings?.use_cash_workflow
    ? [{ label: 'Triggered after buy link sent', text: '🚨 Cash Alarm — buy link sent to a lead! Check the dashboard.' }]
    : [];

  // Custom instructions preview
  const customBubbles = replySettings?.custom_instructions?.trim()
    ? [{ label: 'Extra instructions injected into every prompt', text: replySettings.custom_instructions.trim() }]
    : [];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings" className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-pink-500/10 flex items-center justify-center">
            <Eye className="h-4 w-4 text-pink-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Message Preview</h1>
            <p className="text-xs text-muted-foreground">Telegram-style preview of all configured auto-messages</p>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : (
          <>
            {/* Packages */}
            <PreviewSection
              icon={<Package className="h-3.5 w-3.5" />}
              label="Package Messages"
              color="bg-blue-500/10 text-blue-400"
              bubbles={packageBubbles}
            />

            {/* Upsell */}
            <PreviewSection
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Upsell Follow-up"
              color="bg-amber-500/10 text-amber-400"
              bubbles={upsellBubbles}
            />

            {/* Cash Alarm */}
            <PreviewSection
              icon={<Zap className="h-3.5 w-3.5" />}
              label="Cash Alarm Notification"
              color="bg-orange-500/10 text-orange-400"
              bubbles={cashBubbles}
            />

            {/* Custom instructions */}
            <PreviewSection
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="Custom Instructions (injected into prompt)"
              color="bg-purple-500/10 text-purple-400"
              bubbles={customBubbles}
            />

            {packageBubbles.length === 0 && upsellBubbles.length === 0 && cashBubbles.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-card/50 py-12 text-center text-sm text-muted-foreground">
                No messages configured yet.<br />
                <span className="text-xs mt-1 block">Set up packages or reply settings to see previews here.</span>
              </div>
            )}

            {/* Timing info */}
            {replySettings && (
              <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-1.5">
                <div className="font-semibold text-foreground text-sm mb-2">Timing & Constraints</div>
                <div><span className="text-foreground">Delay:</span> {replySettings.random_delay_enabled ? `${replySettings.min_delay_seconds}–${replySettings.max_delay_seconds}s random` : 'Disabled'}</div>
                <div><span className="text-foreground">Max length:</span> {replySettings.max_sentences} sentences · {replySettings.max_words} words · {replySettings.max_emojis} emoji</div>
                <div><span className="text-foreground">Tone:</span> {replySettings.tone || 'casual'} · Flirt {replySettings.flirt_level}/5 · Warmth {replySettings.warmth_level}/5</div>
                {replySettings.forbidden_openers && (
                  <div><span className="text-foreground">Forbidden openers:</span> {replySettings.forbidden_openers.split('\n').filter(Boolean).join(', ')}</div>
                )}
              </div>
            )}
          </>
        )}

      </div>
    </DashboardLayout>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const C = {
  bg:'#0a0a0a', s1:'#111113', s2:'#1c1c1e', s3:'#2c2c2e', s4:'#3a3a3c',
  sep:'rgba(255,255,255,0.07)', t1:'#fff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2', teal:'#5ac8fa',
};

interface Rule {
  id: string;
  name: string;
  category: string;
  keywords: string[];      // trigger phrases
  label: string;           // CRM label to assign
  action: string;          // what AI does
  response_template: string; // template message to send
  enabled: boolean;
  priority: number;
}

// ── Nika's rules extracted from wishperme_telegram_autopilot_agent.md ──
const NIKA_RULES: Rule[] = [
  {
    id: 'price-inquiry',
    name: 'Price / Offer Inquiry',
    category: 'Sales',
    keywords: ['price', 'prices', 'how much', 'kosten', 'was kostet', 'cost', 'pricing', 'offer', 'package', 'what do you have'],
    label: 'HOT',
    action: 'send_package_menu',
    response_template: "I've got a few options for you:\n\n✨ Quick Tease — 1 video for 20 €\n🔥 Hot Bundle — 2 videos + 8 pics for 30 €\n💋 Full Package — 3 videos + 10 pics for 40 €\n\nWant it mixed or more in a specific style?",
    enabled: true,
    priority: 1,
  },
  {
    id: 'payment-link',
    name: 'Payment Link Request',
    category: 'Sales',
    keywords: ['link', 'how to pay', 'how do i pay', 'payment', 'buy', 'kaufen', 'bezahlen', 'pay now', 'i want it', 'send it'],
    label: 'HOT',
    action: 'send_payment_link',
    response_template: "Perfect 😘 here's the link for your package:\n{{payment_link}}\n\nSend me a quick \"done\" when it's paid.",
    enabled: true,
    priority: 2,
  },
  {
    id: 'payment-confirmed',
    name: 'Payment Confirmed',
    category: 'Sales',
    keywords: ['paid', 'done', 'sent', 'transferred', 'überwiesen', 'bezahlt', 'payment done', 'i paid'],
    label: 'BUYER',
    action: 'confirm_purchase_and_pitch_wishperme',
    response_template: "Since I know what you like now… you'd probably enjoy my wishperme even more 😏\n\nThere I post more exclusive stuff, more personal updates, and more of the style you just picked.\nWant the link?",
    enabled: true,
    priority: 3,
  },
  {
    id: 'payment-problem',
    name: 'Payment Problem',
    category: 'Support',
    keywords: ['not working', 'error', 'problem', 'failed', 'doesnt work', 'payment problem', 'link broken', 'not loading', 'doesnt open'],
    label: 'FAILED_PAYMENT',
    action: 'escalate_to_human',
    response_template: "Looks like something didn't go through. I'll have someone check it for you right away 💛",
    enabled: true,
    priority: 2,
  },
  {
    id: 'freebie-request',
    name: 'Freebie / Free Preview Request',
    category: 'Boundary',
    keywords: ['free', 'for free', 'gratis', 'umsonst', 'show me first', 'preview', 'sample', 'teaser', 'prove it', 'send one'],
    label: 'TIMEWASTER',
    action: 'send_boundary_response',
    response_template: "I don't send previews for free, babe. Pick a set and I'll make sure you get something worth it 😘",
    enabled: true,
    priority: 1,
  },
  {
    id: 'meeting-request',
    name: 'Real-life Meeting Request',
    category: 'Boundary',
    keywords: ['meet', 'meet up', 'treffen', 'persönlich', 'in person', 'real life', 'come over', 'visit', 'see you', 'where are you'],
    label: 'COLD',
    action: 'reject_meeting',
    response_template: "I don't do meetings. Everything stays here and private 🔒 But I can send you a hot set if you want something now 😏",
    enabled: true,
    priority: 1,
  },
  {
    id: 'custom-request',
    name: 'Custom Content Request',
    category: 'Sales',
    keywords: ['custom', 'personalized', 'individual', 'just for me', 'special request', 'my name', 'shoutout', 'custom video', 'personal video'],
    label: 'CUSTOM',
    action: 'escalate_to_human',
    response_template: "Ooh a custom 😏 I'll check with my team and get back to you about that one.",
    enabled: true,
    priority: 2,
  },
  {
    id: 'upsell-trigger',
    name: 'Upsell / More Content Request',
    category: 'Sales',
    keywords: ['more', 'another', 'more videos', 'more pics', 'what else', 'other sets', 'more content', 'send more', 'i want more'],
    label: 'UPSELL_READY',
    action: 'send_upsell_offer',
    response_template: "Okay babe, we can keep it here for now 😘\n\nI have one more set that fits what you liked — either more in the same direction or something that goes really well with it.\nWant me to show you?",
    enabled: true,
    priority: 2,
  },
  {
    id: 'wishperme-inquiry',
    name: 'Wishperme / Platform Inquiry',
    category: 'Wishperme',
    keywords: ['wishperme', 'wish perme', 'platform', 'subscription', 'onlyfans', 'fan page', 'membership', 'subscribe', 'what is that'],
    label: 'WISHPERME_INTERESTED',
    action: 'explain_wishperme',
    response_template: "Since I know what you like now… you'd probably enjoy my wishperme even more 😏\n\nThere I post more exclusive stuff, more personal updates, and more of the style you just picked.\nWant the link?",
    enabled: true,
    priority: 2,
  },
  {
    id: 'category-solo',
    name: 'Interest: Solo Content',
    category: 'Interest Tags',
    keywords: ['solo', 'alone', 'just you', 'only you', 'fingering'],
    label: 'CURIOUS',
    action: 'tag_interest_and_offer',
    response_template: "Mmh, I see what you like 😏 I can make the package more focused in that direction.\n\nQuick Tease is 20 €, Hot Bundle is 30 €, Full Package is 40 €.",
    enabled: true,
    priority: 3,
  },
  {
    id: 'category-dildo',
    name: 'Interest: Dildo Content',
    category: 'Interest Tags',
    keywords: ['dildo', 'toy', 'toys', 'vibrator', 'plug', 'penetration'],
    label: 'CURIOUS',
    action: 'tag_interest_and_offer',
    response_template: "Mmh, I see what you like 😏 I can make the package more focused in that direction.\n\nQuick Tease is 20 €, Hot Bundle is 30 €, Full Package is 40 €.",
    enabled: true,
    priority: 3,
  },
  {
    id: 'category-squirting',
    name: 'Interest: Squirting',
    category: 'Interest Tags',
    keywords: ['squirt', 'squirting', 'wet', 'soaking', 'dripping'],
    label: 'HOT',
    action: 'tag_interest_and_offer',
    response_template: "Mmh, I see what you like 😏 I can make the package more focused in that direction.\n\nQuick Tease is 20 €, Hot Bundle is 30 €, Full Package is 40 €.",
    enabled: true,
    priority: 3,
  },
  {
    id: 'category-dessous',
    name: 'Interest: Lingerie / Dessous',
    category: 'Interest Tags',
    keywords: ['lingerie', 'dessous', 'underwear', 'bra', 'thong', 'stockings', 'lace', 'sexy outfit'],
    label: 'CURIOUS',
    action: 'tag_interest_and_offer',
    response_template: "Mmh, I see what you like 😏 I can make the package more focused in that direction.\n\nQuick Tease is 20 €, Hot Bundle is 30 €, Full Package is 40 €.",
    enabled: true,
    priority: 3,
  },
  {
    id: 'category-highheels',
    name: 'Interest: High Heels / Feet',
    category: 'Interest Tags',
    keywords: ['heels', 'high heels', 'stiletto', 'feet', 'foot', 'toes', 'shoes', 'boots'],
    label: 'CURIOUS',
    action: 'tag_interest_and_offer',
    response_template: "Mmh, I see what you like 😏 I can make the package more focused in that direction.\n\nQuick Tease is 20 €, Hot Bundle is 30 €, Full Package is 40 €.",
    enabled: true,
    priority: 3,
  },
  {
    id: 'category-bathtub',
    name: 'Interest: Bathtub / Shower',
    category: 'Interest Tags',
    keywords: ['bathtub', 'bath', 'shower', 'wet body', 'bathroom', 'bubbles'],
    label: 'CURIOUS',
    action: 'tag_interest_and_offer',
    response_template: "Mmh, I see what you like 😏 I can make the package more focused in that direction.\n\nQuick Tease is 20 €, Hot Bundle is 30 €, Full Package is 40 €.",
    enabled: true,
    priority: 3,
  },
  {
    id: 'high-value',
    name: 'High Value Buyer',
    category: 'VIP',
    keywords: ['everything', 'i want it all', 'all packages', 'premium', 'vip', 'exclusive access', 'full access', 'best you have'],
    label: 'HIGH_VALUE',
    action: 'escalate_to_human',
    response_template: "Oh babe, you have taste 😏 Let me connect you with someone who can set you up properly.",
    enabled: true,
    priority: 1,
  },
  {
    id: 'second-wishperme-pitch',
    name: 'Second Wishperme Pitch (after decline)',
    category: 'Wishperme',
    keywords: ['not interested', 'no thanks', 'maybe later', 'not now', 'nope', 'nah'],
    label: 'WISHPERME_DECLINED',
    action: 'send_second_wishperme_pitch',
    response_template: "You clearly have good taste 😏\n\nThat's exactly why wishperme makes more sense for you. There's more of what you liked, plus exclusive related sets I don't keep sending here.\n\nUse this code: {{exclusive_code}}\n{{wishperme_link}}",
    enabled: true,
    priority: 4,
  },
  {
    id: 'age-check',
    name: 'Age Verification',
    category: 'Safety',
    keywords: ['how old', 'age', 'young', 'minor', 'underage', '16', '17', 'teenager', 'teen'],
    label: 'COLD',
    action: 'require_age_confirmation',
    response_template: "Hey, I need to confirm — are you 18 or older? Everything here is strictly 18+ content.",
    enabled: true,
    priority: 1,
  },
];

const CATEGORIES = ['All', ...Array.from(new Set(NIKA_RULES.map(r => r.category)))];
const LABEL_COLORS: Record<string,string> = {
  HOT: C.orange, BUYER: C.green, TIMEWASTER: C.red, COLD: C.teal,
  CURIOUS: C.blue, CUSTOM: C.purple, FAILED_PAYMENT: C.red,
  UPSELL_READY: C.green, WISHPERME_INTERESTED: C.purple, HIGH_VALUE: '#ffd60a',
  WISHPERME_DECLINED: C.t3,
};
const ACTION_LABELS: Record<string,string> = {
  send_package_menu: '📦 Send Package Menu',
  send_payment_link: '💳 Send Payment Link',
  confirm_purchase_and_pitch_wishperme: '✅ Confirm + Pitch Wishperme',
  escalate_to_human: '🙋 Escalate to Human',
  send_boundary_response: '🚫 Send Boundary',
  reject_meeting: '🙅 Reject Meeting',
  send_upsell_offer: '⬆ Send Upsell',
  explain_wishperme: '🌟 Explain Wishperme',
  tag_interest_and_offer: '🏷 Tag Interest + Offer',
  send_second_wishperme_pitch: '🎯 Second Wishperme Pitch',
  require_age_confirmation: '🔞 Age Check',
};

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

export default function AutoRepliesPage() {
  const [rules, setRules]         = useState<Rule[]>(NIKA_RULES);
  const [filter, setFilter]       = useState('All');
  const [editing, setEditing]     = useState<Rule | null>(null);
  const [saving, setSaving]       = useState(false);
  const [status, setStatus]       = useState('');
  const [initialized, setInitialized] = useState(false);

  const api = apiBase();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api}/config/auto_replies`);
      const d = await res.json();
      if (Array.isArray(d.value) && d.value.length > 0) {
        setRules(d.value);
      } else {
        // Fresh start — push Nika's rules
        await save(NIKA_RULES, true);
      }
    } catch {
      // Backend unavailable — use defaults
    }
    setInitialized(true);
  }, [api]);

  const save = async (updated: Rule[], silent = false) => {
    setSaving(true);
    try {
      await fetch(`${api}/config/auto_replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      setRules(updated);
      if (!silent) { setStatus('✓ Saved'); setTimeout(() => setStatus(''), 2500); }
    } catch { setStatus('⚠ Failed to save'); }
    finally { setSaving(false); }
  };

  useEffect(() => { load(); }, [load]);

  const toggleRule = (id: string) => {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    save(updated, true);
    setRules(updated);
  };

  const saveEdit = () => {
    if (!editing) return;
    const updated = rules.some(r => r.id === editing.id)
      ? rules.map(r => r.id === editing.id ? editing : r)
      : [...rules, editing];
    save(updated);
    setEditing(null);
  };

  const deleteRule = (id: string) => {
    if (!confirm('Delete this rule?')) return;
    save(rules.filter(r => r.id !== id));
  };

  const addRule = () => {
    const newRule: Rule = {
      id: `rule-${Date.now()}`,
      name: 'New Rule',
      category: 'Sales',
      keywords: [],
      label: 'CURIOUS',
      action: 'send_package_menu',
      response_template: '',
      enabled: true,
      priority: 3,
    };
    setEditing(newRule);
  };

  const resetToNika = async () => {
    if (!confirm('Reset to Nika\'s default rules? This will replace all current rules.')) return;
    await save(NIKA_RULES);
  };

  const visible = filter === 'All' ? rules : rules.filter(r => r.category === filter);
  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <DashboardLayout>
      <div style={{ padding:'28px 24px', maxWidth:'1000px', color: C.t1 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
          <div>
            <h1 style={{ fontSize:'26px', fontWeight:700, margin:0, letterSpacing:'-0.03em' }}>Auto-Reply Rules</h1>
            <p style={{ color: C.t2, fontSize:'14px', margin:'4px 0 0' }}>
              Nika's sales automation — {enabledCount} of {rules.length} rules active
            </p>
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={resetToNika} style={{ padding:'9px 14px', borderRadius:'12px', background:C.s2, border:`1px solid ${C.sep}`, color:C.t2, fontSize:'13px', cursor:'pointer' }}>
              ↺ Reset to Nika
            </button>
            <button onClick={addRule} style={{ padding:'9px 16px', borderRadius:'12px', background:C.blue, border:'none', color:'#fff', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
              + Add Rule
            </button>
          </div>
        </div>

        {status && (
          <div style={{ padding:'8px 14px', borderRadius:'10px', marginBottom:'14px', fontSize:'13px',
            background: status.startsWith('✓') ? 'rgba(48,209,88,0.1)' : 'rgba(255,149,10,0.1)',
            color: status.startsWith('✓') ? C.green : C.orange,
            border:`1px solid ${status.startsWith('✓') ? 'rgba(48,209,88,0.2)' : 'rgba(255,149,10,0.2)'}`,
          }}>{status}</div>
        )}

        {/* Category filter */}
        <div style={{ display:'flex', gap:'6px', marginBottom:'20px', flexWrap:'wrap' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} style={{
              padding:'6px 14px', borderRadius:'20px', fontSize:'12px', fontWeight:500, cursor:'pointer', border:'1px solid',
              background: filter === cat ? C.blue : 'transparent',
              borderColor: filter === cat ? C.blue : C.sep,
              color: filter === cat ? '#fff' : C.t2,
            }}>
              {cat} {cat !== 'All' ? `(${rules.filter(r => r.category === cat).length})` : `(${rules.length})`}
            </button>
          ))}
        </div>

        {/* Rules list */}
        {!initialized ? (
          <div style={{ textAlign:'center', padding:'60px', color:C.t3 }}>Loading rules…</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {visible.map(rule => {
              const labelCol = LABEL_COLORS[rule.label] ?? C.t3;
              return (
                <div key={rule.id} style={{
                  background: C.s1, borderRadius:'14px', border:`1px solid ${rule.enabled ? C.sep : 'rgba(255,255,255,0.03)'}`,
                  opacity: rule.enabled ? 1 : 0.5, transition:'all 0.15s',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px' }}>
                    {/* Toggle */}
                    <div
                      onClick={() => toggleRule(rule.id)}
                      style={{ width:'36px', height:'20px', borderRadius:'10px', background: rule.enabled ? C.green : C.s3, cursor:'pointer', position:'relative', flexShrink:0, transition:'background 0.2s' }}
                    >
                      <div style={{ position:'absolute', top:'2px', left: rule.enabled ? '18px' : '2px', width:'16px', height:'16px', borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.4)' }} />
                    </div>

                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'5px' }}>
                        <span style={{ fontWeight:600, fontSize:'14px' }}>{rule.name}</span>
                        <span style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'10px', background:`${labelCol}20`, color:labelCol, fontWeight:600 }}>{rule.label}</span>
                        <span style={{ fontSize:'11px', color:C.t3, background:C.s2, padding:'2px 8px', borderRadius:'8px' }}>{rule.category}</span>
                      </div>
                      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center' }}>
                        <span style={{ fontSize:'11px', color:C.teal }}>
                          🔑 {rule.keywords.slice(0,5).join(', ')}{rule.keywords.length > 5 ? ` +${rule.keywords.length - 5}` : ''}
                        </span>
                        <span style={{ fontSize:'11px', color:C.t3 }}>→</span>
                        <span style={{ fontSize:'11px', color:C.orange }}>{ACTION_LABELS[rule.action] || rule.action}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
                      <button onClick={() => setEditing({ ...rule })} style={{ padding:'5px 12px', borderRadius:'8px', background:C.s3, border:'none', color:C.t2, fontSize:'12px', cursor:'pointer' }}>Edit</button>
                      <button onClick={() => deleteRule(rule.id)} style={{ padding:'5px 10px', borderRadius:'8px', background:'rgba(255,69,58,0.1)', border:'1px solid rgba(255,69,58,0.2)', color:C.red, fontSize:'12px', cursor:'pointer' }}>🗑</button>
                    </div>
                  </div>

                  {/* Response preview */}
                  {rule.response_template && (
                    <div style={{ padding:'0 16px 12px', borderTop:`1px solid ${C.sep}` }}>
                      <div style={{ marginTop:'10px', padding:'10px 12px', borderRadius:'10px', background:C.s2, fontSize:'12px', color:C.t2, lineHeight:1.6, whiteSpace:'pre-wrap', maxHeight:'80px', overflow:'hidden', position:'relative' }}>
                        {rule.response_template}
                        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'24px', background:`linear-gradient(transparent, ${C.s2})` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={{ background:C.s1, borderRadius:'20px', padding:'24px', width:'100%', maxWidth:'520px', border:`1px solid ${C.sep}`, maxHeight:'90vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 20px', fontSize:'17px', fontWeight:700 }}>
              {rules.some(r => r.id === editing.id) ? 'Edit Rule' : 'New Rule'}
            </h3>

            <label style={{ display:'block', marginBottom:'14px' }}>
              <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>Rule Name</div>
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color:C.t1, fontSize:'13px', outline:'none' }} />
            </label>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' }}>
              <label>
                <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>Category</div>
                <input value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })}
                  style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 10px', color:C.t1, fontSize:'13px', outline:'none' }} />
              </label>
              <label>
                <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>CRM Label</div>
                <select value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })}
                  style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 10px', color:C.t1, fontSize:'13px', outline:'none' }}>
                  {Object.keys(LABEL_COLORS).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
            </div>

            <label style={{ display:'block', marginBottom:'14px' }}>
              <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>Keywords (comma-separated)</div>
              <input value={editing.keywords.join(', ')} onChange={e => setEditing({ ...editing, keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color:C.t1, fontSize:'13px', outline:'none' }} />
              <div style={{ fontSize:'11px', color:C.t3, marginTop:'4px' }}>Trigger phrases that activate this rule</div>
            </label>

            <label style={{ display:'block', marginBottom:'14px' }}>
              <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>Action</div>
              <select value={editing.action} onChange={e => setEditing({ ...editing, action: e.target.value })}
                style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color:C.t1, fontSize:'13px', outline:'none' }}>
                {Object.entries(ACTION_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </label>

            <label style={{ display:'block', marginBottom:'20px' }}>
              <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>Response Template</div>
              <textarea value={editing.response_template} onChange={e => setEditing({ ...editing, response_template: e.target.value })}
                placeholder="Message Nika sends when this rule triggers…"
                rows={5}
                style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color:C.t1, fontSize:'13px', outline:'none', resize:'vertical', fontFamily:'inherit' }} />
              <div style={{ fontSize:'11px', color:C.t3, marginTop:'4px' }}>Use {'{{payment_link}}'}, {'{{exclusive_code}}'}, {'{{wishperme_link}}'} as placeholders</div>
            </label>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setEditing(null)} style={{ flex:1, padding:'11px', borderRadius:'12px', background:C.s3, border:'none', color:C.t2, fontSize:'14px', cursor:'pointer' }}>Cancel</button>
              <button onClick={saveEdit} disabled={saving} style={{ flex:2, padding:'11px', borderRadius:'12px', background:C.blue, border:'none', color:'#fff', fontSize:'14px', fontWeight:600, cursor:'pointer', opacity:saving?0.6:1 }}>
                {saving ? 'Saving…' : 'Save Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

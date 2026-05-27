'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const ios = {
  surface: '#1c1c1e', surface2: '#2c2c2e',
  border: 'rgba(255,255,255,0.08)', accent: '#0a84ff',
  green: '#30d158', red: '#ff453a', amber: '#ffd60a', purple: '#bf5af2',
  text: '#fff', text2: 'rgba(255,255,255,0.55)', text3: 'rgba(255,255,255,0.3)',
};

interface Rule {
  id: string;
  name: string;
  trigger: 'keyword' | 'message_count' | 'time_delay' | 'no_reply' | 'stage_change';
  triggerValue: string;
  action: 'send_message' | 'send_media' | 'suggest_call' | 'send_package';
  actionValue: string;
  active: boolean;
  delay: number;
}

const TRIGGERS = [
  { key: 'keyword', label: '🔍 Keyword Match' },
  { key: 'message_count', label: '🔢 After N Messages' },
  { key: 'time_delay', label: '⏰ Time Delay' },
  { key: 'no_reply', label: '😶 No Reply Timeout' },
  { key: 'stage_change', label: '📊 Funnel Stage Change' },
];
const ACTIONS = [
  { key: 'send_message', label: '💬 Send Message' },
  { key: 'send_media', label: '🖼️ Send Media File' },
  { key: 'suggest_call', label: '📞 Suggest a Call' },
  { key: 'send_package', label: '📦 Send Package Info' },
];

const DEMO: Rule[] = [
  { id: '1', name: 'Pricing inquiry', trigger: 'keyword', triggerValue: 'price,cost,how much,pricing', action: 'send_package', actionValue: 'All packages', active: true, delay: 0 },
  { id: '2', name: 'Follow-up after 3 messages', trigger: 'message_count', triggerValue: '3', action: 'suggest_call', actionValue: 'Would you like to jump on a quick call to discuss this further?', active: true, delay: 0 },
  { id: '3', name: 'No reply 24h', trigger: 'no_reply', triggerValue: '24', action: 'send_message', actionValue: 'Hey! Just checking in — do you have any questions I can help with? 😊', active: false, delay: 0 },
  { id: '4', name: 'Send brochure on interest', trigger: 'stage_change', triggerValue: 'interest', action: 'send_media', actionValue: 'brochure.pdf', active: true, delay: 5 },
];

const triggerLabel = (r: Rule) => {
  const t = TRIGGERS.find(t => t.key === r.trigger);
  return `${t?.label} — ${r.triggerValue}`;
};
const actionLabel = (r: Rule) => {
  const a = ACTIONS.find(a => a.key === r.action);
  return `${a?.label}: "${r.actionValue.slice(0, 40)}${r.actionValue.length > 40 ? '…' : ''}"`;
};

export default function AutoRepliesPage() {
  const [rules, setRules] = useState<Rule[]>(DEMO);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [showForm, setShowForm] = useState(false);

  const blank = (): Rule => ({
    id: Date.now().toString(), name: '', trigger: 'keyword', triggerValue: '',
    action: 'send_message', actionValue: '', active: true, delay: 0,
  });

  const save = (r: Rule) => {
    setRules(prev => {
      const idx = prev.findIndex(p => p.id === r.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = r; return n; }
      return [...prev, r];
    });
    setEditing(null); setShowForm(false);
  };

  const remove = (id: string) => setRules(prev => prev.filter(r => r.id !== id));
  const toggle = (id: string) => setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));

  const E = editing;

  const triggerPlaceholder: Record<string, string> = {
    keyword: 'price, cost, how much (comma-separated)',
    message_count: '3  (trigger after 3 messages)',
    time_delay: '60  (minutes after conversation starts)',
    no_reply: '24  (hours without a reply)',
    stage_change: 'interest  (funnel stage name)',
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '24px 20px', maxWidth: '860px', color: ios.text }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Auto-Reply Rules</h1>
            <p style={{ color: ios.text2, fontSize: '13px', marginTop: '4px' }}>
              Smart triggers that fire automatically during conversations
            </p>
          </div>
          <button onClick={() => { setEditing(blank()); setShowForm(true); }} style={{
            padding: '10px 18px', borderRadius: '12px', background: ios.accent,
            border: 'none', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          }}>＋ New Rule</button>
        </div>

        {/* Rules list */}
        {rules.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: ios.text3 }}>
            <div style={{ fontSize: '44px', marginBottom: '12px' }}>⚡</div>
            <div style={{ fontSize: '16px', fontWeight: 600 }}>No rules yet</div>
            <div style={{ fontSize: '13px', marginTop: '6px' }}>Create your first auto-reply rule above</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rules.map((rule, idx) => (
              <div key={rule.id} style={{
                background: ios.surface, borderRadius: '14px', padding: '16px 18px',
                border: `1px solid ${ios.border}`,
                borderLeft: `3px solid ${rule.active ? ios.green : ios.text3}`,
                opacity: rule.active ? 1 : 0.55,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Number */}
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                    background: rule.active ? 'rgba(48,209,88,0.15)' : ios.surface2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 700, color: rule.active ? ios.green : ios.text3,
                  }}>{idx + 1}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{rule.name || '(Unnamed rule)'}</div>
                    <div style={{ fontSize: '12px', color: ios.text3, marginBottom: '2px' }}>
                      <span style={{ color: ios.amber }}>WHEN</span> {triggerLabel(rule)}
                    </div>
                    <div style={{ fontSize: '12px', color: ios.text3 }}>
                      <span style={{ color: ios.accent }}>THEN</span> {actionLabel(rule)}
                      {rule.delay > 0 && <span style={{ color: ios.text3 }}> (after {rule.delay}s)</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {/* Toggle */}
                    <button onClick={() => toggle(rule.id)} style={{
                      width: '38px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                      background: rule.active ? ios.green : ios.surface2, position: 'relative',
                    }}>
                      <span style={{
                        position: 'absolute', top: '3px', width: '16px', height: '16px',
                        borderRadius: '50%', background: '#fff',
                        left: rule.active ? '19px' : '3px', transition: 'left 0.2s',
                      }} />
                    </button>
                    <button onClick={() => { setEditing(rule); setShowForm(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ios.accent, fontSize: '16px' }}>✎</button>
                    <button onClick={() => remove(rule.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ios.red, fontSize: '16px' }}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* How it works */}
        <div style={{ marginTop: '24px', padding: '18px', borderRadius: '14px', background: ios.surface, border: `1px solid ${ios.border}` }}>
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>⚡ How Auto-Reply works</div>
          {[
            ['🤖 AI Chat', 'The AI handles conversation naturally using your persona'],
            ['👀 Rules watch', 'Rules monitor each message for your trigger conditions'],
            ['⚡ Action fires', 'When a trigger matches, the rule sends its action automatically'],
            ['📊 Logged', 'All auto-replies are saved to your Inbox with the AI tag'],
          ].map(([icon, text]) => (
            <div key={icon} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px', fontSize: '13px', color: ios.text2 }}>
              <span style={{ fontSize: '16px', lineHeight: 1.4 }}>{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* Edit modal */}
        {showForm && E && (
          <>
            <div onClick={() => { setShowForm(false); setEditing(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400, backdropFilter: 'blur(8px)' }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              zIndex: 500, width: 'min(500px,90vw)', maxHeight: '90vh', overflowY: 'auto',
              background: ios.surface, borderRadius: '22px', padding: '28px',
              border: `1px solid ${ios.border}`,
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>
                {rules.find(r => r.id === E.id) ? 'Edit Rule' : 'New Auto-Reply Rule'}
              </h2>

              {/* Name */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: ios.text2, display: 'block', marginBottom: '6px' }}>Rule Name</label>
                <input value={E.name} onChange={ev => setEditing({ ...E, name: ev.target.value })} placeholder="e.g. Pricing inquiry"
                  style={{ width: '100%', background: ios.surface2, border: `1px solid ${ios.border}`, borderRadius: '10px', padding: '10px 12px', color: ios.text, fontSize: '14px' }} />
              </div>

              {/* Trigger */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: ios.text2, display: 'block', marginBottom: '6px' }}>🎯 Trigger Condition</label>
                <select value={E.trigger} onChange={ev => setEditing({ ...E, trigger: ev.target.value as any })}
                  style={{ width: '100%', background: ios.surface2, border: `1px solid ${ios.border}`, borderRadius: '10px', padding: '10px 12px', color: ios.text, fontSize: '14px', marginBottom: '8px' }}>
                  {TRIGGERS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <input value={E.triggerValue} onChange={ev => setEditing({ ...E, triggerValue: ev.target.value })}
                  placeholder={triggerPlaceholder[E.trigger]}
                  style={{ width: '100%', background: ios.surface2, border: `1px solid ${ios.border}`, borderRadius: '10px', padding: '10px 12px', color: ios.text, fontSize: '13px' }} />
              </div>

              {/* Action */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: ios.text2, display: 'block', marginBottom: '6px' }}>⚡ Action</label>
                <select value={E.action} onChange={ev => setEditing({ ...E, action: ev.target.value as any })}
                  style={{ width: '100%', background: ios.surface2, border: `1px solid ${ios.border}`, borderRadius: '10px', padding: '10px 12px', color: ios.text, fontSize: '14px', marginBottom: '8px' }}>
                  {ACTIONS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
                <textarea value={E.actionValue} onChange={ev => setEditing({ ...E, actionValue: ev.target.value })}
                  rows={3} placeholder={E.action === 'send_message' ? 'Message text to send…' : E.action === 'send_media' ? 'File name from Media Library' : E.action === 'suggest_call' ? 'Call suggestion text' : 'Package name to share'}
                  style={{ width: '100%', background: ios.surface2, border: `1px solid ${ios.border}`, borderRadius: '10px', padding: '10px 12px', color: ios.text, fontSize: '13px', resize: 'vertical' }} />
              </div>

              {/* Delay */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', color: ios.text2, display: 'block', marginBottom: '6px' }}>
                  ⏱ Delay before sending: <span style={{ color: ios.accent }}>{E.delay}s</span>
                </label>
                <input type="range" min={0} max={300} step={5} value={E.delay}
                  onChange={ev => setEditing({ ...E, delay: Number(ev.target.value) })}
                  style={{ width: '100%', accentColor: ios.accent }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: ios.text3 }}>
                  <span>Instant</span><span>5 min</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ padding: '10px 20px', borderRadius: '12px', background: ios.surface2, border: 'none', color: ios.text2, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button onClick={() => save(E)} style={{ padding: '10px 24px', borderRadius: '12px', background: ios.accent, border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>Save Rule</button>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

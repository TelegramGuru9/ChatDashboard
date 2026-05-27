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
  keywords: string[];
  label: string;
  action: string;
  response_template: string;
  enabled: boolean;
  priority: number;
}

// ── Nika-Regeln auf Deutsch ──────────────────────────────────────────────────
const NIKA_RULES: Rule[] = [
  {
    id: 'price-inquiry',
    name: 'Preisanfrage / Paket-Anfrage',
    category: 'Verkauf',
    keywords: [
      'preis', 'preise', 'was kostet', 'kosten', 'wie viel', 'wie teuer',
      'price', 'how much', 'cost', 'offer', 'paket', 'package', 'angebot',
    ],
    label: 'HOT',
    action: 'send_package_menu',
    response_template:
      'Hier meine aktuelle Liste:\n\n' +
      '🔞 Quick Tease -- 1 Video für 20 €\n' +
      '🔥 Hot Bundle -- 2 Videos + 8 Pics für 30 €\n' +
      '💋 Full Package -- 3 Videos + 10 Pics für 40 €\n\n' +
      'Magst du es eher soft oder richtig explizit? Sag mir was du magst und ich pack das rein 😏',
    enabled: true,
    priority: 1,
  },
  {
    id: 'payment-link',
    name: 'Zahlungslink angefordert',
    category: 'Verkauf',
    keywords: [
      'link', 'wie bezahle ich', 'wie zahlen', 'bezahlen', 'kaufen',
      'how to pay', 'payment', 'buy', 'ich will es', 'schick mir',
    ],
    label: 'HOT',
    action: 'send_payment_link',
    response_template:
      'Perfect 😘 hier ist der Link für dein Paket:\n{{payment_link}}\n\nSchreib mir kurz "done" wenn es bezahlt ist.',
    enabled: true,
    priority: 2,
  },
  {
    id: 'payment-confirmed',
    name: 'Zahlung bestätigt',
    category: 'Verkauf',
    keywords: [
      'bezahlt', 'überwiesen', 'done', 'erledigt', 'gemacht', 'gesendet',
      'paid', 'sent', 'transferred', 'payment done', 'i paid',
    ],
    label: 'BUYER',
    action: 'confirm_purchase_and_pitch_wishperme',
    response_template:
      'Ich weiß jetzt was du magst... du würdest mein wishperme noch viel mehr lieben 😏\n\nDort poste ich noch exklusivere Inhalte, persönlichere Updates und mehr von dem Stil den du gerade gewählt hast.\nMöchtest du den Link?',
    enabled: true,
    priority: 3,
  },
  {
    id: 'payment-problem',
    name: 'Zahlungsproblem',
    category: 'Support',
    keywords: [
      'funktioniert nicht', 'fehler', 'problem', 'link kaputt', 'geht nicht',
      'error', 'failed', 'not working', 'link broken', 'payment problem',
    ],
    label: 'FAILED_PAYMENT',
    action: 'escalate_to_human',
    response_template:
      'Sieht aus als wäre da was nicht durchgegangen. Ich lasse das sofort für dich prüfen 💛',
    enabled: true,
    priority: 2,
  },
  {
    id: 'freebie-request',
    name: 'Gratis-Anfrage / Vorschau',
    category: 'Grenze',
    keywords: [
      'gratis', 'umsonst', 'kostenlos', 'zeig mal', 'vorschau', 'probe',
      'free', 'for free', 'preview', 'sample', 'teaser', 'send one',
    ],
    label: 'TIMEWASTER',
    action: 'send_boundary_response',
    response_template:
      'Ich schicke keine Previews umsonst, babe. Such dir ein Paket aus und ich sorge dafür dass du etwas bekommst das sich lohnt 😘',
    enabled: true,
    priority: 1,
  },
  {
    id: 'meeting-request',
    name: 'Treffen-Anfrage (Real Life)',
    category: 'Grenze',
    keywords: [
      'treffen', 'persönlich', 'in person', 'meet up', 'real life',
      'meet', 'come over', 'visit', 'wo bist du', 'where are you',
    ],
    label: 'COLD',
    action: 'reject_meeting',
    response_template:
      'Ich mache keine Treffen. Alles bleibt hier und privat 🔒 Aber ich kann dir ein heißes Set schicken wenn du jetzt etwas willst 😏',
    enabled: true,
    priority: 1,
  },
  {
    id: 'custom-request',
    name: 'Custom-Content-Anfrage',
    category: 'Verkauf',
    keywords: [
      'custom', 'personalisiert', 'nur für mich', 'speziell', 'mit meinem namen',
      'personalized', 'individual', 'just for me', 'custom video', 'personal video',
    ],
    label: 'CUSTOM',
    action: 'escalate_to_human',
    response_template:
      'Ooh ein Custom 😏 Ich frage kurz nach und melde mich wegen dem Preis.',
    enabled: true,
    priority: 2,
  },
  {
    id: 'upsell-trigger',
    name: 'Upsell / Mehr Content',
    category: 'Verkauf',
    keywords: [
      'mehr', 'noch eins', 'mehr videos', 'mehr pics', 'was noch', 'noch mehr',
      'more', 'another', 'more videos', 'send more', 'i want more',
    ],
    label: 'UPSELL_READY',
    action: 'send_upsell_offer',
    response_template:
      'Okay babe, lass uns das hier halten 😘\n\nIch hab noch ein Set das perfekt zu dem passt was du mochtest. Soll ich dir das zeigen?',
    enabled: true,
    priority: 2,
  },
  {
    id: 'wishperme-inquiry',
    name: 'Wishperme / Plattform-Anfrage',
    category: 'Wishperme',
    keywords: [
      'wishperme', 'wish perme', 'plattform', 'abo', 'subscription',
      'onlyfans', 'fan page', 'mitgliedschaft', 'subscribe', 'was ist das',
    ],
    label: 'WISHPERME_INTERESTED',
    action: 'explain_wishperme',
    response_template:
      'Ich weiß jetzt was du magst... du würdest mein wishperme noch viel mehr lieben 😏\n\nDort poste ich noch exklusivere Inhalte, persönlichere Updates und mehr von dem Stil den du liebst.\nMöchtest du den Link?',
    enabled: true,
    priority: 2,
  },
  {
    id: 'category-solo',
    name: 'Interesse: Solo-Content',
    category: 'Interesse',
    keywords: ['solo', 'alleine', 'nur du', 'fingering', 'alone', 'just you'],
    label: 'CURIOUS',
    action: 'tag_interest_and_offer',
    response_template:
      'Mmh, ich sehe was dir gefällt 😏 Ich kann das Paket mehr in die Richtung lenken.\n\nQuick Tease 20 €, Hot Bundle 30 €, Full Package 40 €.',
    enabled: true,
    priority: 3,
  },
  {
    id: 'category-dildo',
    name: 'Interesse: Spielzeug-Content',
    category: 'Interesse',
    keywords: ['dildo', 'spielzeug', 'toy', 'vibrator', 'plug', 'penetration', 'toys'],
    label: 'CURIOUS',
    action: 'tag_interest_and_offer',
    response_template:
      'Mmh, ich sehe was dir gefällt 😏 Ich kann das Paket mehr in die Richtung lenken.\n\nQuick Tease 20 €, Hot Bundle 30 €, Full Package 40 €.',
    enabled: true,
    priority: 3,
  },
  {
    id: 'category-squirting',
    name: 'Interesse: Squirting',
    category: 'Interesse',
    keywords: ['squirt', 'squirting', 'nass', 'wet', 'soaking', 'dripping'],
    label: 'HOT',
    action: 'tag_interest_and_offer',
    response_template:
      'Mmh, ich sehe was dir gefällt 😏 Ich kann das Paket mehr in die Richtung lenken.\n\nQuick Tease 20 €, Hot Bundle 30 €, Full Package 40 €.',
    enabled: true,
    priority: 3,
  },
  {
    id: 'category-dessous',
    name: 'Interesse: Dessous / Lingerie',
    category: 'Interesse',
    keywords: ['dessous', 'lingerie', 'unterwäsche', 'strümpfe', 'bra', 'thong', 'lace', 'sexy outfit'],
    label: 'CURIOUS',
    action: 'tag_interest_and_offer',
    response_template:
      'Mmh, ich sehe was dir gefällt 😏 Ich kann das Paket mehr in die Richtung lenken.\n\nQuick Tease 20 €, Hot Bundle 30 €, Full Package 40 €.',
    enabled: true,
    priority: 3,
  },
  {
    id: 'category-highheels',
    name: 'Interesse: High Heels / Füße',
    category: 'Interesse',
    keywords: ['heels', 'high heels', 'stiletto', 'füße', 'feet', 'foot', 'toes', 'schuhe', 'stiefel'],
    label: 'CURIOUS',
    action: 'tag_interest_and_offer',
    response_template:
      'Mmh, ich sehe was dir gefällt 😏 Ich kann das Paket mehr in die Richtung lenken.\n\nQuick Tease 20 €, Hot Bundle 30 €, Full Package 40 €.',
    enabled: true,
    priority: 3,
  },
  {
    id: 'category-bathtub',
    name: 'Interesse: Badewanne / Dusche',
    category: 'Interesse',
    keywords: ['badewanne', 'bad', 'dusche', 'nasser körper', 'bathroom', 'bubbles', 'shower', 'wet body'],
    label: 'CURIOUS',
    action: 'tag_interest_and_offer',
    response_template:
      'Mmh, ich sehe was dir gefällt 😏 Ich kann das Paket mehr in die Richtung lenken.\n\nQuick Tease 20 €, Hot Bundle 30 €, Full Package 40 €.',
    enabled: true,
    priority: 3,
  },
  {
    id: 'high-value',
    name: 'High-Value Käufer',
    category: 'VIP',
    keywords: [
      'alles', 'ich will alles', 'alle pakete', 'premium', 'vip',
      'exklusiv', 'everything', 'all packages', 'full access', 'best you have',
    ],
    label: 'HIGH_VALUE',
    action: 'escalate_to_human',
    response_template:
      'Oh babe, du hast Geschmack 😏 Ich verbinde dich mit jemandem der dir das richtig einrichtet.',
    enabled: true,
    priority: 1,
  },
  {
    id: 'second-wishperme-pitch',
    name: 'Zweiter Wishperme-Pitch (nach Ablehnung)',
    category: 'Wishperme',
    keywords: ['kein interesse', 'nein danke', 'vielleicht später', 'nicht jetzt', 'nope', 'nah', 'not interested', 'no thanks'],
    label: 'WISHPERME_DECLINED',
    action: 'send_second_wishperme_pitch',
    response_template:
      'Du hast eindeutig guten Geschmack 😏\n\nGenau deshalb macht wishperme mehr Sinn für dich. Da gibt es mehr von dem was du mochtest, plus exklusive Sets die ich hier nicht schicke.\n\nNutze diesen Code: {{exclusive_code}}\n{{wishperme_link}}',
    enabled: true,
    priority: 4,
  },
  {
    id: 'age-check',
    name: 'Altersverifikation',
    category: 'Sicherheit',
    keywords: [
      'wie alt', 'alter', 'jung', 'minderjährig', 'teenager',
      'how old', 'age', 'young', 'minor', 'underage', '16', '17',
    ],
    label: 'COLD',
    action: 'require_age_confirmation',
    response_template:
      'Hey, ich muss kurz fragen -- bist du 18 oder älter? Alles hier ist strikt 18+ Content.',
    enabled: true,
    priority: 1,
  },
];

const CATEGORIES = ['Alle', ...Array.from(new Set(NIKA_RULES.map(r => r.category)))];

const LABEL_COLORS: Record<string, string> = {
  HOT: C.orange, BUYER: C.green, TIMEWASTER: C.red, COLD: C.teal,
  CURIOUS: C.blue, CUSTOM: C.purple, FAILED_PAYMENT: C.red,
  UPSELL_READY: C.green, WISHPERME_INTERESTED: C.purple, HIGH_VALUE: '#ffd60a',
  WISHPERME_DECLINED: C.t3,
};

const ACTION_LABELS: Record<string, string> = {
  send_package_menu:                    '📦 Paketmenü senden',
  send_payment_link:                    '💳 Zahlungslink senden',
  confirm_purchase_and_pitch_wishperme: '✅ Bestätigen + Wishperme pitchen',
  escalate_to_human:                    '🙋 An Mensch übergeben',
  send_boundary_response:               '🚫 Grenz-Antwort senden',
  reject_meeting:                       '🙅 Treffen ablehnen',
  send_upsell_offer:                    '⬆ Upsell anbieten',
  explain_wishperme:                    '🌟 Wishperme erklären',
  tag_interest_and_offer:               '🏷 Interesse taggen + Angebot',
  send_second_wishperme_pitch:          '🎯 Zweiter Wishperme-Pitch',
  require_age_confirmation:             '🔞 Alterscheck',
};

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

// ── Chevron icon ─────────────────────────────────────────────────────────────
function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transition:'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AutoRepliesPage() {
  const [rules, setRules]             = useState<Rule[]>(NIKA_RULES);
  const [filter, setFilter]           = useState('Alle');
  const [editing, setEditing]         = useState<Rule | null>(null);
  const [saving, setSaving]           = useState(false);
  const [status, setStatus]           = useState('');
  const [initialized, setInitialized] = useState(false);
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());

  const api = apiBase();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api}/config/auto_replies`);
      const d = await res.json();
      if (Array.isArray(d.value) && d.value.length > 0) {
        setRules(d.value);
      } else {
        await save(NIKA_RULES, true);
      }
    } catch {
      // Backend nicht erreichbar — Standardregeln verwenden
    }
    setInitialized(true);
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (updated: Rule[], silent = false) => {
    setSaving(true);
    try {
      const res = await fetch(`${api}/config/auto_replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRules(updated);
      if (!silent) { setStatus('✓ Gespeichert'); setTimeout(() => setStatus(''), 2500); }
    } catch {
      setStatus('⚠ Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => { load(); }, [load]);

  const toggleRule = (id: string) => {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    save(updated, true);
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
    if (!confirm('Diese Regel löschen?')) return;
    save(rules.filter(r => r.id !== id));
  };

  const addRule = () => {
    const newRule: Rule = {
      id: `rule-${Date.now()}`,
      name: 'Neue Regel',
      category: 'Verkauf',
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
    if (!confirm('Zu Nikas Standardregeln zurücksetzen? Alle aktuellen Regeln werden ersetzt.')) return;
    await save(NIKA_RULES);
  };

  const filterCat = (r: Rule) => filter === 'Alle' || r.category === filter;
  const visible     = rules.filter(filterCat);
  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <DashboardLayout>
      <div style={{ padding:'28px 24px', maxWidth:'1000px', color: C.t1 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
          <div>
            <h1 style={{ fontSize:'26px', fontWeight:700, margin:0, letterSpacing:'-0.03em' }}>Auto-Antwort Regeln</h1>
            <p style={{ color: C.t2, fontSize:'14px', margin:'4px 0 0' }}>
              Nikas Verkaufsautomatisierung — {enabledCount} von {rules.length} Regeln aktiv
            </p>
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={resetToNika} style={{ padding:'9px 14px', borderRadius:'12px', background:C.s2, border:`1px solid ${C.sep}`, color:C.t2, fontSize:'13px', cursor:'pointer' }}>
              ↺ Zurücksetzen
            </button>
            <button onClick={addRule} style={{ padding:'9px 16px', borderRadius:'12px', background:C.blue, border:'none', color:'#fff', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
              + Regel hinzufügen
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

        {/* Kategorie-Filter */}
        <div style={{ display:'flex', gap:'6px', marginBottom:'20px', flexWrap:'wrap' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} style={{
              padding:'6px 14px', borderRadius:'20px', fontSize:'12px', fontWeight:500, cursor:'pointer', border:'1px solid',
              background: filter === cat ? C.blue : 'transparent',
              borderColor: filter === cat ? C.blue : C.sep,
              color: filter === cat ? '#fff' : C.t2,
            }}>
              {cat} ({cat === 'Alle' ? rules.length : rules.filter(r => r.category === cat).length})
            </button>
          ))}
        </div>

        {/* Regelliste */}
        {!initialized ? (
          <div style={{ textAlign:'center', padding:'60px', color:C.t3 }}>Regeln werden geladen...</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {visible.map(rule => {
              const labelCol  = LABEL_COLORS[rule.label] ?? C.t3;
              const isOpen    = expanded.has(rule.id);

              return (
                <div key={rule.id} style={{
                  background: C.s1, borderRadius:'14px',
                  border:`1px solid ${rule.enabled ? (isOpen ? C.blue + '40' : C.sep) : 'rgba(255,255,255,0.03)'}`,
                  opacity: rule.enabled ? 1 : 0.55, transition:'all 0.15s',
                }}>

                  {/* ── Kopfzeile (immer sichtbar) ─────────────────────────── */}
                  <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px', cursor:'pointer' }}
                    onClick={() => toggleExpand(rule.id)}>

                    {/* Toggle (stoppt click-bubbling) */}
                    <div
                      onClick={e => { e.stopPropagation(); toggleRule(rule.id); }}
                      title={rule.enabled ? 'Deaktivieren' : 'Aktivieren'}
                      style={{ width:'36px', height:'20px', borderRadius:'10px', background: rule.enabled ? C.green : C.s3, cursor:'pointer', position:'relative', flexShrink:0, transition:'background 0.2s' }}
                    >
                      <div style={{ position:'absolute', top:'2px', left: rule.enabled ? '18px' : '2px', width:'16px', height:'16px', borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.4)' }} />
                    </div>

                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'4px' }}>
                        <span style={{ fontWeight:600, fontSize:'14px' }}>{rule.name}</span>
                        <span style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'10px', background:`${labelCol}20`, color:labelCol, fontWeight:600 }}>
                          {rule.label}
                        </span>
                        <span style={{ fontSize:'11px', color:C.t3, background:C.s2, padding:'2px 8px', borderRadius:'8px' }}>
                          {rule.category}
                        </span>
                        <span style={{ fontSize:'11px', color:C.t3, background:C.s2, padding:'2px 7px', borderRadius:'8px' }}>
                          Prio {rule.priority}
                        </span>
                      </div>
                      {!isOpen && (
                        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
                          <span style={{ fontSize:'11px', color:C.teal }}>
                            🔑 {rule.keywords.slice(0, 4).join(', ')}{rule.keywords.length > 4 ? ` +${rule.keywords.length - 4}` : ''}
                          </span>
                          <span style={{ fontSize:'11px', color:C.t3 }}>→</span>
                          <span style={{ fontSize:'11px', color:C.orange }}>{ACTION_LABELS[rule.action] || rule.action}</span>
                        </div>
                      )}
                    </div>

                    {/* Aktions-Buttons + Chevron */}
                    <div style={{ display:'flex', gap:'6px', flexShrink:0, alignItems:'center' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setEditing({ ...rule })} style={{ padding:'5px 12px', borderRadius:'8px', background:C.s3, border:'none', color:C.t2, fontSize:'12px', cursor:'pointer' }}>
                        Bearbeiten
                      </button>
                      <button onClick={() => deleteRule(rule.id)} style={{ padding:'5px 10px', borderRadius:'8px', background:'rgba(255,69,58,0.1)', border:'1px solid rgba(255,69,58,0.2)', color:C.red, fontSize:'12px', cursor:'pointer' }}>
                        🗑
                      </button>
                    </div>
                    <div style={{ color:C.t3, marginLeft:'4px' }} onClick={() => toggleExpand(rule.id)}>
                      <Chevron open={isOpen} />
                    </div>
                  </div>

                  {/* ── Ausgeklappter Bereich ────────────────────────────────── */}
                  {isOpen && (
                    <div style={{ padding:'0 16px 16px', borderTop:`1px solid ${C.sep}` }}>

                      {/* Schlüsselwörter */}
                      <div style={{ marginTop:'14px', marginBottom:'12px' }}>
                        <div style={{ fontSize:'11px', fontWeight:600, color:C.t3, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px' }}>
                          🔑 Schlüsselwörter ({rule.keywords.length})
                        </div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
                          {rule.keywords.map(kw => (
                            <span key={kw} style={{ fontSize:'11px', padding:'3px 9px', borderRadius:'20px', background:C.s2, border:`1px solid ${C.sep}`, color:C.teal }}>
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Aktion */}
                      <div style={{ marginBottom:'12px' }}>
                        <div style={{ fontSize:'11px', fontWeight:600, color:C.t3, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>
                          Aktion
                        </div>
                        <span style={{ fontSize:'12px', color:C.orange }}>{ACTION_LABELS[rule.action] || rule.action}</span>
                      </div>

                      {/* Antwort-Template */}
                      {rule.response_template && (
                        <div>
                          <div style={{ fontSize:'11px', fontWeight:600, color:C.t3, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>
                            Antwort-Template
                          </div>
                          <div style={{ padding:'12px 14px', borderRadius:'12px', background:C.s2, border:`1px solid ${C.sep}`, fontSize:'13px', color:C.t2, lineHeight:'1.65', whiteSpace:'pre-wrap' }}>
                            {rule.response_template}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bearbeitungs-Modal */}
      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={{ background:C.s1, borderRadius:'20px', padding:'24px', width:'100%', maxWidth:'540px', border:`1px solid ${C.sep}`, maxHeight:'90vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 20px', fontSize:'17px', fontWeight:700 }}>
              {rules.some(r => r.id === editing.id) ? 'Regel bearbeiten' : 'Neue Regel'}
            </h3>

            <label style={{ display:'block', marginBottom:'14px' }}>
              <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>Regelname</div>
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color:C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
            </label>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' }}>
              <label>
                <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>Kategorie</div>
                <input value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })}
                  style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 10px', color:C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
              </label>
              <label>
                <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>CRM-Label</div>
                <select value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })}
                  style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 10px', color:C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }}>
                  {Object.keys(LABEL_COLORS).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 80px', gap:'12px', marginBottom:'14px' }}>
              <label>
                <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>Aktion</div>
                <select value={editing.action} onChange={e => setEditing({ ...editing, action: e.target.value })}
                  style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 10px', color:C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }}>
                  {Object.entries(ACTION_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </label>
              <label>
                <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>Priorität</div>
                <input type="number" min="1" max="10" value={editing.priority} onChange={e => setEditing({ ...editing, priority: Number(e.target.value) })}
                  style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 10px', color:C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
              </label>
            </div>

            <label style={{ display:'block', marginBottom:'14px' }}>
              <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>Schlüsselwörter (kommagetrennt)</div>
              <input value={editing.keywords.join(', ')} onChange={e => setEditing({ ...editing, keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color:C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
              <div style={{ fontSize:'11px', color:C.t3, marginTop:'4px' }}>Auslöse-Phrasen die diese Regel aktivieren</div>
            </label>

            <label style={{ display:'block', marginBottom:'20px' }}>
              <div style={{ fontSize:'12px', color:C.t3, marginBottom:'5px' }}>Antwort-Template</div>
              <textarea value={editing.response_template} onChange={e => setEditing({ ...editing, response_template: e.target.value })}
                placeholder="Nachricht die Nika sendet wenn diese Regel ausgelöst wird..."
                rows={6}
                style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color:C.t1, fontSize:'13px', outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }} />
              <div style={{ fontSize:'11px', color:C.t3, marginTop:'4px' }}>
                Platzhalter: {'{{payment_link}}'} · {'{{exclusive_code}}'} · {'{{wishperme_link}}'}
              </div>
            </label>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setEditing(null)} style={{ flex:1, padding:'11px', borderRadius:'12px', background:C.s3, border:'none', color:C.t2, fontSize:'14px', cursor:'pointer' }}>
                Abbrechen
              </button>
              <button onClick={saveEdit} disabled={saving} style={{ flex:2, padding:'11px', borderRadius:'12px', background:C.blue, border:'none', color:'#fff', fontSize:'14px', fontWeight:600, cursor:'pointer', opacity:saving?0.6:1 }}>
                {saving ? 'Speichern...' : 'Regel speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

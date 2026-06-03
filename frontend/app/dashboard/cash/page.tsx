'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DollarSign, Plus, Trash2, Send, RefreshCw, Zap } from 'lucide-react';

const getApi = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

type TestStatus = 'idle' | 'sending' | 'success' | 'error';

export default function CashAlarmPage() {
  const { withCreator } = useCreator();
  const api = getApi();

  const [users,       setUsers]       = useState<string[]>([]);
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [testStatus,  setTestStatus]  = useState<TestStatus>('idle');
  const [testResult,  setTestResult]  = useState('');
  const [testAmount,  setTestAmount]  = useState('29');
  const [testPackage, setTestPackage] = useState('Hot Bundle');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(withCreator(`${api}/config/cash_notify_users`));
      const data = await res.json();
      if (Array.isArray(data?.value) && data.value.length > 0) setUsers(data.value);
    } catch {}
    finally { setLoading(false); }
  }, [api, withCreator]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const addUser = () => {
    const u = input.trim().replace(/^@/, '');
    if (u && !users.includes(u)) setUsers(prev => [...prev, u]);
    setInput('');
  };

  const removeUser = (u: string) => setUsers(prev => prev.filter(x => x !== u));

  const saveUsers = async () => {
    setSaving(true);
    try {
      await fetch(withCreator(`${api}/config/cash_notify_users`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(users),
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const triggerTest = async () => {
    if (users.length === 0) {
      setTestStatus('error');
      setTestResult('No users configured — add at least one username first.');
      setTimeout(() => setTestStatus('idle'), 4000);
      return;
    }
    setTestStatus('sending');
    setTestResult('');
    try {
      const res = await fetch(withCreator(`${api}/telegram/test-cash-alarm`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: testAmount, package_name: testPackage }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestStatus('success');
        setTestResult(
          data.sent_to
            ? `✓ Sent to ${data.sent_to} user${data.sent_to > 1 ? 's' : ''}${data.failed ? ` (${data.failed} failed)` : ''}`
            : '✓ Cash Alarm triggered!'
        );
      } else {
        setTestStatus('error');
        setTestResult(data.detail || data.error || 'Backend returned an error.');
      }
    } catch (e: any) {
      setTestStatus('error');
      setTestResult(`Could not reach backend: ${e.message}`);
    }
    setTimeout(() => { setTestStatus('idle'); setTestResult(''); }, 6000);
  };

  const inputCls = "w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors";

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center flex-shrink-0">
            <DollarSign size={24} className="text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cash Alarm</h1>
            <p className="text-sm text-muted-foreground mt-1">
              When a sale is confirmed, these Telegram users instantly receive <span className="font-mono text-yellow-400">💵💵💵 $ CASH CASH CASH $ 💵💵💵</span>
            </p>
          </div>
        </div>

        {/* How it works */}
        <Card className="border-yellow-400/15">
          <CardContent className="pt-4 pb-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">How it works</div>
            <div className="space-y-2">
              {[
                { step: '1', color: 'text-blue-400',   text: 'Lead confirms payment (screenshot or transaction number)' },
                { step: '2', color: 'text-purple-400', text: 'AI sets lead label to BUYER and triggers sale completion' },
                { step: '3', color: 'text-yellow-400', text: 'All users below receive the Cash Alarm message on Telegram' },
              ].map(({ step, color, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 border", color, `border-current/30 bg-current/10`)}>
                    {step}
                  </div>
                  <span className="text-sm text-muted-foreground">{text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Notify Users */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Notification Users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="py-6 text-center text-muted-foreground text-sm">Loading…</div>
            ) : (
              <>
                <div className="space-y-2 min-h-[40px]">
                  {users.length === 0 && (
                    <div className="py-6 text-center text-muted-foreground text-sm rounded-xl border border-dashed border-border">
                      No users configured yet — add a Telegram username below
                    </div>
                  )}
                  {users.map(u => (
                    <div key={u} className="flex items-center justify-between bg-muted rounded-xl px-4 py-3 group">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-yellow-400/15 flex items-center justify-center">
                          <DollarSign size={13} className="text-yellow-400" />
                        </div>
                        <span className="font-semibold text-sm">@{u}</span>
                      </div>
                      <button
                        onClick={() => removeUser(u)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-500/10 text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add user */}
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addUser()}
                    placeholder="@username or username"
                    className={cn(inputCls, "flex-1")}
                  />
                  <Button onClick={addUser} size="sm" className="px-4 bg-yellow-400 text-black hover:bg-yellow-300 font-bold">
                    <Plus size={15} className="mr-1" /> Add
                  </Button>
                </div>

                <Button
                  onClick={saveUsers}
                  disabled={saving}
                  className={cn("w-full py-4 font-semibold transition-colors", saved ? "bg-green-500 hover:bg-green-500" : "")}
                >
                  {saved ? '✓ Users Saved' : saving ? 'Saving…' : '💾 Save Notify List'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Test / Simulate Sale */}
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-primary" />
              <CardTitle className="text-sm font-semibold">Simulate a Sale</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="px-3 py-2.5 rounded-xl bg-primary/8 border border-primary/15 text-xs text-primary leading-relaxed">
              This sends a real Cash Alarm message to all configured users via Telegram — use it to verify the workflow is connected and working.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">Sale Amount (€)</div>
                <input
                  type="number"
                  value={testAmount}
                  onChange={e => setTestAmount(e.target.value)}
                  className={inputCls}
                  placeholder="29"
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">Package Name</div>
                <input
                  type="text"
                  value={testPackage}
                  onChange={e => setTestPackage(e.target.value)}
                  className={inputCls}
                  placeholder="Hot Bundle"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/50 border border-border">
              <div className="text-xs text-muted-foreground mb-1">Preview message that will be sent:</div>
              <div className="font-mono text-sm text-yellow-400 leading-relaxed">
                💵💵💵 $ CASH CASH CASH $ 💵💵💵
                {testAmount || testPackage ? (
                  <div className="text-foreground/80 mt-1 text-xs">
                    {testPackage && <>Package: <strong>{testPackage}</strong></>}
                    {testAmount && testPackage && ' · '}
                    {testAmount && <>Amount: <strong>€{testAmount}</strong></>}
                  </div>
                ) : null}
              </div>
            </div>

            <Button
              onClick={triggerTest}
              disabled={testStatus === 'sending'}
              className={cn(
                "w-full py-4 font-semibold transition-colors gap-2",
                testStatus === 'success' ? "bg-green-500 hover:bg-green-500" :
                testStatus === 'error'   ? "bg-red-500 hover:bg-red-500" :
                "bg-yellow-400 text-black hover:bg-yellow-300"
              )}
            >
              {testStatus === 'sending' ? (
                <><RefreshCw size={15} className="animate-spin" /> Sending…</>
              ) : testStatus === 'success' ? (
                <>✓ Sent!</>
              ) : testStatus === 'error' ? (
                <>✗ Failed</>
              ) : (
                <><Send size={15} /> Fire Test Cash Alarm</>
              )}
            </Button>

            {testResult && (
              <div className={cn(
                "px-3 py-2.5 rounded-xl text-sm border",
                testStatus === 'success' || testResult.startsWith('✓')
                  ? "bg-green-500/10 border-green-500/25 text-green-400"
                  : "bg-red-500/10 border-red-500/25 text-red-400"
              )}>
                {testResult}
              </div>
            )}

            {users.length === 0 && (
              <div className="text-xs text-muted-foreground text-center">
                ⚠️ Add at least one user above and save before testing
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}

'use client';

import React from 'react';
import { useMessages, useWebSocket, usePagination } from '@/hooks';
import { MessageSquare, RefreshCw, Search, Loader2 } from 'lucide-react';

export default function Inbox() {
  const { messages, loading, error, refetch } = useMessages({ limit: 50 });
  const { nextPage, prevPage, currentPage } = usePagination(1, 50);
  const { connected } = useWebSocket('global');
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredMessages = React.useMemo(() => {
    if (!searchQuery) return messages;
    return messages.filter((msg: any) =>
      msg.text?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [messages, searchQuery]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Inbox</h1>
            <p className="text-slate-400 text-sm mt-1">
              {messages.length} total messages
              {connected && <span className="ml-2 inline-block w-2 h-2 bg-green-500 rounded-full" />}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-950/30 border border-red-900 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {loading && !messages.length && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-blue-400" size={32} />
        </div>
      )}

      {filteredMessages.length > 0 ? (
        <>
          <div className="space-y-3">
            {filteredMessages.map((msg: any) => (
              <div key={msg.id} className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    msg.direction === 'incoming' ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'
                  }`}>
                    {msg.direction} {msg.is_ai_generated ? '• AI' : ''}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-slate-200 text-sm">{msg.text || '[media]'}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-6">
            <button onClick={prevPage} disabled={currentPage === 1}
              className="px-3 py-2 text-sm border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-40">
              Previous
            </button>
            <span className="text-sm text-slate-400">Page {currentPage}</span>
            <button onClick={nextPage}
              className="px-3 py-2 text-sm border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800">
              Next
            </button>
          </div>
        </>
      ) : (
        !loading && (
          <div className="text-center py-12">
            <MessageSquare size={48} className="mx-auto text-slate-700 mb-4" />
            <p className="text-slate-400">No messages yet</p>
          </div>
        )
      )}
    </div>
  );
}

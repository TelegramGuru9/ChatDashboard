import React from 'react';

interface BadgeProps { variant?: 'default' | 'destructive'; children: React.ReactNode; className?: string; }

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  const variants: Record<string, string> = {
    default: 'bg-blue-900 text-blue-300',
    destructive: 'bg-red-900 text-red-300',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>{children}</span>;
}

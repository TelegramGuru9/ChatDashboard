import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline' | 'destructive';
  size?: 'default' | 'sm' | 'lg';
}

export function Button({ variant = 'default', size = 'default', className = '', ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none gap-2';
  const variants: Record<string, string> = {
    default: 'bg-blue-600 text-white hover:bg-blue-700',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-300',
    outline: 'border border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800',
    destructive: 'bg-red-600 text-white hover:bg-red-700',
  };
  const sizes: Record<string, string> = {
    default: 'h-10 px-4 py-2 text-sm',
    sm: 'h-8 px-3 text-xs',
    lg: 'h-12 px-6 text-base',
  };
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export default function EmptyState({icon: Icon, title, children, compact = false}: {icon: LucideIcon; title: string; children: ReactNode; compact?: boolean}) {
  return <div className={`empty-state ${compact ? 'empty-state-compact' : ''}`}><span className="empty-icon"><Icon size={compact ? 23 : 30} strokeWidth={1.5} /></span><h3>{title}</h3><div>{children}</div></div>;
}

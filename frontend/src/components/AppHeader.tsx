import { Building2, ArrowUpRight } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import SessionControls from './SessionControls';

export default function AppHeader({operations = false}: {operations?: boolean}) {
  return <>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <header className="app-header">
      <div className="header-inner">
        <NavLink to="/" className="brand" aria-label="CivicOps AI home">
          <span className="brand-symbol"><Building2 size={24} strokeWidth={1.7} /></span>
          <span><strong>CivicOps <span className="brand-ai">AI</span></strong><small>{operations ? 'Operations workspace' : 'Community reporting'}</small></span>
        </NavLink>
        <nav aria-label="Main navigation" className="main-nav">
          <NavLink to="/" end>Report issue</NavLink>
          <NavLink to="/track">Track report <ArrowUpRight size={13} /></NavLink>
        </nav>
        <SessionControls />
      </div>
    </header>
  </>;
}

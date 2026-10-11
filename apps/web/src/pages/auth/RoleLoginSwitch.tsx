import { useState } from 'react';
import RoleLogin, { type PortalRole } from './RoleLogin';
import RoleLoginSplit from './RoleLoginSplit';
import { getLoginLayout, setLoginLayout, type LoginLayout } from './loginLayout';

/**
 * Renders the user's chosen login layout (card vs split) and a small floating
 * toggle (bottom-right) to switch it. The choice is persisted until changed.
 */
export default function RoleLoginSwitch({ role, demo = false }: { role: PortalRole; demo?: boolean }) {
  const [layout, setLayout] = useState<LoginLayout>(getLoginLayout());
  const isSplit = layout === 'split';
  const toggle = () => {
    const next: LoginLayout = isSplit ? 'card' : 'split';
    setLoginLayout(next);
    setLayout(next);
  };

  return (
    <>
      {isSplit ? <RoleLoginSplit role={role} demo={demo} /> : <RoleLogin role={role} demo={demo} />}

      {/* Layout toggle — bottom right */}
      <div className="fixed z-[60] bottom-4 right-4 flex items-center gap-2.5 rounded-full pl-3.5 pr-2 py-1.5 bg-white/95 backdrop-blur border border-gray-200 shadow-lg">
        <span className="text-[12px] font-semibold text-gray-600 select-none">Split view</span>
        <button
          role="switch" aria-checked={isSplit} aria-label="Toggle split layout" onClick={toggle}
          className="relative w-[42px] h-[24px] rounded-full transition-colors"
          style={{ background: isSplit ? '#0d9488' : '#cbd5e1' }}
        >
          <span
            className="absolute top-[2px] left-[2px] w-[20px] h-[20px] rounded-full bg-white shadow transition-transform"
            style={{ transform: isSplit ? 'translateX(18px)' : 'translateX(0)' }}
          />
        </button>
      </div>
    </>
  );
}

"use client";

import { useId, useRef, type ReactNode } from "react";

export type HomeTab = "recibir" | "enviar" | "gastar";

const TABS: { id: HomeTab; label: string }[] = [
  { id: "recibir", label: "Recibir" },
  { id: "enviar", label: "Enviar" },
  { id: "gastar", label: "Gastar" },
];

export function homeTabPanelId(tab: HomeTab, baseId: string) {
  return `${baseId}-panel-${tab}`;
}

export function homeTabId(tab: HomeTab, baseId: string) {
  return `${baseId}-tab-${tab}`;
}

export function HomeTabs({
  active,
  onChange,
  id: idProp,
}: {
  active: HomeTab;
  onChange: (tab: HomeTab) => void;
  id?: string;
}) {
  const reactId = useId().replace(/:/g, "");
  const baseId = idProp ?? `home-tabs-${reactId}`;
  const listRef = useRef<HTMLDivElement>(null);

  const selectIndex = (index: number) => {
    const next = TABS[(index + TABS.length) % TABS.length];
    onChange(next.id);
    window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`#${homeTabId(next.id, baseId)}`)
        ?.focus();
    });
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Acciones"
      className="grid grid-cols-3 gap-1 rounded-[8px] border border-[#DDE4DC] bg-white p-1"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          selectIndex(TABS.findIndex((tab) => tab.id === active) + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          selectIndex(TABS.findIndex((tab) => tab.id === active) - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          selectIndex(0);
        } else if (event.key === "End") {
          event.preventDefault();
          selectIndex(TABS.length - 1);
        }
      }}
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={homeTabId(tab.id, baseId)}
            aria-selected={selected}
            aria-controls={homeTabPanelId(tab.id, baseId)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={
              selected
                ? "h-10 min-h-10 rounded-[6px] bg-[#0E7C4F] text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E7C4F]"
                : "h-10 min-h-10 rounded-[6px] text-sm font-semibold text-[#66736B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E7C4F]"
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function HomeTabPanel({
  tab,
  active,
  baseId,
  children,
}: {
  tab: HomeTab;
  active: HomeTab;
  baseId: string;
  children: ReactNode;
}) {
  const selected = tab === active;
  return (
    <div
      role="tabpanel"
      id={homeTabPanelId(tab, baseId)}
      aria-labelledby={homeTabId(tab, baseId)}
      hidden={!selected}
    >
      {selected ? children : null}
    </div>
  );
}

"use client";

export type HomeTab = "obtener" | "enviar" | "gastar";

const TABS: { id: HomeTab; label: string }[] = [
  { id: "obtener", label: "Obtener" },
  { id: "enviar", label: "Enviar" },
  { id: "gastar", label: "Gastar" },
];

export function HomeTabs({
  active,
  onChange,
}: {
  active: HomeTab;
  onChange: (tab: HomeTab) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-[8px] border border-[#DDE4DC] bg-white p-1">
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={
              selected
                ? "h-10 rounded-[6px] bg-[#0E7C4F] text-sm font-semibold text-white"
                : "h-10 rounded-[6px] text-sm font-semibold text-[#66736B]"
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

import { Icon, type IconName } from "./Icon.js";

/**
 * `.navbar` from the design source — four tabs, always in this order, shown
 * on Today / Progress / Program / Sharing and hidden for the whole
 * exercise flow (intro → camera setup → live → rest → summary), where a way
 * out of a running session would compete with the session itself.
 *
 * The design's mock also carries a fake iOS status bar ("9:41 · 5G ▮▮▮").
 * That is an artboard convention for showing a phone screen, not product
 * chrome — a web page drawing a counterfeit OS status bar would be lying
 * about the time and the signal, so it is deliberately not reproduced.
 */

export type NavTab = "today" | "progress" | "program" | "sharing";

const TABS: Array<{ id: NavTab; label: string; icon: IconName }> = [
  { id: "today", label: "Today", icon: "home" },
  { id: "progress", label: "Progress", icon: "chart" },
  { id: "program", label: "Program", icon: "list" },
  { id: "sharing", label: "Sharing", icon: "lock" }
];

export function BottomNav({
  active,
  onNavigate
}: {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
}) {
  return (
    <nav
      className="sticky bottom-0 flex shadow-[inset_0_1px_0_#D6DEDF] bg-surf pb-20 pt-8"
      aria-label="Main"
    >
      {TABS.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onNavigate(tab.id)}
            aria-current={on ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-4 text-lb normal-case tracking-normal ${
              on ? "text-teal" : "text-ink-3"
            }`}
          >
            <Icon name={tab.icon} className="h-20 w-20" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

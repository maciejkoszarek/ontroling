import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  UserMinus,
  Briefcase,
  Target,
  Activity,
  Network,
  TrendingUp,
  GitCompareArrows,
  Wallet,
  FlaskConical,
  ShieldCheck,
  FileText,
  Upload,
  Settings,
  Moon,
  Sun,
  Sparkles,
  Tag,
  UserCog,
} from "lucide-react";
import { useAppStore } from "../store";
import TopBar from "./TopBar";
import FilterBar from "./FilterBar";
import { cn, initials } from "../lib/utils";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; requireHrImport?: boolean };

const NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: "Overview",
    items: [
      { to: "/", label: "Cockpit", icon: LayoutDashboard },
      { to: "/trends", label: "Headcount & FTE trends", icon: TrendingUp },
      { to: "/fcfc", label: "FC vs FC", icon: GitCompareArrows },
      { to: "/fc-vs-budget", label: "FC vs Budget", icon: Wallet },
    ],
  },
  {
    section: "Practice detail",
    items: [
      { to: "/pu/CCA_TOTAL", label: "Production Units", icon: Network },
      { to: "/mu", label: "Market Units", icon: Target },
      { to: "/arve", label: "ARVE / Utilization", icon: Activity },
      { to: "/projects", label: "Projects", icon: Briefcase },
      { to: "/people", label: "People", icon: Users },
      { to: "/capabilities", label: "Capabilities", icon: Tag },
      { to: "/pipeline", label: "Pipeline", icon: Sparkles },
      { to: "/bench", label: "Bench & matching", icon: UserMinus },
    ],
  },
  {
    section: "People flow",
    items: [
      { to: "/people-flow", label: "Joiners / Leavers", icon: UserPlus },
    ],
  },
  {
    section: "Planning",
    items: [
      { to: "/scenarios", label: "Scenarios", icon: FlaskConical },
      { to: "/review-pack", label: "Review pack", icon: FileText },
    ],
  },
  {
    section: "Ops",
    items: [
      { to: "/dq", label: "Data quality", icon: ShieldCheck },
      { to: "/ingestion", label: "Ingestion", icon: Upload },
      { to: "/ingest/hr", label: "HR Import", icon: UserCog, requireHrImport: true },
      { to: "/admin", label: "Admin", icon: Settings },
    ],
  },
];

export default function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[260px_1fr]">
      <Sidebar mobileOpen={mobileOpen} />
      <div className="flex flex-col min-w-0">
        <TopBar onMenuClick={() => setMobileOpen((o) => !o)} />
        {!location.pathname.startsWith("/people") && <FilterBar />}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Sidebar({ mobileOpen }: { mobileOpen: boolean }) {
  const user = useAppStore((s) => s.user);
  const role = useAppStore((s) => s.role);
  const canImportHr = useAppStore((s) => s.canImportHr);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const visibleNav = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.requireHrImport || canImportHr(role)),
  }));

  return (
    <aside
      className={cn(
        "bg-bg-card border-r border-border flex flex-col",
        "hidden lg:flex",
        mobileOpen && "fixed inset-0 z-50 flex lg:relative lg:inset-auto",
      )}
    >
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-brand grid place-items-center text-brand-foreground">
          <TrendingUp className="w-4 h-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">CCA PracticeView</div>
          <div className="text-[11px] text-fg-muted -mt-0.5">Practice controlling</div>
        </div>
      </div>

      <nav className="flex-1 overflow-auto py-3 px-2">
        {visibleNav.map((group) => (
          <div key={group.section} className="mb-4">
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
              {group.section}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.to === "/"} className={({ isActive }) => cn("nav-link", isActive && "active")}>
                    <item.icon className="w-4 h-4" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-brand/15 grid place-items-center text-brand text-xs font-semibold">
          {initials(user.name)}
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="text-sm font-medium truncate">{user.name}</div>
          <div className="text-[11px] text-fg-muted capitalize">{role.replace("_", " ")}</div>
        </div>
        <button
          className="btn-ghost"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}

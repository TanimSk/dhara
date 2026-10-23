import { Link, NavLink, Outlet } from "react-router-dom";
import { ArrowLeft, Building2, Cpu, FileText, LayoutDashboard, Receipt, Tags } from "lucide-react";

import { Logo, cx } from "../../components/ui";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/customers", label: "Customers", icon: Building2 },
  { to: "/admin/invoices", label: "Invoices", icon: FileText },
  { to: "/admin/plans", label: "Plans", icon: Tags },
  { to: "/admin/costs", label: "Platform costs", icon: Receipt },
  { to: "/admin/encoder", label: "Encoder", icon: Cpu },
];

export default function AdminShell() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur-xl border-b border-line">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 h-16 flex items-center gap-6">
          <Link to="/admin" className="flex items-center gap-2.5 shrink-0">
            <Logo />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] rounded-full bg-ink text-white px-2 py-0.5">Admin</span>
          </Link>
          <nav className="flex-1 flex items-center gap-1 overflow-x-auto">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => cx("flex items-center gap-2 h-9 px-3 rounded-full text-[13.5px] font-medium whitespace-nowrap transition-colors", isActive ? "bg-surface border border-line shadow-soft text-ink" : "text-ink-2 hover:text-ink hover:bg-sunken border border-transparent")}>
                <Icon className="size-4" strokeWidth={1.8} />
                {label}
              </NavLink>
            ))}
          </nav>
          <Link to="/app" className="hidden md:flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink shrink-0"><ArrowLeft className="size-3.5" />Dashboard</Link>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-4 sm:px-8 py-10">
        <Outlet />
      </main>
    </div>
  );
}

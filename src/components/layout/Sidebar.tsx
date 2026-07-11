import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Building2, Radio, Fingerprint, LogOut } from "lucide-react";
import { toast } from "sonner";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Buildings", href: "/buildings", icon: Building2 },
  { label: "Beacons", href: "/beacons", icon: Radio },
  { label: "Fingerprinting", href: "/fingerprinting", icon: Fingerprint },
];

export function Sidebar() {
  const location = useLocation();

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname.startsWith(href);
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
            N
          </div>
          <span className="text-lg font-semibold tracking-tight">NaviMind</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto border-t p-4 space-y-4 bg-muted/10">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold border border-primary/20">
            RE
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate text-foreground leading-none">Rmeon Ehab</p>
            <p className="text-[10px] text-muted-foreground mt-1 capitalize leading-none font-mono">admin</p>
          </div>
        </div>

        <button
          onClick={() => {
            toast.success("Successfully signed out (Demo Mode)");
          }}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="size-4" />
          Sign Out
        </button>

        <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground flex items-center justify-between">
          <span>NaviMind Admin</span>
          <span>v1.0</span>
        </div>
      </div>
    </aside>
  );
}

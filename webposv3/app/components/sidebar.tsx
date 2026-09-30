"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { logUserActivity } from "@/lib/activityLogger";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  UserCog,
  ChartColumn,
  Receipt,
  Settings,
  LogOut,
  ListChecks,
  Menu,
  X,
} from "lucide-react";

interface SidebarProps {
  onNewSaleClick?: () => void;
}

export default function Sidebar({ onNewSaleClick }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<"admin" | "cashier" | "user" | null>(null);
  const [fullName, setFullName] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const isAdminRoute =
    pathname === "/admin" ||
    pathname.startsWith("/products") ||
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/cashiers") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/shifts");
  const effectiveRole = role ?? (isAdminRoute ? "admin" : null);

  useEffect(() => {
    const loadRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", user.id)
        .single();
      if (
        profile?.role === "admin" ||
        profile?.role === "cashier" ||
        profile?.role === "user"
      ) {
        setRole(profile.role);
      }
      if (profile?.full_name) {
        setFullName(profile.full_name);
      }
    };
    loadRole();
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  // Close drawer on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        mobileOpen &&
        drawerRef.current &&
        !drawerRef.current.contains(e.target as Node)
      ) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileOpen]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    await logUserActivity("logout");
    await supabase.auth.signOut();
    router.refresh();
    router.push("/auth/login");
  };

  const handleNewSaleClick = () => {
    setMobileOpen(false);
    if (onNewSaleClick) {
      onNewSaleClick();
      return;
    }
    router.push("/pos");
  };

  const navContent = (
    <>
      {/* Logo */}
      <Link href={effectiveRole === "admin" ? "/admin" : "/pos"}>
        <div className="px-2 mb-10 flex items-center justify-start">
          <svg
            viewBox="0 0 540 150"
            className="h-10 w-auto"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient
                id="sb-blueGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
              <linearGradient
                id="sb-greenGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
              <filter id="sb-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <g transform="translate(10, 5)">
              <path
                d="M20 30 C20 15, 35 0, 50 0 L110 0 C125 0, 140 15, 140 30 L140 120 C140 130, 130 140, 120 140 L40 140 C25 140, 20 125, 20 110 Z"
                fill="url(#sb-blueGrad)"
              />
              <path d="M32 15 H128 V65 H32 Z" fill="#1e293b" opacity="0.9" />
              <rect
                x="42"
                y="90"
                width="18"
                height="12"
                rx="3"
                fill="#ffffff"
                opacity="0.2"
              />
              <rect
                x="71"
                y="90"
                width="18"
                height="12"
                rx="3"
                fill="#ffffff"
                opacity="0.2"
              />
              <rect
                x="100"
                y="90"
                width="18"
                height="12"
                rx="3"
                fill="#ffffff"
                opacity="0.2"
              />
              <rect
                x="42"
                y="112"
                width="47"
                height="12"
                rx="3"
                fill="#ffffff"
                opacity="0.3"
              />
              <rect
                x="100"
                y="112"
                width="18"
                height="12"
                rx="3"
                fill="url(#sb-greenGrad)"
              />
              <path
                d="M10 95 L55 50 L90 75 L145 15"
                fill="none"
                stroke="url(#sb-greenGrad)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#sb-glow)"
              />
              <circle cx="55" cy="50" r="7" fill="#ffffff" />
              <circle cx="90" cy="75" r="7" fill="#ffffff" />
              <circle
                cx="145"
                cy="15"
                r="9"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="4"
              />
            </g>
            <text
              x="185"
              y="105"
              fontFamily="system-ui, sans-serif"
              fontWeight="800"
              fontSize="100"
              fill="currentColor"
              letterSpacing="-3"
            >
              pos
            </text>
            <text
              x="340"
              y="105"
              fontFamily="system-ui, sans-serif"
              fontWeight="900"
              fontSize="110"
              fill="url(#sb-greenGrad)"
              letterSpacing="-1"
            >
              v3
            </text>
            <line
              x1="190"
              y1="130"
              x2="490"
              y2="130"
              stroke="currentColor"
              opacity="0.22"
              strokeWidth="3"
            />
          </svg>
        </div>
      </Link>

      {/* Main Nav */}
      <nav className="space-y-1 flex-1">
        <SidebarItem
          href={effectiveRole === "admin" ? "/admin" : "/pos"}
          icon={<LayoutDashboard size={20} />}
          label="Dashboard"
          active={pathname === "/pos" || pathname === "/admin"}
        />
        <button
          onClick={handleNewSaleClick}
          className="flex items-center gap-3 p-3 w-full rounded-xl text-slate-600 hover:bg-slate-50 transition-all font-medium"
        >
          <ShoppingCart size={20} />
          <span className="text-[15px]">New Sale</span>
        </button>
        <SidebarItem
          href="/customers"
          icon={<Users size={20} />}
          label="Customers"
          active={pathname === "/customers"}
        />
        <SidebarItem
          href="/expenses"
          icon={<Receipt size={20} />}
          label="Expenses"
          active={pathname === "/expenses"}
        />
        {effectiveRole === "admin" && (
          <>
            <SidebarItem
              href="/products"
              icon={<Package size={20} />}
              label="Products"
              active={pathname === "/products"}
            />
            <SidebarItem
              href="/inventory"
              icon={<Package size={20} />}
              label="Inventory"
              active={pathname === "/inventory"}
            />
            <SidebarItem
              href="/cashiers"
              icon={<UserCog size={20} />}
              label="Users"
              active={pathname === "/cashiers"}
            />
            <SidebarItem
              href="/reports"
              icon={<ChartColumn size={20} />}
              label="Reports"
              active={pathname === "/reports"}
            />
            <SidebarItem
              href="/shifts"
              icon={<ListChecks size={20} />}
              label="Shifts"
              active={pathname === "/shifts"}
            />
          </>
        )}
      </nav>

      {/* Bottom Nav */}
      <div className="pt-6 border-t border-slate-100 space-y-2">
        <ThemeToggle />
        {effectiveRole === "admin" && (
          <SidebarItem
            href="/settings"
            icon={<Settings size={20} />}
            label="Settings"
            active={pathname === "/settings"}
          />
        )}

        {/* Profile card — hover (desktop) or tap (mobile) to reveal logout */}
        <div className="group relative mt-2">
          {/* Logout button — hidden by default, slides up on group hover or profileOpen */}
          <button
            onClick={handleLogout}
            className={`
              absolute bottom-full left-0 right-0 mb-1
              flex items-center gap-3 p-3 rounded-xl
              text-rose-500 bg-white border border-rose-100
              font-medium shadow-sm
              transition-all duration-200 ease-out
              ${
                profileOpen
                  ? "opacity-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 -translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto"
              }
            `}
          >
            <LogOut size={18} />
            <span className="text-[15px]">Logout</span>
          </button>

          {/* Profile row — hover target + tap toggle for mobile */}
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors text-left"
          >
            <div
              className={`w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shrink-0 ring-2 transition-all ${profileOpen ? "ring-blue-200" : "ring-transparent group-hover:ring-blue-200"}`}
            >
              {fullName ? fullName.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {fullName || "User"}
              </p>
              <p className="text-xs text-slate-500 capitalize">
                {role || "User"}
              </p>
            </div>
            {/* Subtle logout hint icon */}
            <LogOut
              size={15}
              className={`shrink-0 transition-colors ${profileOpen ? "text-rose-400" : "text-slate-300 group-hover:text-rose-400"}`}
            />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl hover:bg-slate-100 transition"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <svg
          viewBox="0 0 540 150"
          className="h-8 w-auto"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              id="topbar-blue"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
            <linearGradient id="topbar-green" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
          </defs>
          <g transform="translate(10,5)">
            <path
              d="M20 30 C20 15,35 0,50 0 L110 0 C125 0,140 15,140 30 L140 120 C140 130,130 140,120 140 L40 140 C25 140,20 125,20 110 Z"
              fill="url(#topbar-blue)"
            />
            <path d="M32 15 H128 V65 H32 Z" fill="#1e293b" opacity="0.9" />
            <rect
              x="100"
              y="112"
              width="18"
              height="12"
              rx="3"
              fill="url(#topbar-green)"
            />
            <path
              d="M10 95 L55 50 L90 75 L145 15"
              fill="none"
              stroke="url(#topbar-green)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <text
            x="185"
            y="105"
            fontFamily="system-ui,sans-serif"
            fontWeight="800"
            fontSize="100"
            fill="currentColor"
            letterSpacing="-3"
          >
            pos
          </text>
          <text
            x="340"
            y="105"
            fontFamily="system-ui,sans-serif"
            fontWeight="900"
            fontSize="110"
            fill="url(#topbar-green)"
            letterSpacing="-1"
          >
            v3
          </text>
        </svg>
        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
          {fullName ? fullName.charAt(0).toUpperCase() : "U"}
        </div>
      </div>

      {/* ── Mobile overlay backdrop ────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          aria-hidden="true"
        />
      )}

      {/* ── Mobile slide-in drawer ─────────────────────────────────────── */}
      <div
        ref={drawerRef}
        className={`md:hidden fixed top-0 left-0 z-50 h-full w-72 bg-white border-r border-slate-200 flex flex-col p-6 transition-transform duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-slate-100 transition"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
        {navContent}
      </div>

      {/* ── Desktop static sidebar ─────────────────────────────────────── */}
      <aside className="hidden md:flex w-72 bg-white border-r border-slate-200 p-6 flex-col h-screen sticky top-0 shrink-0">
        {navContent}
      </aside>
    </>
  );
}

function SidebarItem({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${
        active ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
      <span className="text-[15px]">{label}</span>
    </Link>
  );
}

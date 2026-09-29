"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  Loader2,
  Package,
  Receipt,
  Shield,
  ShoppingCart,
  Users,
} from "lucide-react";
import Sidebar from "../components/sidebar";
import { supabase } from "@/lib/supabaseClient";

interface DashboardCounts {
  products: number;
  inventoryRows: number;
  lowStock: number;
  staff: number;
  salesToday: number;
  revenueToday: number;
}

const EMPTY_COUNTS: DashboardCounts = {
  products: 0,
  inventoryRows: 0,
  lowStock: 0,
  staff: 0,
  salesToday: 0,
  revenueToday: 0,
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<DashboardCounts>(EMPTY_COUNTS);
  const [salesSummaryMessage, setSalesSummaryMessage] = useState("");

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "admin") {
        router.push("/pos");
        return;
      }

      setCheckingAuth(false);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [
        { count: productsCount },
        { count: inventoryCount },
        { count: lowStockCount },
        { count: staffCount },
        { data: salesTodayRows, error: salesTodayError },
      ] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("inventory").select("id", { count: "exact", head: true }),
        supabase
          .from("inventory")
          .select("id", { count: "exact", head: true })
          .lt("stock", 10),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("sales")
          .select("id, total")
          .eq("status", "completed")
          .gte("created_at", startOfDay.toISOString()),
      ]);

      const salesToday = salesTodayError
        ? []
        : ((salesTodayRows as { id: string; total: number }[] | null) ?? []);

      if (salesTodayError) {
        console.error(
          "Failed to load today's sales summary:",
          salesTodayError.message,
        );
        setSalesSummaryMessage("Unable to load today's sales summary.");
      } else if (salesToday.length === 0) {
        setSalesSummaryMessage("No sales today yet.");
      } else {
        setSalesSummaryMessage("");
      }

      setCounts({
        products: productsCount ?? 0,
        inventoryRows: inventoryCount ?? 0,
        lowStock: lowStockCount ?? 0,
        staff: staffCount ?? 0,
        salesToday: salesToday.length,
        revenueToday: salesToday.reduce(
          (sum, row) => sum + Number(row.total ?? 0),
          0,
        ),
      });
      setLoading(false);
    };

    init();
  }, [router]);

  const revenueTodayLabel = useMemo(
    () =>
      `₱${counts.revenueToday.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    [counts.revenueToday],
  );

  if (checkingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 pt-20 md:pt-10 md:p-10">
        <header className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-600 p-2.5 sm:p-3 text-white shrink-0">
              <Shield size={18} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Admin Dashboard</h1>
              <p className="mt-0.5 text-sm text-slate-500 hidden sm:block">
                Manage products, inventory, users, and daily store performance.
              </p>
            </div>
          </div>
        </header>

        <section className="mb-6 sm:mb-8 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          <StatTile label="Products" value={counts.products.toString()} icon={<Package size={18} />} />
          <StatTile label="Inventory Rows" value={counts.inventoryRows.toString()} icon={<Boxes size={18} />} />
          <StatTile label="Low Stock Alerts" value={counts.lowStock.toString()} icon={<Receipt size={18} />} alert={counts.lowStock > 0} />
          <StatTile label="Staff Accounts" value={counts.staff.toString()} icon={<Users size={18} />} />
          <StatTile label="Today's Sales" value={counts.salesToday.toString()} icon={<ShoppingCart size={18} />} />
          <StatTile label="Today's Revenue" value={revenueTodayLabel} icon={<BarChart3 size={18} />} />
        </section>

        {salesSummaryMessage && !loading && (
          <section className="mb-8 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              {salesSummaryMessage}
            </p>
          </section>
        )}

        <section className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <QuickLinkCard
            href="/products"
            title="Products"
            description="Edit product names, prices, costs, and barcodes."
          />
          <QuickLinkCard
            href="/inventory"
            title="Inventory"
            description="Receive deliveries, monitor stock, and review item movement."
          />
          <QuickLinkCard
            href="/cashiers"
            title="Users"
            description="Approve cashiers and manage user branch assignment."
          />
          <QuickLinkCard
            href="/reports"
            title="Reports"
            description="Review revenue, top-selling items, and profit metrics."
          />
        </section>

        {loading && (
          <div className="mt-8 rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
          </div>
        )}
      </main>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  alert = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`text-2xl font-bold ${alert ? "text-rose-600" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function QuickLinkCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md"
    >
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </Link>
  );
}

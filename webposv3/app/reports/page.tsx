"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  LayoutGrid,
  Loader2,
  ReceiptText,
  TrendingDown,
  Wallet,
} from "lucide-react";
import Sidebar from "../components/sidebar";
import { supabase } from "@/lib/supabaseClient";

interface SaleRow {
  id: string;
  total: number;
  status: "saved" | "completed" | "void";
  created_at: string;
}

interface SaleItemRow {
  sale_id: string;
  product_id: string | null;
  price?: number | null;
  quantity: number;
  unit_cost: number | null;
  products:
    | { cost: number; name?: string | null }
    | { cost: number; name?: string | null }[]
    | null;
}

interface ExpenseRow {
  id: string;
  amount: number;
  category: string;
  description: string;
  expense_date: string;
  created_at: string;
}

interface ProfitMetric {
  label: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  transactions: number;
}

interface TopSellingItem {
  productId: string;
  name: string;
  quantitySold: number;
  salesAmount: number;
}

interface RecentReportTransaction {
  id: string;
  receiptNo: string;
  createdAt: string;
  total: number;
  unitCostTotal: number;
  profit: number;
}

export default function ReportsPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<ProfitMetric[]>([]);
  const [topSellingItems, setTopSellingItems] = useState<TopSellingItem[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<
    RecentReportTransaction[]
  >([]);
  const [recentExpenses, setRecentExpenses] = useState<ExpenseRow[]>([]);
  const [viewMode, setViewMode] = useState<"cards" | "graph">("cards");

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
    };

    init();
  }, [router]);

  useEffect(() => {
    if (checkingAuth) return;

    const loadReport = async () => {
      setLoading(true);

      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const startOfWeek = new Date(startOfDay);
      const day = startOfWeek.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      startOfWeek.setDate(startOfWeek.getDate() + diff);

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      const [salesResult, expensesResult] = await Promise.all([
        supabase
          .from("sales")
          .select("id, total, status, created_at")
          .eq("status", "completed")
          .gte("created_at", startOfYear.toISOString()),
        supabase
          .from("expenses")
          .select("id, amount, category, description, expense_date, created_at")
          .gte("expense_date", startOfYear.toISOString().slice(0, 10))
          .order("expense_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      const { data: salesData, error: salesError } = salesResult;
      if (salesError) {
        console.error("Failed to load report sales:", salesError.message);
        setLoading(false);
        return;
      }

      const { data: expensesData, error: expensesError } = expensesResult;
      if (expensesError && expensesError.code !== "42P01") {
        console.error("Failed to load report expenses:", expensesError.message);
        setLoading(false);
        return;
      }

      const sales = (salesData as SaleRow[]) ?? [];
      const expenses =
        expensesError?.code === "42P01" ? [] : ((expensesData as ExpenseRow[]) ?? []);
      const saleIds = sales.map((sale) => sale.id);

      let cogsBySale = new Map<string, number>();

      if (saleIds.length > 0) {
        const { data: saleItemsData, error: saleItemsError } = await supabase
          .from("sale_items")
          .select("sale_id, product_id, quantity, price, unit_cost, products(cost, name)")
          .in("sale_id", saleIds);

        if (saleItemsError) {
          console.error("Failed to load report sale items:", saleItemsError.message);
          setLoading(false);
          return;
        }

        const saleItems = (saleItemsData as SaleItemRow[]) ?? [];
        cogsBySale = saleItems.reduce((acc, item) => {
          const fallbackCost = Array.isArray(item.products)
            ? (item.products[0]?.cost ?? 0)
            : (item.products?.cost ?? 0);
          const unitCost = Number(item.unit_cost ?? fallbackCost ?? 0);
          const lineCogs = Number(item.quantity) * unitCost;
          const current = acc.get(item.sale_id) ?? 0;
          acc.set(item.sale_id, current + lineCogs);
          return acc;
        }, new Map<string, number>());

        const productSales = saleItems.reduce((acc, item) => {
          if (!item.product_id) return acc;
          const resolvedProduct = Array.isArray(item.products)
            ? item.products[0]
            : item.products;
          const name = resolvedProduct?.name?.trim() || "Unknown item";
          const quantitySold = Number(item.quantity || 0);
          const salesAmount = Number(item.price || 0) * quantitySold;
          const existing = acc.get(item.product_id);

          if (existing) {
            existing.quantitySold += quantitySold;
            existing.salesAmount += salesAmount;
            return acc;
          }

          acc.set(item.product_id, {
            productId: item.product_id,
            name,
            quantitySold,
            salesAmount,
          });
          return acc;
        }, new Map<string, TopSellingItem>());

        setTopSellingItems(
          Array.from(productSales.values())
            .sort((a, b) =>
              b.quantitySold === a.quantitySold
                ? b.salesAmount - a.salesAmount
                : b.quantitySold - a.quantitySold,
            )
            .slice(0, 5),
        );
      } else {
        setTopSellingItems([]);
      }

      const latest = [...sales]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 8)
        .map((sale) => {
          const unitCostTotal = cogsBySale.get(sale.id) ?? 0;
          return {
            id: sale.id,
            receiptNo: sale.id.slice(0, 8),
            createdAt: sale.created_at,
            total: Number(sale.total || 0),
            unitCostTotal,
            profit: Number(sale.total || 0) - unitCostTotal,
          };
        });
      setRecentTransactions(latest);
      setRecentExpenses(expenses.slice(0, 5));

      const computeMetric = (label: string, from: Date): ProfitMetric => {
        const scoped = sales.filter((sale) => new Date(sale.created_at) >= from);
        const revenue = scoped.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
        const cogs = scoped.reduce((sum, sale) => sum + (cogsBySale.get(sale.id) ?? 0), 0);
        const grossProfit = revenue - cogs;
        const scopedExpenses = expenses
          .filter((expense) => new Date(`${expense.expense_date}T00:00:00`) >= from)
          .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
        return {
          label,
          revenue,
          cogs,
          grossProfit,
          expenses: scopedExpenses,
          netProfit: grossProfit - scopedExpenses,
          transactions: scoped.length,
        };
      };

      setMetrics([
        computeMetric("Daily", startOfDay),
        computeMetric("Weekly", startOfWeek),
        computeMetric("Monthly", startOfMonth),
        computeMetric("Yearly", startOfYear),
      ]);
      setLoading(false);
    };

    loadReport();
  }, [checkingAuth]);

  const currency = useMemo(
    () =>
      new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }),
    [],
  );

  const highestRevenue = useMemo(
    () =>
      Math.max(
        ...metrics.flatMap((metric) => [
          metric.revenue,
          metric.cogs,
          metric.expenses,
          Math.abs(metric.netProfit),
        ]),
        1,
      ),
    [metrics],
  );

  const summaryMetric = useMemo(
    () => metrics.find((metric) => metric.label === "Yearly") ?? metrics[0] ?? null,
    [metrics],
  );

  const totalRevenue = useMemo(
    () => summaryMetric?.revenue ?? 0,
    [summaryMetric],
  );

  const totalCogs = useMemo(
    () => summaryMetric?.cogs ?? 0,
    [summaryMetric],
  );

  const totalExpenses = useMemo(
    () => summaryMetric?.expenses ?? 0,
    [summaryMetric],
  );

  const totalGrossProfit = useMemo(
    () => summaryMetric?.grossProfit ?? 0,
    [summaryMetric],
  );

  const totalProfit = useMemo(
    () => summaryMetric?.netProfit ?? 0,
    [summaryMetric],
  );

  if (checkingAuth) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 pt-20 md:pt-10 md:p-10">
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Profit Reports</h1>
            <p className="text-sm text-slate-500 mt-1 hidden sm:block">
              Revenue, cost, expenses, and operating profit in one year-to-date view.
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-1 inline-flex self-start sm:self-auto">
            <button
              onClick={() => setViewMode("cards")}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 ${
                viewMode === "cards" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <LayoutGrid size={14} />
              Cards
            </button>
            <button
              onClick={() => setViewMode("graph")}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 ${
                viewMode === "graph" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <BarChart3 size={14} />
              Graph
            </button>
          </div>
        </header>

        {loading ? (
          <div className="bg-white border border-slate-100 rounded-3xl p-10 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Total Revenue
                </p>
                <p className="text-2xl font-bold mt-2 text-slate-900">
                  {currency.format(totalRevenue)}
                </p>
              </div>
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Total Cost of Goods
                </p>
                <p className="text-2xl font-bold mt-2 text-slate-900">
                  {currency.format(totalCogs)}
                </p>
              </div>
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Operating Expenses
                </p>
                <p className="text-2xl font-bold mt-2 text-rose-600">
                  {currency.format(totalExpenses)}
                </p>
              </div>
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Net Profit
                </p>
                <p
                  className={`text-2xl font-bold mt-2 ${
                    totalProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {currency.format(totalProfit)}
                </p>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 xl:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold">Financial Summary</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Gross profit minus operating expenses gives net profit.
                    </p>
                  </div>
                  <ReceiptText className="h-5 w-5 text-slate-400" />
                </div>
                <p className="mb-4 text-xs text-slate-500">
                  Summary cards above reflect the <strong>Yearly</strong> period to avoid
                  double-counting overlapping daily, weekly, and monthly data.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                      <Wallet className="h-4 w-4" />
                      Gross Profit
                    </div>
                    <p className="mt-3 text-2xl font-bold text-slate-900">
                      {currency.format(totalGrossProfit)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Revenue less cost of goods sold
                    </p>
                  </div>
                  <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4">
                    <div className="flex items-center gap-2 text-rose-600 text-xs font-semibold uppercase tracking-wide">
                      <TrendingDown className="h-4 w-4" />
                      Expenses
                    </div>
                    <p className="mt-3 text-2xl font-bold text-rose-600">
                      {currency.format(totalExpenses)}
                    </p>
                    <p className="mt-1 text-xs text-rose-500">
                      Logged store operating expenses
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
                    <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold uppercase tracking-wide">
                      <BarChart3 className="h-4 w-4" />
                      Net Profit
                    </div>
                    <p
                      className={`mt-3 text-2xl font-bold ${
                        totalProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {currency.format(totalProfit)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Gross profit after expenses
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Recent Expenses</h2>
                  <p className="text-xs text-slate-500">Latest logged outflows</p>
                </div>
                {recentExpenses.length > 0 ? (
                  <div className="space-y-3">
                    {recentExpenses.map((expense) => (
                      <div
                        key={expense.id}
                        className="rounded-2xl border border-slate-100 px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {expense.description}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {expense.category} •{" "}
                              {new Date(expense.expense_date).toLocaleDateString()}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-rose-600 whitespace-nowrap">
                            {currency.format(Number(expense.amount || 0))}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    No expenses logged yet or the expenses table is not available.
                  </p>
                )}
              </div>
            </section>

            <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Top Selling Items</h2>
                <p className="text-xs text-slate-500">Based on quantity sold</p>
              </div>
              {topSellingItems.length > 0 ? (
                <div className="space-y-3">
                  {topSellingItems.map((item, index) => (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between border border-slate-100 rounded-2xl px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {index + 1}. {item.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Sales Amount: {currency.format(item.salesAmount)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-blue-600">
                          {item.quantitySold} sold
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No sales data yet for top items.</p>
              )}
            </section>

            <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <h2 className="text-lg font-bold">Recent Transactions</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Latest completed sales with unit cost and profit.
                </p>
              </div>
              <div className="overflow-x-auto">
                {/* Desktop table */}
                <table className="hidden sm:table w-full text-left">
                  <thead>
                    <tr className="text-slate-400 text-xs uppercase bg-slate-50/70">
                      <th className="px-6 py-3 font-semibold">Receipt</th>
                      <th className="px-6 py-3 font-semibold">Date</th>
                      <th className="px-6 py-3 font-semibold">Unit Cost</th>
                      <th className="px-6 py-3 font-semibold">Total</th>
                      <th className="px-6 py-3 font-semibold">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentTransactions.length > 0 ? (
                      recentTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/60">
                          <td className="px-6 py-4 text-sm font-semibold text-slate-800">{tx.receiptNo}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{new Date(tx.createdAt).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm font-semibold text-amber-600">{currency.format(tx.unitCostTotal)}</td>
                          <td className="px-6 py-4 text-sm font-semibold text-slate-800">{currency.format(tx.total)}</td>
                          <td className={`px-6 py-4 text-sm font-bold ${tx.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {currency.format(tx.profit)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={5} className="px-6 py-8 text-sm text-center text-slate-400">No recent completed transactions yet.</td></tr>
                    )}
                  </tbody>
                </table>

                {/* Mobile card list */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {recentTransactions.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">No recent completed transactions yet.</p>
                  ) : (
                    recentTransactions.map((tx) => (
                      <div key={tx.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{tx.receiptNo}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{new Date(tx.createdAt).toLocaleString()}</p>
                          <p className="text-xs text-amber-600 mt-0.5">Cost {currency.format(tx.unitCostTotal)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">{currency.format(tx.total)}</p>
                          <p className={`text-xs font-bold mt-0.5 ${tx.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {currency.format(tx.profit)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            {viewMode === "cards" ? (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
                {metrics.map((metric) => (
                  <section
                    key={metric.label}
                    className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"
                  >
                    <h2 className="text-lg font-bold mb-4">{metric.label}</h2>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Revenue</span>
                        <span className="font-semibold">
                          {currency.format(metric.revenue)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Cost of Goods</span>
                        <span className="font-semibold">
                          {currency.format(metric.cogs)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Gross Profit</span>
                        <span
                          className={`font-semibold ${
                            metric.grossProfit >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          {currency.format(metric.grossProfit)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Expenses</span>
                        <span className="font-semibold text-rose-600">
                          {currency.format(metric.expenses)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Transactions</span>
                        <span className="font-semibold">{metric.transactions}</span>
                      </div>
                      <div className="border-t pt-2 mt-2 flex justify-between">
                        <span className="font-bold">Net Profit</span>
                        <span
                          className={`font-bold ${
                            metric.netProfit >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          {currency.format(metric.netProfit)}
                        </span>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                <h2 className="text-lg font-bold mb-5">Profit Graph</h2>
                <div className="space-y-5">
                  {metrics.map((metric) => {
                    const revenueWidth = Math.max(
                      8,
                      (metric.revenue / highestRevenue) * 100,
                    );
                    const cogsWidth = Math.max(6, (metric.cogs / highestRevenue) * 100);
                    const expensesWidth = Math.max(
                      6,
                      (metric.expenses / highestRevenue) * 100,
                    );
                    const netProfitBase = Math.abs(metric.netProfit);
                    const netProfitWidth = Math.max(
                      6,
                      (netProfitBase / highestRevenue) * 100,
                    );

                    return (
                      <div key={metric.label} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-sm">{metric.label}</p>
                          <p className="text-xs text-slate-500">
                            {metric.transactions} transactions
                          </p>
                        </div>
                        <div>
                          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-blue-500"
                              style={{ width: `${revenueWidth}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Revenue: {currency.format(metric.revenue)}
                          </p>
                        </div>
                        <div>
                          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-amber-500"
                              style={{ width: `${cogsWidth}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            COGS: {currency.format(metric.cogs)}
                          </p>
                        </div>
                        <div>
                          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-fuchsia-500"
                              style={{ width: `${expensesWidth}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Expenses: {currency.format(metric.expenses)}
                          </p>
                        </div>
                        <div>
                          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full ${
                                metric.netProfit >= 0
                                  ? "bg-emerald-500"
                                  : "bg-rose-500"
                              }`}
                              style={{ width: `${netProfitWidth}%` }}
                            />
                          </div>
                          <p
                            className={`text-xs mt-1 ${
                              metric.netProfit >= 0
                                ? "text-emerald-600"
                                : "text-rose-600"
                            }`}
                          >
                            Net Profit: {currency.format(metric.netProfit)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 text-xs text-slate-500 flex flex-wrap gap-4">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                    Revenue
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                    Cost of Goods
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-fuchsia-500 inline-block" />
                    Expenses
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                    Net Profit (positive)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-500 inline-block" />
                    Net Profit (negative)
                  </span>
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

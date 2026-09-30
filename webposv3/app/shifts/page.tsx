"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import Sidebar from "../components/sidebar";
import { PaginationControls } from "../components/pagination-controls";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftRow {
  id: string;
  branch_id: string;
  cashier_id: string;
  cashier_name: string | null;
  branch_name: string | null;
  opened_at: string;
  closed_at: string | null;
  status: "open" | "closed" | "remitted";
  opening_float: number;
  expected_cash: number | null;
  declared_cash: number | null;
  variance: number | null;
  notes: string | null;
  // remittance (joined)
  amount_remitted: number | null;
  remitted_at: string | null;
  received_by_name: string | null;
}

interface ShiftSale {
  id: string;
  receipt_no: string | null;
  created_at: string;
  total: number;
  status: string;
  cash_paid: number;
}

interface RemitFormState {
  amountRemitted: string;
  notes: string;
}

const EMPTY_REMIT_FORM: RemitFormState = { amountRemitted: "", notes: "" };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShiftsPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Shifts list
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [totalShifts, setTotalShifts] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed" | "remitted">("all");
  const pageSize = 10;

  // Drill-down
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);
  const [shiftSales, setShiftSales] = useState<ShiftSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);

  // Remittance modal
  const [remitShift, setRemitShift] = useState<ShiftRow | null>(null);
  const [remitForm, setRemitForm] = useState<RemitFormState>(EMPTY_REMIT_FORM);
  const [remitting, setRemitting] = useState(false);

  // ── Data loaders ────────────────────────────────────────────────────────────

  const loadShifts = useCallback(async (pg = 1, filter: typeof statusFilter = "all") => {
    setLoading(true);
    const from = (pg - 1) * pageSize;
    const to = from + pageSize - 1;

    // We query shifts joined to profiles (cashier) and branches manually
    // because shift_summary view may not be available on all envs yet.
    let q = supabase
      .from("shifts")
      .select(
        `id, branch_id, cashier_id, opened_at, closed_at, status,
         opening_float, expected_cash, declared_cash, variance, notes,
         cashier:profiles!shifts_cashier_id_fkey(full_name),
         branch:branches!shifts_branch_id_fkey(name),
         cash_remittances(amount_remitted, remitted_at,
           receiver:profiles!cash_remittances_received_by_fkey(full_name))`,
        { count: "exact" },
      )
      .order("opened_at", { ascending: false });

    if (filter !== "all") q = q.eq("status", filter);

    const { data, error, count } = await q.range(from, to);

    if (error) {
      if (error.code === "42P01") {
        alert("Shifts table not found. Run shift_management.sql in Supabase SQL Editor first.");
      } else {
        console.error("Failed to load shifts:", error.message);
      }
      setLoading(false);
      return;
    }

    // Normalize the nested joins
    const rows: ShiftRow[] = ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const cashier = Array.isArray(row.cashier) ? row.cashier[0] : row.cashier;
      const branch = Array.isArray(row.branch) ? row.branch[0] : row.branch;
      const remList = Array.isArray(row.cash_remittances) ? row.cash_remittances : [];
      const rem = remList[0] as Record<string, unknown> | undefined;
      const receiver = rem
        ? (Array.isArray(rem.receiver) ? rem.receiver[0] : rem.receiver) as Record<string, unknown> | null
        : null;

      return {
        id: row.id as string,
        branch_id: row.branch_id as string,
        cashier_id: row.cashier_id as string,
        cashier_name: (cashier as Record<string, unknown> | null)?.full_name as string | null,
        branch_name: (branch as Record<string, unknown> | null)?.name as string | null,
        opened_at: row.opened_at as string,
        closed_at: row.closed_at as string | null,
        status: row.status as ShiftRow["status"],
        opening_float: Number(row.opening_float ?? 0),
        expected_cash: row.expected_cash != null ? Number(row.expected_cash) : null,
        declared_cash: row.declared_cash != null ? Number(row.declared_cash) : null,
        variance: row.variance != null ? Number(row.variance) : null,
        notes: row.notes as string | null,
        amount_remitted: rem?.amount_remitted != null ? Number(rem.amount_remitted) : null,
        remitted_at: rem?.remitted_at as string | null ?? null,
        received_by_name: receiver?.full_name as string | null ?? null,
      };
    });

    setShifts(rows);
    setTotalShifts(count ?? 0);
    setPage(pg);
    setLoading(false);
  }, [pageSize]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin") { router.push("/pos"); return; }

      setCheckingAuth(false);
      await loadShifts(1, "all");
    };
    init();
  }, [router, loadShifts]);

  // Load sales for a shift when expanded
  const toggleExpand = useCallback(async (shiftId: string) => {
    if (expandedShiftId === shiftId) { setExpandedShiftId(null); return; }
    setExpandedShiftId(shiftId);
    setSalesLoading(true);

    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("id, receipt_no, created_at, total, status")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: false });

    if (salesError) {
      console.error("Failed to load shift sales:", salesError.message);
      setSalesLoading(false);
      return;
    }

    const saleIds = ((salesData ?? []) as { id: string }[]).map((s) => s.id);
    let cashBySale = new Map<string, number>();

    if (saleIds.length > 0) {
      const { data: payData } = await supabase
        .from("payments")
        .select("sale_id, amount, method")
        .in("sale_id", saleIds);

      cashBySale = ((payData ?? []) as { sale_id: string; amount: number; method: string | null }[])
        .filter((p) => p.method?.toLowerCase() === "cash")
        .reduce((map, p) => {
          map.set(p.sale_id, (map.get(p.sale_id) ?? 0) + Number(p.amount));
          return map;
        }, new Map<string, number>());
    }

    setShiftSales(
      ((salesData ?? []) as { id: string; receipt_no: string | null; created_at: string; total: number; status: string }[]).map((s) => ({
        id: s.id,
        receipt_no: s.receipt_no,
        created_at: s.created_at,
        total: Number(s.total),
        status: s.status,
        cash_paid: cashBySale.get(s.id) ?? 0,
      })),
    );
    setSalesLoading(false);
  }, [expandedShiftId]);

  // ── Remittance ───────────────────────────────────────────────────────────────

  const handleMarkRemitted = useCallback(async () => {
    if (!remitShift || !currentUserId) return;
    const amount = Number.parseFloat(remitForm.amountRemitted);
    if (!Number.isFinite(amount) || amount < 0) {
      alert("Enter a valid amount received.");
      return;
    }
    setRemitting(true);

    const { error: remErr } = await supabase
      .from("cash_remittances")
      .insert([{
        shift_id: remitShift.id,
        branch_id: remitShift.branch_id,
        cashier_id: remitShift.cashier_id,
        amount_remitted: amount,
        received_by: currentUserId,
        notes: remitForm.notes.trim() || null,
      }]);

    if (remErr) {
      if (remErr.code === "42P01") {
        alert("cash_remittances table missing. Run shift_management.sql first.");
      } else {
        alert(remErr.message);
      }
      setRemitting(false);
      return;
    }

    const { error: shiftErr } = await supabase
      .from("shifts")
      .update({ status: "remitted", updated_at: new Date().toISOString() })
      .eq("id", remitShift.id);

    if (shiftErr) {
      alert(shiftErr.message);
      setRemitting(false);
      return;
    }

    setRemitShift(null);
    setRemitForm(EMPTY_REMIT_FORM);
    setRemitting(false);
    await loadShifts(page, statusFilter);
  }, [remitShift, currentUserId, remitForm, page, statusFilter, loadShifts]);

  // ── UI helpers ───────────────────────────────────────────────────────────────

  const statusBadge = (status: ShiftRow["status"]) => {
    if (status === "open")
      return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Open</span>;
    if (status === "closed")
      return <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">Closed</span>;
    return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700"><CheckCircle2 size={10} />Remitted</span>;
  };

  const varianceBadge = (v: number | null) => {
    if (v === null) return <span className="text-slate-400">—</span>;
    if (v === 0) return <span className="font-semibold text-emerald-600">₱0.00</span>;
    return (
      <span className={`font-bold ${v < 0 ? "text-rose-600" : "text-amber-600"}`}>
        {v > 0 ? "+" : ""}₱{v.toFixed(2)}
      </span>
    );
  };

  const totalPages = Math.max(1, Math.ceil(totalShifts / pageSize));

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

        {/* Header */}
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Shift Management</h1>
            <p className="text-sm text-slate-500 mt-1 hidden sm:block">
              Review cashier shifts, verify cash counts, and record remittances.
            </p>
          </div>
          <button
            onClick={() => loadShifts(page, statusFilter)}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </header>

        {/* Filter tabs */}
        <div className="mb-5 flex gap-2 flex-wrap">
          {(["all", "open", "closed", "remitted"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setStatusFilter(f); void loadShifts(1, f); }}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition ${
                statusFilter === f
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Shifts table */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/60 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-4">Cashier</th>
                  <th className="px-6 py-4">Branch</th>
                  <th className="px-6 py-4">Opened</th>
                  <th className="px-6 py-4">Closed</th>
                  <th className="px-6 py-4">Float</th>
                  <th className="px-6 py-4">Expected</th>
                  <th className="px-6 py-4">Declared</th>
                  <th className="px-6 py-4">Variance</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={10} className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" /></td></tr>
                ) : shifts.length === 0 ? (
                  <tr><td colSpan={10} className="py-10 text-center text-slate-400">No shifts found.</td></tr>
                ) : shifts.map((shift) => (
                  <React.Fragment key={shift.id}>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4 font-semibold">{shift.cashier_name || "—"}</td>
                      <td className="px-6 py-4 text-slate-500">{shift.branch_name || "—"}</td>
                      <td className="px-6 py-4 text-slate-500">{new Date(shift.opened_at).toLocaleString()}</td>
                      <td className="px-6 py-4 text-slate-500">{shift.closed_at ? new Date(shift.closed_at).toLocaleString() : "—"}</td>
                      <td className="px-6 py-4">₱{shift.opening_float.toFixed(2)}</td>
                      <td className="px-6 py-4">{shift.expected_cash != null ? `₱${shift.expected_cash.toFixed(2)}` : "—"}</td>
                      <td className="px-6 py-4">{shift.declared_cash != null ? `₱${shift.declared_cash.toFixed(2)}` : "—"}</td>
                      <td className="px-6 py-4">{varianceBadge(shift.variance)}</td>
                      <td className="px-6 py-4">{statusBadge(shift.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => toggleExpand(shift.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {expandedShiftId === shift.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            Sales
                          </button>
                          {shift.status === "closed" && (
                            <button
                              onClick={() => { setRemitShift(shift); setRemitForm({ amountRemitted: shift.declared_cash?.toFixed(2) ?? "", notes: "" }); }}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                            >
                              Mark Remitted
                            </button>
                          )}
                          {shift.status === "remitted" && shift.amount_remitted != null && (
                            <span className="text-xs text-slate-500">
                              ₱{shift.amount_remitted.toFixed(2)} received
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Drill-down: sales for this shift */}
                    {expandedShiftId === shift.id && (
                      <tr>
                        <td colSpan={10} className="bg-slate-50/80 px-6 py-4">
                          {salesLoading ? (
                            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div>
                          ) : shiftSales.length === 0 ? (
                            <p className="text-sm text-slate-400 py-2">No sales recorded in this shift.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead className="text-slate-400 uppercase">
                                <tr>
                                  <th className="pb-2 text-left font-semibold">Receipt</th>
                                  <th className="pb-2 text-left font-semibold">Date & Time</th>
                                  <th className="pb-2 text-left font-semibold">Total</th>
                                  <th className="pb-2 text-left font-semibold">Cash Paid</th>
                                  <th className="pb-2 text-left font-semibold">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {shiftSales.map((s) => (
                                  <tr key={s.id}>
                                    <td className="py-2 font-mono">{s.receipt_no || s.id.slice(0,8)}</td>
                                    <td className="py-2 text-slate-500">{new Date(s.created_at).toLocaleString()}</td>
                                    <td className="py-2 font-semibold">₱{s.total.toFixed(2)}</td>
                                    <td className="py-2 text-emerald-600 font-semibold">₱{s.cash_paid.toFixed(2)}</td>
                                    <td className="py-2">
                                      <span className={`rounded-full px-2 py-0.5 font-bold capitalize ${s.status === "void" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                                        {s.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-slate-200">
                                  <td colSpan={2} className="pt-2 text-xs font-semibold text-slate-500">{shiftSales.length} transaction{shiftSales.length !== 1 ? "s" : ""}</td>
                                  <td className="pt-2 font-bold">₱{shiftSales.reduce((s, r) => s + r.total, 0).toFixed(2)}</td>
                                  <td className="pt-2 font-bold text-emerald-600">₱{shiftSales.reduce((s, r) => s + r.cash_paid, 0).toFixed(2)}</td>
                                  <td />
                                </tr>
                              </tfoot>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden divide-y divide-slate-100">
            {loading ? (
              <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
            ) : shifts.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">No shifts found.</p>
            ) : shifts.map((shift) => (
              <div key={shift.id} className="px-4 py-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{shift.cashier_name || "—"}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{shift.branch_name} · {new Date(shift.opened_at).toLocaleString()}</p>
                  </div>
                  {statusBadge(shift.status)}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-slate-400">Float</p>
                    <p className="font-semibold mt-0.5">₱{shift.opening_float.toFixed(2)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-slate-400">Expected</p>
                    <p className="font-semibold mt-0.5">{shift.expected_cash != null ? `₱${shift.expected_cash.toFixed(2)}` : "—"}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-slate-400">Variance</p>
                    <p className="mt-0.5">{varianceBadge(shift.variance)}</p>
                  </div>
                </div>
                {shift.notes && <p className="text-xs text-slate-500 italic">{shift.notes}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleExpand(shift.id)}
                    className="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1"
                  >
                    {expandedShiftId === shift.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    Sales
                  </button>
                  {shift.status === "closed" && (
                    <button
                      onClick={() => { setRemitShift(shift); setRemitForm({ amountRemitted: shift.declared_cash?.toFixed(2) ?? "", notes: "" }); }}
                      className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 size={12} /> Mark Remitted
                    </button>
                  )}
                </div>
                {/* Mobile drill-down */}
                {expandedShiftId === shift.id && (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    {salesLoading ? (
                      <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-blue-600" /></div>
                    ) : shiftSales.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center">No sales in this shift.</p>
                    ) : (
                      <div className="space-y-2">
                        {shiftSales.map((s) => (
                          <div key={s.id} className="flex justify-between text-xs">
                            <div>
                              <p className="font-mono font-semibold">{s.receipt_no || s.id.slice(0,8)}</p>
                              <p className="text-slate-400">{new Date(s.created_at).toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">₱{s.total.toFixed(2)}</p>
                              <p className="text-emerald-600">Cash ₱{s.cash_paid.toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <PaginationControls
            currentPage={page}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={totalShifts}
            itemLabel="shifts"
            onPageChange={(p) => { setPage(p); void loadShifts(p, statusFilter); }}
          />
        </div>

        {/* ── Mark Remitted Modal ─────────────────────────────────────────── */}
        {remitShift && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
            <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl max-h-[95vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold">Mark Remitted</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {remitShift.cashier_name} · {new Date(remitShift.closed_at ?? remitShift.opened_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => { setRemitShift(null); setRemitForm(EMPTY_REMIT_FORM); }} className="p-2 rounded-full hover:bg-slate-100">
                  <X size={20} />
                </button>
              </div>

              {/* Summary */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 mb-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Opening Float</span>
                  <span className="font-semibold">₱{remitShift.opening_float.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expected Cash</span>
                  <span className="font-semibold">{remitShift.expected_cash != null ? `₱${remitShift.expected_cash.toFixed(2)}` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cashier Declared</span>
                  <span className="font-semibold">{remitShift.declared_cash != null ? `₱${remitShift.declared_cash.toFixed(2)}` : "—"}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
                  <span>Variance</span>
                  {varianceBadge(remitShift.variance)}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-1">
                    Amount Actually Received (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={remitForm.amountRemitted}
                    onChange={(e) => setRemitForm((f) => ({ ...f, amountRemitted: e.target.value }))}
                    onKeyDown={(e) => { if (["e","E","+","-"].includes(e.key)) e.preventDefault(); }}
                    autoFocus
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    placeholder="Any notes about this remittance..."
                    value={remitForm.notes}
                    onChange={(e) => setRemitForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:ring-2 focus:ring-blue-500 min-h-[72px]"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setRemitShift(null); setRemitForm(EMPTY_REMIT_FORM); }}
                    className="flex-1 py-3 rounded-2xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMarkRemitted}
                    disabled={remitting || remitForm.amountRemitted === ""}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
                  >
                    {remitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Confirm Remittance
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

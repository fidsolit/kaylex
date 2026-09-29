"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, X } from "lucide-react";
import { PaginationControls } from "../components/pagination-controls";
import Sidebar from "../components/sidebar";
import { supabase } from "@/lib/supabaseClient";

// 1. Core Types matching the public.expenses schema
type ExpenseCategory =
  | "Utilities"
  | "Supplier"
  | "Rent"
  | "Salaries"
  | "Marketing"
  | "Maintenance"
  | "Spoilage/Loss"
  | "Miscellaneous";

interface ExpenseRow {
  id: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  expense_date: string;
  payment_method: string;
  reference_no: string | null;
  created_by: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
}

interface ExpenseFormState {
  amount: string;
  category: ExpenseCategory;
  description: string;
  expenseDate: string;
  paymentMethod: string;
  referenceNo: string;
}

const EMPTY_EXPENSE_FORM: ExpenseFormState = {
  amount: "",
  category: "Miscellaneous",
  description: "",
  expenseDate: new Date().toISOString().slice(0, 10), // Default to today
  paymentMethod: "Cash",
  referenceNo: "",
};

export default function ExpensesPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [totalExpenseCount, setTotalExpenseCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userNamesById, setUserNamesById] = useState<Record<string, string>>({});
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseFeatureReady, setExpenseFeatureReady] = useState(true);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // 2. Fetch and Sync Handlers
  const loadExpenses = useCallback(async (page = 1, searchTerm = "") => {
    setLoading(true);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("expenses")
      .select(
        "id, amount, category, description, expense_date, payment_method, reference_no, created_by, created_at",
        { count: "exact" },
      )
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    const trimmedSearch = searchTerm.trim();
    if (trimmedSearch) {
      query = query.or(
        `description.ilike.%${trimmedSearch}%,category.ilike.%${trimmedSearch}%,payment_method.ilike.%${trimmedSearch}%,reference_no.ilike.%${trimmedSearch}%`,
      );
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      if (error.code === "42P01") {
        setExpenseFeatureReady(false);
      } else {
        alert(error.message);
      }
    } else {
      setExpenseFeatureReady(true);
      const expenseRows = (data as ExpenseRow[]) ?? [];
      setRows(expenseRows);
      setTotalExpenseCount(count ?? 0);

      const maxPage = Math.max(1, Math.ceil((count ?? 0) / pageSize));
      if (page > maxPage) {
        setCurrentPage(maxPage);
        setLoading(false);
        return;
      }

      const uniqueUserIds = Array.from(
        new Set(
          expenseRows
            .map((expense) => expense.created_by)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      if (uniqueUserIds.length === 0) {
        setUserNamesById({});
      } else {
        const { data: profileRows, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", uniqueUserIds);

        if (profileError) {
          console.error("Failed to fetch expense user names:", profileError.message);
          setUserNamesById({});
        } else {
          const nameMap = ((profileRows as ProfileRow[] | null) ?? []).reduce<
            Record<string, string>
          >((acc, profile) => {
            acc[profile.id] = profile.full_name?.trim() || `User ${profile.id.slice(0, 8)}`;
            return acc;
          }, {});
          setUserNamesById(nameMap);
        }
      }
    }
    setLoading(false);
  }, [pageSize]);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setCurrentUserId(user.id);

      setCheckingAuth(false);
      await loadExpenses(1, "");
    };
    init();
  }, [loadExpenses, router]);

  useEffect(() => {
    if (checkingAuth) return;
    const timeoutId = window.setTimeout(() => {
      void loadExpenses(currentPage, search);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [checkingAuth, currentPage, loadExpenses, search]);

  // Form State Handler
  const [expenseForm, setExpenseForm] =
    useState<ExpenseFormState>(EMPTY_EXPENSE_FORM);

  // 3. Computed Metrics: Filtering, Aggregations, and Searching
  const totalExpenseAmount = useMemo(() => {
    return rows.reduce((sum, exp) => sum + Number(exp.amount), 0);
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(totalExpenseCount / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);

  // 4. Mutation Handlers: Create, Update, Delete
  const handleSaveExpense = async () => {
    if (!currentUserId) return alert("Missing user context.");
    if (!expenseForm.amount || parseFloat(expenseForm.amount) <= 0) {
      return alert("Please enter a valid amount greater than 0.");
    }
    if (!expenseForm.description.trim()) {
      return alert("Description is required.");
    }

    const payload = {
      amount: parseFloat(expenseForm.amount),
      category: expenseForm.category,
      description: expenseForm.description.trim(),
      expense_date: expenseForm.expenseDate,
      payment_method: expenseForm.paymentMethod,
      reference_no: expenseForm.referenceNo.trim() || null,
    };

    if (editingExpenseId) {
      // Update logic
      const { error } = await supabase
        .from("expenses")
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingExpenseId);

      if (error) {
        alert(error.message);
        return;
      }
    } else {
      // Create logic
      const { error } = await supabase.from("expenses").insert([
        {
          ...payload,
          created_by: currentUserId,
        },
      ]);

      if (error) {
        alert(error.message);
        return;
      }
    }

    closeExpenseModal();
    await loadExpenses(currentPage, search);
  };

  const openEditExpense = (expense: ExpenseRow) => {
    setEditingExpenseId(expense.id);
    setExpenseForm({
      amount: expense.amount.toString(),
      category: expense.category,
      description: expense.description,
      expenseDate: expense.expense_date,
      paymentMethod: expense.payment_method,
      referenceNo: expense.reference_no ?? "",
    });
    setIsAddExpenseOpen(true);
  };

  const handleDeleteExpense = async (id: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this expense record?",
    );
    if (!confirmed) return;

    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      alert(error.message);
    } else {
      await loadExpenses(currentPage, search);
    }
  };

  const closeExpenseModal = () => {
    setIsAddExpenseOpen(false);
    setEditingExpenseId(null);
    setExpenseForm(EMPTY_EXPENSE_FORM);
  };

  if (checkingAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 pt-20 md:pt-10 md:p-10">
        {/* Header section */}
        <header className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Expenses</h1>
              <p className="text-sm text-slate-500 mt-1 hidden sm:block">
                Log operating costs, shop utilities, and balance store outflows.
              </p>
            </div>
            {expenseFeatureReady && (
              <button
                onClick={() => setIsAddExpenseOpen(true)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-blue-600 text-white font-semibold inline-flex items-center justify-center gap-2 text-sm shadow-sm hover:bg-blue-700 transition"
              >
                <Plus size={16} />
                Log Expense
              </button>
            )}
          </div>
        </header>

        {/* Database validation warning alert */}
        {!expenseFeatureReady && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-sm">
            <strong>Expenses table missing.</strong> Please execute your table
            generation DDL migration file inside your Supabase SQL editor to
            initialize this feature.
          </div>
        )}

        {/* Financial KPI Summary Card */}
        {expenseFeatureReady && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Total Filtered Outflow
              </p>
              <h3 className="text-2xl font-bold mt-2 text-rose-600">
                ₱
                {totalExpenseAmount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Summing {rows.length} entries on this page
              </p>
            </div>
          </div>
        )}

        {/* Main interactive data container */}
        {expenseFeatureReady && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <div className="relative max-w-md">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search description, category, reference..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              {/* Desktop table */}
              <table className="hidden sm:table w-full text-left">
                <thead className="bg-slate-50/60 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">Method</th>
                    <th className="px-6 py-4">Logged By</th>
                    <th className="px-6 py-4">Ref No.</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loading ? (
                    <tr><td colSpan={8} className="px-6 py-10 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" /></td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-10 text-center text-slate-400">No recorded expenses match your parameters.</td></tr>
                  ) : (
                    rows.map((expense) => (
                      <tr key={expense.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">{new Date(expense.expense_date).toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">{expense.category}</span>
                        </td>
                        <td className="px-6 py-4 font-medium max-w-xs truncate" title={expense.description}>{expense.description}</td>
                        <td className="px-6 py-4 text-slate-600">{expense.payment_method}</td>
                        <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                          {expense.created_by ? (userNamesById[expense.created_by] ?? `User ${expense.created_by.slice(0, 8)}`) : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{expense.reference_no || "-"}</td>
                        <td className="px-6 py-4 font-bold text-rose-600">₱{Number(expense.amount).toFixed(2)}</td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button onClick={() => openEditExpense(expense)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                            <button onClick={() => handleDeleteExpense(expense.id)} className="rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-slate-100 text-sm">
                {loading ? (
                  <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                ) : rows.length === 0 ? (
                  <p className="py-10 text-center text-slate-400">No recorded expenses.</p>
                ) : (
                  rows.map((expense) => (
                    <div key={expense.id} className="px-4 py-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{expense.description}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {new Date(expense.expense_date).toLocaleDateString()} · {expense.payment_method}
                          </p>
                        </div>
                        <span className="font-bold text-rose-600 whitespace-nowrap">₱{Number(expense.amount).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">{expense.category}</span>
                        {expense.reference_no && <span className="text-xs text-slate-400 font-mono">{expense.reference_no}</span>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openEditExpense(expense)} className="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                        <button onClick={() => handleDeleteExpense(expense.id)} className="flex-1 rounded-xl border border-rose-100 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50">Delete</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <PaginationControls
              currentPage={effectivePage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalExpenseCount}
              itemLabel="expenses"
              onPageChange={(page) => setCurrentPage(page)}
            />
          </div>
        )}

        {/* Action Modal Form (Handles Insertion & Correction Updates) */}
        {isAddExpenseOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 w-full sm:max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">
                  {editingExpenseId
                    ? "Modify Expense Entry"
                    : "Log New Expense"}
                </h2>
                <button
                  onClick={closeExpenseModal}
                  className="p-2 hover:bg-slate-100 rounded-full transition"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Outflow Cash Field */}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">
                    Amount (PHP)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={expenseForm.amount}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, amount: e.target.value })
                    }
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-bold text-lg text-rose-600"
                  />
                </div>

                {/* Relational Classification Type Selector */}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">
                    Cost Type Category
                  </label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        category: e.target.value as ExpenseCategory,
                      })
                    }
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-sm"
                  >
                    <option value="Utilities">
                      Utilities (Power, Web, Water)
                    </option>
                    <option value="Supplier">
                      Supplier (Restocking Inventory)
                    </option>
                    <option value="Rent">
                      Rent (Shop / Real Estate Space)
                    </option>
                    <option value="Salaries">
                      Salaries (Payroll Liabilities)
                    </option>
                    <option value="Marketing">
                      Marketing (Promotional Ads)
                    </option>
                    <option value="Maintenance">
                      Maintenance (Equipment Repairs)
                    </option>
                    <option value="Spoilage/Loss">
                      Spoilage/Loss (Expired/Broken Stock)
                    </option>
                    <option value="Miscellaneous">
                      Miscellaneous (Other Outflows)
                    </option>
                  </select>
                </div>

                {/* Occurrence Calendar Input */}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">
                    Transaction Date
                  </label>
                  <input
                    type="date"
                    value={expenseForm.expenseDate}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        expenseDate: e.target.value,
                      })
                    }
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-sm"
                  />
                </div>

                {/* Ledger Outflow Medium Channel */}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">
                    Payment Channel Method
                  </label>
                  <select
                    value={expenseForm.paymentMethod}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        paymentMethod: e.target.value,
                      })
                    }
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-sm"
                  >
                    <option value="Cash">Cash Drawer</option>
                    <option value="GCash">GCash Transfer</option>
                    <option value="Maya">Maya Account</option>
                    <option value="Bank Transfer">Bank Transfer Wire</option>
                    <option value="Credit Card">Business Credit Card</option>
                  </select>
                </div>

                {/* Validation Audit Trail Reference Strings */}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">
                    Receipt / Invoice reference (Optional)
                  </label>
                  <input
                    placeholder="OR-XXXXX or Txn ID Reference"
                    value={expenseForm.referenceNo}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        referenceNo: e.target.value,
                      })
                    }
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-sm font-mono"
                  />
                </div>

                {/* Descriptive Meta Content Narrative */}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">
                    Detailed Log Description
                  </label>
                  <textarea
                    placeholder="Specify details (e.g., PLDT Fiber Bill for March, 2x mouse replacements for workstation)"
                    value={expenseForm.description}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        description: e.target.value,
                      })
                    }
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-sm min-h-[80px]"
                  />
                </div>

                <button
                  onClick={handleSaveExpense}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition mt-2 shadow-sm"
                >
                  {editingExpenseId
                    ? "Update Ledger Record"
                    : "Save Expense Entry"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, Plus, Search, X } from "lucide-react";
import { PaginationControls } from "../components/pagination-controls";
import Sidebar from "../components/sidebar";
import { supabase } from "@/lib/supabaseClient";

interface CustomerCreditRow {
  id: string;
  branch_id: string | null;
  customer_name: string;
  contact_number: string | null;
  amount: number;
  promise_to_pay_date: string | null;
  is_paid: boolean;
  payment_status: "pending" | "paid" | "overdue";
}

interface CustomerSummary {
  key: string;
  customer_name: string;
  contact_number: string | null;
  to_pay_amount: number;
  unpaid_count: number;
  next_due_date: string | null;
}

interface RegisteredCustomer {
  id: string;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

interface CustomerFormState {
  fullName: string;
  contactNumber: string;
  email: string;
  address: string;
  notes: string;
}

const EMPTY_CUSTOMER_FORM: CustomerFormState = {
  fullName: "",
  contactNumber: "",
  email: "",
  address: "",
  notes: "",
};

export default function CustomersPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [smsLoadingKey, setSmsLoadingKey] = useState<string | null>(null);
  const [paidLoadingKey, setPaidLoadingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CustomerCreditRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(
    null,
  );
  const [customerFeatureReady, setCustomerFeatureReady] = useState(true);
  const [registeredCustomers, setRegisteredCustomers] = useState<
    RegisteredCustomer[]
  >([]);
  const [registeredCustomersPage, setRegisteredCustomersPage] = useState(1);
  const [registeredCustomersTotalCount, setRegisteredCustomersTotalCount] =
    useState(0);
  const [customerSummaryPage, setCustomerSummaryPage] = useState(1);
  const [customerForm, setCustomerForm] =
    useState<CustomerFormState>(EMPTY_CUSTOMER_FORM);
  const registeredCustomersPageSize = 5;
  const customerSummaryPageSize = 10;

  const ensureActiveBranch = useCallback(
    async (userId: string, role: string | null | undefined, branchId: string | null) => {
      if (branchId) return branchId;

      const { data: branch } = await supabase
        .from("branches")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      let resolvedBranchId = branch?.id ?? null;

      if (!resolvedBranchId && role === "admin") {
        const { data: createdBranch, error: createBranchError } = await supabase
          .from("branches")
          .insert([
            {
              name: "Main Branch",
            },
          ])
          .select("id")
          .single();

        if (createBranchError) {
          throw createBranchError;
        }

        resolvedBranchId = createdBranch?.id ?? null;
      }

      if (resolvedBranchId) {
        const { error: profileUpdateError } = await supabase
          .from("profiles")
          .update({
            branch_id: resolvedBranchId,
          })
          .eq("id", userId);

        if (profileUpdateError && profileUpdateError.code !== "42703") {
          throw profileUpdateError;
        }
      }

      return resolvedBranchId;
    },
    [],
  );

  const loadRegisteredCustomers = useCallback(
    async (branchId: string | null, page = 1) => {
      if (!branchId) return;
      const from = (page - 1) * registeredCustomersPageSize;
      const to = from + registeredCustomersPageSize - 1;

      const { data, error, count } = await supabase
        .from("customers")
        .select("id, full_name, contact_number, email, address, notes", {
          count: "exact",
        })
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) {
        if (error.code === "42P01") {
          setCustomerFeatureReady(false);
          return;
        }
        alert(error.message);
        return;
      }
      setCustomerFeatureReady(true);
      setRegisteredCustomersPage(page);
      if (count !== null) {
        setRegisteredCustomersTotalCount(count);
      }
      setRegisteredCustomers((data as RegisteredCustomer[]) ?? []);
    },
    [],
  );

  const syncOverdueStatuses = useCallback(async (branchId: string | null) => {
    if (!branchId) return;
    const today = new Date().toISOString().slice(0, 10);
    await supabase
      .from("customer_credits")
      .update({ payment_status: "overdue" })
      .eq("branch_id", branchId)
      .eq("is_paid", false)
      .lt("promise_to_pay_date", today)
      .neq("payment_status", "overdue");
  }, []);

  const loadCustomerCredits = useCallback(async (branchId: string | null) => {
    setLoading(true);
    if (!branchId) {
      setRows([]);
      setLoading(false);
      return;
    }

    await syncOverdueStatuses(branchId);
    const { data, error } = await supabase
      .from("customer_credits")
      .select(
        "id, branch_id, customer_name, contact_number, amount, promise_to_pay_date, is_paid, payment_status",
      )
      .eq("branch_id", branchId)
      .eq("is_paid", false)
      .neq("payment_status", "paid")
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
    } else {
      setRows((data as CustomerCreditRow[]) ?? []);
    }
    setLoading(false);
  }, [syncOverdueStatuses]);

  useEffect(() => {
    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/auth/login");
          return;
        }
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, branch_id")
          .eq("id", user.id)
          .single();

        const resolvedBranchId = await ensureActiveBranch(
          user.id,
          profile?.role,
          profile?.branch_id ?? null,
        );

        setActiveBranchId(resolvedBranchId);
        setCheckingAuth(false);
        await loadCustomerCredits(resolvedBranchId);
        await loadRegisteredCustomers(resolvedBranchId, 1);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to resolve active branch.";
        alert(message);
        setCheckingAuth(false);
      }
    };
    init();
  }, [ensureActiveBranch, loadCustomerCredits, loadRegisteredCustomers, router]);

  const customers = useMemo(() => {
    const map = new Map<string, CustomerSummary>();
    for (const row of rows) {
      const key = `${row.customer_name}::${row.contact_number || "-"}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          customer_name: row.customer_name,
          contact_number: row.contact_number,
          to_pay_amount: 0,
          unpaid_count: 0,
          next_due_date: null,
        });
      }
      const target = map.get(key)!;
      if (!row.is_paid && row.payment_status !== "paid") {
        target.to_pay_amount += Number(row.amount);
        target.unpaid_count += 1;
        if (
          row.promise_to_pay_date &&
          (!target.next_due_date ||
            row.promise_to_pay_date < target.next_due_date)
        ) {
          target.next_due_date = row.promise_to_pay_date;
        }
      }
    }
    const query = search.trim().toLowerCase();
    return [...map.values()]
      .filter((c) => c.to_pay_amount > 0)
      .filter((c) => {
        if (!query) return true;
        return (
          c.customer_name.toLowerCase().includes(query) ||
          c.contact_number?.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => b.to_pay_amount - a.to_pay_amount);
  }, [rows, search]);

  const totalRegisteredCustomersPages = Math.max(
    1,
    Math.ceil(registeredCustomersTotalCount / registeredCustomersPageSize),
  );
  const totalCustomerSummaryPages = Math.max(
    1,
    Math.ceil(customers.length / customerSummaryPageSize),
  );
  const effectiveCustomerSummaryPage = Math.min(
    customerSummaryPage,
    totalCustomerSummaryPages,
  );
  const paginatedCustomers = useMemo(() => {
    const start = (effectiveCustomerSummaryPage - 1) * customerSummaryPageSize;
    return customers.slice(start, start + customerSummaryPageSize);
  }, [customerSummaryPageSize, customers, effectiveCustomerSummaryPage]);

  const sendSmsReminder = async (customer: CustomerSummary) => {
    if (!customer.contact_number) {
      alert("Customer has no contact number.");
      return;
    }
    setSmsLoadingKey(customer.key);
    const res = await fetch("/api/sms/reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: customer.contact_number,
        customerName: customer.customer_name,
        amount: customer.to_pay_amount,
        dueDate: customer.next_due_date,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || "Failed to send SMS");
    } else {
      alert("SMS reminder sent.");
    }
    setSmsLoadingKey(null);
  };

  const markCustomerAsPaid = async (customer: CustomerSummary) => {
    const confirmed = window.confirm(
      `Mark all unpaid credit of ${customer.customer_name} as paid?`,
    );
    if (!confirmed) return;

    setPaidLoadingKey(customer.key);
    let query = supabase
      .from("customer_credits")
      .update({ is_paid: true, payment_status: "paid" })
      .eq("branch_id", activeBranchId)
      .eq("customer_name", customer.customer_name)
      .eq("is_paid", false)
      .neq("payment_status", "paid");

    query =
      customer.contact_number === null
        ? query.is("contact_number", null)
        : query.eq("contact_number", customer.contact_number);

    const { error } = await query;
    if (error) {
      alert(error.message);
    } else {
      await loadCustomerCredits(activeBranchId);
    }
    setPaidLoadingKey(null);
  };

  const handleAddCustomer = async () => {
    if (!currentUserId) return alert("Missing user context.");

    let branchId = activeBranchId;
    try {
      if (!branchId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, branch_id")
          .eq("id", currentUserId)
          .single();

        branchId = await ensureActiveBranch(
          currentUserId,
          profile?.role,
          profile?.branch_id ?? null,
        );

        if (branchId) setActiveBranchId(branchId);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Automatic branch setup failed.";
      return alert(message);
    }
    if (!branchId)
      return alert("No branch found and automatic branch setup failed.");

    if (!customerForm.fullName.trim()) {
      return alert("Customer name is required.");
    }
    const { error } = await supabase.from("customers").insert([
      {
        full_name: customerForm.fullName.trim(),
        contact_number: customerForm.contactNumber.trim() || null,
        email: customerForm.email.trim() || null,
        address: customerForm.address.trim() || null,
        notes: customerForm.notes.trim() || null,
        branch_id: branchId,
        created_by: currentUserId,
      },
    ]);
    if (error) {
      if (error.code === "42P01") {
        setCustomerFeatureReady(false);
        return alert(
          "Customers table missing. Run database_setup.sql.",
        );
      }
      alert(error.message);
      return;
    }
    setIsAddCustomerOpen(false);
    setCustomerForm(EMPTY_CUSTOMER_FORM);
    await loadRegisteredCustomers(branchId, 1);
  };

  const openEditCustomer = (customer: RegisteredCustomer) => {
    setEditingCustomerId(customer.id);
    setCustomerForm({
      fullName: customer.full_name,
      contactNumber: customer.contact_number ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
    });
    setIsAddCustomerOpen(true);
  };

  const closeCustomerModal = () => {
    setIsAddCustomerOpen(false);
    setEditingCustomerId(null);
    setCustomerForm(EMPTY_CUSTOMER_FORM);
  };

  const handleSaveCustomer = async () => {
    if (editingCustomerId) {
      const { error } = await supabase
        .from("customers")
        .update({
          full_name: customerForm.fullName.trim(),
          contact_number: customerForm.contactNumber.trim() || null,
          email: customerForm.email.trim() || null,
          address: customerForm.address.trim() || null,
          notes: customerForm.notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingCustomerId);

      if (error) {
        if (error.code === "42703") {
          return alert(
            "Customer address or email columns are missing. Run the customer contact upgrade SQL first.",
          );
        }
        alert(error.message);
        return;
      }

      closeCustomerModal();
      await loadRegisteredCustomers(activeBranchId, registeredCustomersPage);
      return;
    }

    await handleAddCustomer();
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
        <header className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Customers</h1>
              <p className="text-sm text-slate-500 mt-1 hidden sm:block">
                Track unpaid customer credit and send reminders.
              </p>
            </div>
            {customerFeatureReady && (
              <button
                onClick={() => setIsAddCustomerOpen(true)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-blue-600 text-white font-semibold inline-flex items-center justify-center gap-2 text-sm"
              >
                <Plus size={16} />
                Add Customer
              </button>
            )}
          </div>
        </header>

        {customerFeatureReady && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold">Latest Registered Customers</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {registeredCustomers.length > 0 ? (
                registeredCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="px-5 py-4 sm:px-6"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-900">
                          {customer.full_name}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {customer.contact_number || "No contact number"}
                        </p>
                      </div>
                      <button
                        onClick={() => openEditCustomer(customer)}
                        className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div className="rounded-2xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Email
                        </p>
                        <p className="mt-1 text-sm text-slate-600 break-all">
                          {customer.email || "No email"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Address
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {customer.address || "No address"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Notes
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {customer.notes || "No notes"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-6 text-sm text-slate-400">
                  No registered customers yet.
                </p>
              )}
            </div>
            <PaginationControls
              currentPage={registeredCustomersPage}
              totalPages={totalRegisteredCustomersPages}
              pageSize={registeredCustomersPageSize}
              totalItems={registeredCustomersTotalCount}
              itemLabel="registered customers"
              onPageChange={(page) => {
                void loadRegisteredCustomers(
                  activeBranchId,
                  Math.min(Math.max(page, 1), totalRegisteredCustomersPages),
                );
              }}
            />
          </div>
        )}

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
                  setCustomerSummaryPage(1);
                }}
                placeholder="Search name or contact..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {/* Desktop table */}
            <table className="hidden sm:table w-full text-left">
              <thead className="bg-slate-50/60 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Contact Number</th>
                  <th className="px-6 py-4">To Pay Amount</th>
                  <th className="px-6 py-4">Unpaid Entries</th>
                  <th className="px-6 py-4">Next Due</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!loading && customers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                      No customers with unpaid credit.
                    </td>
                  </tr>
                )}
                {paginatedCustomers.map((customer) => (
                  <tr key={customer.key} className="hover:bg-slate-50/60">
                    <td className="px-6 py-4 font-semibold">{customer.customer_name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{customer.contact_number || "-"}</td>
                    <td className="px-6 py-4 font-bold text-amber-600">₱{customer.to_pay_amount.toFixed(2)}</td>
                    <td className="px-6 py-4">{customer.unpaid_count}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {customer.next_due_date ? new Date(customer.next_due_date).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          disabled={paidLoadingKey === customer.key || smsLoadingKey === customer.key}
                          onClick={() => markCustomerAsPaid(customer)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {paidLoadingKey === customer.key ? <Loader2 size={12} className="animate-spin" /> : null}
                          Mark Paid
                        </button>
                        <button
                          disabled={smsLoadingKey === customer.key || !customer.contact_number || paidLoadingKey === customer.key}
                          onClick={() => sendSmsReminder(customer)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {smsLoadingKey === customer.key ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                          SMS
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-slate-100">
              {!loading && customers.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-400">No customers with unpaid credit.</p>
              )}
              {paginatedCustomers.map((customer) => (
                <div key={customer.key} className="px-4 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{customer.customer_name}</p>
                      <p className="text-xs text-slate-500">{customer.contact_number || "No contact"}</p>
                    </div>
                    <span className="font-bold text-amber-600 text-sm whitespace-nowrap">₱{customer.to_pay_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{customer.unpaid_count} unpaid</span>
                    {customer.next_due_date && (
                      <span>· due {new Date(customer.next_due_date).toLocaleDateString()}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={paidLoadingKey === customer.key || smsLoadingKey === customer.key}
                      onClick={() => markCustomerAsPaid(customer)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {paidLoadingKey === customer.key ? <Loader2 size={12} className="animate-spin" /> : null}
                      Mark Paid
                    </button>
                    <button
                      disabled={smsLoadingKey === customer.key || !customer.contact_number || paidLoadingKey === customer.key}
                      onClick={() => sendSmsReminder(customer)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {smsLoadingKey === customer.key ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                      Send SMS
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <PaginationControls
            currentPage={effectiveCustomerSummaryPage}
            totalPages={totalCustomerSummaryPages}
            pageSize={customerSummaryPageSize}
            totalItems={customers.length}
            itemLabel="customers"
            onPageChange={(page) => {
              setCustomerSummaryPage(page);
            }}
          />
        </div>

        {isAddCustomerOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 w-full sm:max-w-md shadow-2xl max-h-[95vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">New Customer</h2>
                <button
                  onClick={closeCustomerModal}
                  className="p-2 hover:bg-slate-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <input
                  placeholder="Full name"
                  value={customerForm.fullName}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      fullName: e.target.value,
                    })
                  }
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl"
                />
                <input
                  placeholder="Contact number"
                  value={customerForm.contactNumber}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      contactNumber: e.target.value,
                    })
                  }
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl"
                />
                <input
                  type="email"
                  placeholder="Email address"
                  value={customerForm.email}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      email: e.target.value,
                    })
                  }
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl"
                />
                <textarea
                  placeholder="Address"
                  value={customerForm.address}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      address: e.target.value,
                    })
                  }
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl"
                />
                <textarea
                  placeholder="Notes (optional)"
                  value={customerForm.notes}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, notes: e.target.value })
                  }
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl"
                />
                <button
                  onClick={handleSaveCustomer}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold"
                >
                  {editingCustomerId ? "Update Customer" : "Save Customer"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

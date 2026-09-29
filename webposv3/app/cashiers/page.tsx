"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Search, Shield, UserCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { PaginationControls } from "../components/pagination-controls";
import Sidebar from "../components/sidebar";

type Role = "admin" | "cashier";

interface Branch {
  id: string;
  name: string;
}

interface CashierProfile {
  id: string;
  full_name: string | null;
  role: Role;
  is_approved: boolean;
  branch_id: string | null;
  created_at: string;
}

interface UserActivityLog {
  id: string;
  user_id: string;
  branch_id: string | null;
  activity_type: "login" | "logout";
  created_at: string;
}

interface CashierStats {
  totalStaff: number;
  admins: number;
  cashiers: number;
  approvedCashiers: number;
  pendingApproval: number;
}

export default function CashiersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [page, setPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);

  const [profiles, setProfiles] = useState<CashierProfile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [recentActivities, setRecentActivities] = useState<UserActivityLog[]>([]);
  const [totalProfiles, setTotalProfiles] = useState(0);
  const [totalActivities, setTotalActivities] = useState(0);
  const [stats, setStats] = useState<CashierStats>({
    totalStaff: 0,
    admins: 0,
    cashiers: 0,
    approvedCashiers: 0,
    pendingApproval: 0,
  });
  const pageSize = 10;
  const activityPageSize = 10;

  const loadData = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const activityFrom = (activityPage - 1) * activityPageSize;
    const activityTo = activityFrom + activityPageSize - 1;
    const trimmedQuery = query.trim();

    let profilesQuery = supabase
      .from("profiles")
      .select("id, full_name, role, is_approved, branch_id, created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false });

    if (roleFilter !== "all") {
      profilesQuery = profilesQuery.eq("role", roleFilter);
    }

    if (trimmedQuery) {
      profilesQuery = profilesQuery.or(
        `full_name.ilike.%${trimmedQuery}%,id.ilike.%${trimmedQuery}%`,
      );
    }

    const [
      { data: branchData, error: branchError },
      { data: profileData, error: profileError, count: profileCount },
      { data: activityData, error: activityError, count: activityCount },
      { count: totalStaffCount, error: totalStaffError },
      { count: adminCount, error: adminCountError },
      { count: cashierCount, error: cashierCountError },
      { count: approvedCashierCount, error: approvedCashierCountError },
      { count: pendingCashierCount, error: pendingCashierCountError },
    ] = await Promise.all([
      supabase
        .from("branches")
        .select("id, name")
        .order("name", { ascending: true }),
      profilesQuery.range(from, to),
      supabase
        .from("user_activity_logs")
        .select("id, user_id, branch_id, activity_type, created_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(activityFrom, activityTo),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "cashier"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "cashier")
        .eq("is_approved", true),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "cashier")
        .eq("is_approved", false),
    ]);

    if (branchError)
      console.error("Failed to fetch branches:", branchError.message);
    if (profileError)
      console.error("Failed to fetch profiles:", profileError.message);
    if (activityError)
      console.error("Failed to fetch recent activities:", activityError.message);
    if (totalStaffError)
      console.error("Failed to fetch total staff count:", totalStaffError.message);
    if (adminCountError)
      console.error("Failed to fetch admin count:", adminCountError.message);
    if (cashierCountError)
      console.error("Failed to fetch cashier count:", cashierCountError.message);
    if (approvedCashierCountError)
      console.error(
        "Failed to fetch approved cashier count:",
        approvedCashierCountError.message,
      );
    if (pendingCashierCountError)
      console.error(
        "Failed to fetch pending cashier count:",
        pendingCashierCountError.message,
      );

    const currentProfiles = (profileData as CashierProfile[]) ?? [];
    const activityRows = (activityData as UserActivityLog[]) ?? [];
    const activityUserIds = Array.from(
      new Set(
        activityRows
          .map((activity) => activity.user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const missingActivityUserIds = activityUserIds.filter(
      (id) => !currentProfiles.some((profile) => profile.id === id),
    );

    let supplementalProfiles: CashierProfile[] = [];
    if (missingActivityUserIds.length > 0) {
      const { data: supplementalProfileData, error: supplementalProfileError } =
        await supabase
          .from("profiles")
          .select("id, full_name, role, is_approved, branch_id, created_at")
          .in("id", missingActivityUserIds);

      if (supplementalProfileError) {
        console.error(
          "Failed to fetch activity user names:",
          supplementalProfileError.message,
        );
      } else {
        supplementalProfiles = (supplementalProfileData as CashierProfile[]) ?? [];
      }
    }

    setBranches((branchData as Branch[]) ?? []);
    setProfiles([...currentProfiles, ...supplementalProfiles]);
    setTotalProfiles(profileCount ?? 0);
    setRecentActivities(activityRows);
    setTotalActivities(activityCount ?? 0);
    setStats({
      totalStaff: totalStaffCount ?? 0,
      admins: adminCount ?? 0,
      cashiers: cashierCount ?? 0,
      approvedCashiers: approvedCashierCount ?? 0,
      pendingApproval: pendingCashierCount ?? 0,
    });
    setLoading(false);
  }, [activityPage, activityPageSize, page, pageSize, query, roleFilter]);

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
      await loadData();
    };
    init();
  }, [router, loadData]);

  const branchMap = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );

  const rows = useMemo(
    () =>
      profiles.slice(0, pageSize).map((profile) => ({
        ...profile,
        branchName: profile.branch_id
          ? branchMap.get(profile.branch_id) || "Unknown branch"
          : "Unassigned",
      })),
    [branchMap, pageSize, profiles],
  );

  const activityRows = useMemo(() => {
    const profileMap = new Map(
      profiles.map((profile) => [profile.id, profile.full_name || "No name"]),
    );

    return recentActivities.map((activity) => ({
      ...activity,
      fullName: profileMap.get(activity.user_id) || "Unknown user",
      branchName: activity.branch_id
        ? branchMap.get(activity.branch_id) || "Unknown branch"
        : "Unassigned",
    }));
  }, [branchMap, profiles, recentActivities]);

  const totalPages = Math.max(1, Math.ceil(totalProfiles / pageSize));
  const effectivePage = Math.min(page, totalPages);
  const totalActivityPages = Math.max(
    1,
    Math.ceil(totalActivities / activityPageSize),
  );
  const effectiveActivityPage = Math.min(activityPage, totalActivityPages);

  const updateProfile = async (id: string, patch: Partial<CashierProfile>) => {
    setSaving(id);
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", id);
    if (error) {
      alert(error.message);
      setSaving(null);
      return;
    }

    await loadData();
    setSaving(null);
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
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">User Management</h1>
            <p className="text-sm text-slate-500 mt-1 hidden sm:block">
              Manage user roles and branch assignments.
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 disabled:opacity-60 text-sm"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <StatTile
            label="Total Staff"
            value={stats.totalStaff.toString()}
            icon={<UserCircle2 size={18} />}
          />
          <StatTile
            label="Admins"
            value={stats.admins.toString()}
            icon={<Shield size={18} />}
          />
          <StatTile
            label="Cashiers"
            value={stats.cashiers.toString()}
            icon={<UserCircle2 size={18} />}
          />
        </section>
        <section className="grid grid-cols-2 gap-3 mb-5">
          <StatTile
            label="Approved Cashiers"
            value={stats.approvedCashiers.toString()}
            icon={<Shield size={18} />}
          />
          <StatTile
            label="Pending Approval"
            value={stats.pendingApproval.toString()}
            icon={<UserCircle2 size={18} />}
          />
        </section>

        <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row gap-3 md:items-center">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, ID, or branch..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as "all" | Role);
                setPage(1);
              }}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="cashier">Cashier</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            {/* Desktop table */}
            <table className="hidden sm:table w-full text-left">
              <thead className="bg-slate-50/60 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">User ID</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Approval</th>
                  <th className="px-6 py-4">Branch</th>
                  <th className="px-6 py-4">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">No cashiers found.</td></tr>
                )}
                {rows.map((profile) => (
                  <tr key={profile.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4 font-semibold">{profile.full_name || "No name"}</td>
                    <td className="px-6 py-4 text-xs text-slate-500 font-mono">{profile.id.slice(0, 8)}...</td>
                    <td className="px-6 py-4">
                      <select value={profile.role} disabled={saving === profile.id}
                        onChange={(e) => updateProfile(profile.id, { role: e.target.value as Role })}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-600">
                        <option value="cashier">cashier</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      {profile.role === "cashier" ? (
                        <button disabled={saving === profile.id}
                          onClick={() => updateProfile(profile.id, { is_approved: !profile.is_approved })}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg ${profile.is_approved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {profile.is_approved ? "Approved" : "Approve"}
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <select value={profile.branch_id || ""} disabled={saving === profile.id}
                        onChange={(e) => updateProfile(profile.id, { branch_id: e.target.value || null })}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-600">
                        <option value="">Unassigned</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(profile.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-slate-100">
              {!loading && rows.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-400">No cashiers found.</p>
              )}
              {rows.map((profile) => (
                <div key={profile.id} className="px-4 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{profile.full_name || "No name"}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{profile.id.slice(0, 8)}</p>
                    </div>
                    <span className="text-xs text-slate-400">{new Date(profile.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select value={profile.role} disabled={saving === profile.id}
                      onChange={(e) => updateProfile(profile.id, { role: e.target.value as Role })}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600">
                      <option value="cashier">cashier</option>
                      <option value="admin">admin</option>
                    </select>
                    <select value={profile.branch_id || ""} disabled={saving === profile.id}
                      onChange={(e) => updateProfile(profile.id, { branch_id: e.target.value || null })}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-600">
                      <option value="">Unassigned</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    {profile.role === "cashier" && (
                      <button disabled={saving === profile.id}
                        onClick={() => updateProfile(profile.id, { is_approved: !profile.is_approved })}
                        className={`px-3 py-2 text-xs font-bold rounded-xl ${profile.is_approved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {profile.is_approved ? "Approved" : "Approve"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <PaginationControls
            currentPage={effectivePage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={totalProfiles}
            itemLabel="staff members"
            onPageChange={(nextPage) => {
              setPage(nextPage);
            }}
          />
        </section>

        <section className="mt-6 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="text-lg font-bold">Recent User Activities</h2>
            <p className="text-sm text-slate-500 mt-1">
              Admin-only view of recent login and logout events for all users.
            </p>
          </div>
          <div className="overflow-x-auto">
            {/* Desktop table */}
            <table className="hidden sm:table w-full text-left">
              <thead className="bg-slate-50/60 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Activity</th>
                  <th className="px-6 py-4">Branch</th>
                  <th className="px-6 py-4">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activityRows.length > 0 ? (
                  activityRows.map((activity) => (
                    <tr key={activity.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4 font-semibold">{activity.fullName}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${activity.activity_type === "login" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                          {activity.activity_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{activity.branchName}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{new Date(activity.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-400">No recent user activity found.</td></tr>
                )}
              </tbody>
            </table>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-slate-100">
              {activityRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">No recent user activity found.</p>
              ) : (
                activityRows.map((activity) => (
                  <div key={activity.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{activity.fullName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{activity.branchName} · {new Date(activity.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`shrink-0 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${activity.activity_type === "login" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                      {activity.activity_type}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <PaginationControls
            currentPage={effectiveActivityPage}
            totalPages={totalActivityPages}
            pageSize={activityPageSize}
            totalItems={totalActivities}
            itemLabel="activity logs"
            onPageChange={(nextPage) => {
              setActivityPage(nextPage);
            }}
          />
        </section>
      </main>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 text-slate-500 text-sm font-medium mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

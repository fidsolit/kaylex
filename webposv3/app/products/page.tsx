"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package, Pencil, Plus, Search, X } from "lucide-react";
import Sidebar from "../components/sidebar";
import { PaginationControls } from "../components/pagination-controls";
import { supabase } from "@/lib/supabaseClient";

interface ProductRow {
  id: string;
  name: string;
  barcode: string | null;
  product_type: "product" | "service";
  price: number;
  cost: number;
  low_stock_threshold: number | null;
  updated_at: string | null;
}

interface ProductFormState {
  productType: "product" | "service";
  name: string;
  barcode: string;
  price: string;
  cost: string;
  lowStockThreshold: string;
}

const EMPTY_PRODUCT_FORM: ProductFormState = {
  productType: "product",
  name: "",
  barcode: "",
  price: "",
  cost: "",
  lowStockThreshold: "10",
};

export default function ProductsPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] =
    useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const pageSize = 10;

  const loadProducts = useCallback(async (page = 1, searchTerm = "") => {
    setLoading(true);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("products")
      .select(
        "id, name, barcode, product_type, price, cost, low_stock_threshold, updated_at",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false })
      .order("name", { ascending: true });

    const trimmedSearch = searchTerm.trim();
    if (trimmedSearch) {
      query = query.or(
        `name.ilike.%${trimmedSearch}%,barcode.ilike.%${trimmedSearch}%`,
      );
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      alert(error.message);
      setRows([]);
      setTotalProducts(0);
      setLoading(false);
      return;
    }

    setRows((data as ProductRow[]) ?? []);
    setTotalProducts(count ?? 0);
    setLoading(false);
  }, []);

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
      await loadProducts(1, "");
    };

    init();
  }, [loadProducts, router]);

  useEffect(() => {
    if (checkingAuth) return;
    const timeoutId = window.setTimeout(() => {
      void loadProducts(currentPage, search);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [checkingAuth, currentPage, loadProducts, search]);

  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);

  const totalInventoryValue = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.cost || 0), 0),
    [rows],
  );

  const openAddModal = () => {
    setEditingProductId(null);
    setProductForm(EMPTY_PRODUCT_FORM);
    setIsModalOpen(true);
  };

  const openEditModal = (product: ProductRow) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      productType: product.product_type,
      barcode: product.barcode ?? "",
      price: Number(product.price).toString(),
      cost: Number(product.cost).toString(),
      lowStockThreshold: String(product.low_stock_threshold ?? 10),
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setEditingProductId(null);
    setProductForm(EMPTY_PRODUCT_FORM);
    setIsModalOpen(false);
  };

  const handleSaveProduct = async () => {
    const trimmedName = productForm.name.trim();
    const trimmedBarcode = productForm.barcode.trim();
    const parsedPrice = Number.parseFloat(productForm.price);
    const parsedCost = Number.parseFloat(productForm.cost);
    const parsedLowStockThreshold =
      productForm.productType === "service"
        ? 0
        : Number.parseInt(productForm.lowStockThreshold, 10);

    if (!trimmedName) {
      alert("Product name is required.");
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      alert("Please enter a valid price.");
      return;
    }

    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      alert("Please enter a valid cost.");
      return;
    }

    if (
      !Number.isFinite(parsedLowStockThreshold) ||
      parsedLowStockThreshold < 0
    ) {
      alert("Please enter a valid low stock threshold.");
      return;
    }

    setSaving(true);

    const payload = {
      name: trimmedName,
      barcode: trimmedBarcode || null,
      product_type: productForm.productType,
      price: parsedPrice,
      cost: parsedCost,
      low_stock_threshold: parsedLowStockThreshold,
      updated_at: new Date().toISOString(),
    };

    const result = editingProductId
      ? await supabase
          .from("products")
          .update(payload)
          .eq("id", editingProductId)
      : await supabase.from("products").insert([payload]);

    if (result.error) {
      if (result.error.code === "23505") {
        alert("Barcode already exists. Please use a unique barcode.");
      } else if (result.error.code === "42703") {
        alert("Products schema is outdated. Run database_setup.sql first.");
      } else {
        alert(result.error.message);
      }
      setSaving(false);
      return;
    }

    closeModal();
    await loadProducts(currentPage, search);
    setSaving(false);
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
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Products</h1>
            <p className="mt-1 text-sm text-slate-500 hidden sm:block">
              Manage your products, services, pricing, and barcode data.
            </p>
          </div>
          {/* <button
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 font-semibold text-white text-sm w-full sm:w-auto"
          >
            <Plus size={16} />
            Add Item
          </button> */}
        </header>

        <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile
            label="Products On Page"
            value={rows.length.toString()}
            icon={<Package size={18} />}
          />
          <StatTile
            label="Total Products"
            value={totalProducts.toString()}
            icon={<Package size={18} />}
          />
          <StatTile
            label="Page Cost Value"
            value={`₱${totalInventoryValue.toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
            icon={<Package size={18} />}
          />
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
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
                placeholder="Search product name or barcode..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {/* Desktop table */}
            <table className="hidden sm:table w-full text-left">
              <thead className="bg-slate-50/60 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-4">Product</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Barcode</th>
                  <th className="px-6 py-4">Price</th>
                  <th className="px-6 py-4">Cost</th>
                  <th className="px-6 py-4">Low Stock</th>
                  <th className="px-6 py-4">Updated</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-10 text-center text-slate-400"
                    >
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-10 text-center text-slate-400"
                    >
                      No products found.
                    </td>
                  </tr>
                ) : (
                  rows.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50/60">
                      <td className="px-6 py-4 font-semibold">
                        {product.name}
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold uppercase text-slate-600">
                          {product.product_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">
                        {product.barcode || "-"}
                      </td>
                      <td className="px-6 py-4">
                        ₱{Number(product.price).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        ₱{Number(product.cost).toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        {product.low_stock_threshold ?? 0}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {product.updated_at
                          ? new Date(product.updated_at).toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openEditModal(product)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-slate-100">
              {loading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : rows.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  No products found.
                </p>
              ) : (
                rows.map((product) => (
                  <div
                    key={product.id}
                    className="px-4 py-4 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {product.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">
                        {product.barcode || "No barcode"}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                          {product.product_type}
                        </span>
                        <span className="text-xs text-slate-600">
                          ₱{Number(product.price).toFixed(2)}
                        </span>
                        <span className="text-xs text-slate-400">
                          cost ₱{Number(product.cost).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => openEditModal(product)}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <PaginationControls
            currentPage={effectivePage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={totalProducts}
            itemLabel="products"
            onPageChange={(page) => setCurrentPage(page)}
          />
        </section>

        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-sm">
            <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 sm:p-8 shadow-2xl max-h-[95vh] overflow-y-auto">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  {editingProductId ? "Edit Product" : "Add Product"}
                </h2>
                <button
                  onClick={closeModal}
                  className="rounded-full p-2 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <input
                  placeholder="Product name"
                  value={productForm.name}
                  onChange={(e) =>
                    setProductForm((current) => ({
                      ...current,
                      name: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4"
                />
                <select
                  value={productForm.productType}
                  onChange={(e) =>
                    setProductForm((current) => ({
                      ...current,
                      productType: e.target.value as "product" | "service",
                      lowStockThreshold:
                        e.target.value === "service"
                          ? "0"
                          : current.lowStockThreshold || "10",
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <option value="product">Product</option>
                  <option value="service">Service</option>
                </select>
                <input
                  placeholder={
                    productForm.productType === "service"
                      ? "Barcode (optional)"
                      : "Barcode"
                  }
                  value={productForm.barcode}
                  onChange={(e) =>
                    setProductForm((current) => ({
                      ...current,
                      barcode: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Selling price"
                  value={productForm.price}
                  onChange={(e) =>
                    setProductForm((current) => ({
                      ...current,
                      price: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unit cost"
                  value={productForm.cost}
                  onChange={(e) =>
                    setProductForm((current) => ({
                      ...current,
                      cost: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4"
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Low stock threshold"
                  value={productForm.lowStockThreshold}
                  onChange={(e) =>
                    setProductForm((current) => ({
                      ...current,
                      lowStockThreshold: e.target.value,
                    }))
                  }
                  disabled={productForm.productType === "service"}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  onClick={handleSaveProduct}
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-bold text-white disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : null}
                  {editingProductId ? "Update Product" : "Save Product"}
                </button>
              </div>
            </div>
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
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

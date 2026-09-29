"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  MoreVertical,
  Plus,
  Printer,
  Search,
  X,
} from "lucide-react";
import Sidebar from "../components/sidebar";

// --- Types ---
interface Sale {
  id: string;
  total: number;
  unit_cost_total: number;
  created_at: string;
  receipt_no: string | null;
  status: "saved" | "completed" | "void";
  user_id: string | null;

  profiles?:
    | {
        full_name: string | null;
      }
    | {
        full_name: string | null;
      }[]
    | null;
}

interface CustomerCredit {
  id: string;
  customer_name: string;
  contact_number: string | null;
  amount: number;
  note: string | null;
  promise_to_pay_date: string | null;
  is_paid: boolean;
  payment_status: "pending" | "paid" | "overdue";
  created_at: string;
}

interface ProductCatalogItem {
  id: string;
  name: string;
  price: number;
  cost: number;
  barcode: string | null;
  product_type: "product" | "service";
}

interface CartItem extends ProductCatalogItem {
  quantity: number;
}

interface InventoryForSale {
  id: string;
  product_id: string;
  stock: number;
}

interface SaleItemCostRow {
  sale_id: string;
  quantity: number;
  unit_cost: number | null;
}

interface SaleItemForVoid {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number | null;
  products:
    | {
        product_type: "product" | "service" | null;
      }
    | {
        product_type: "product" | "service" | null;
      }[]
    | null;
}

interface SaleDetailLineItem {
  id: string;
  product_id: string;
  quantity: number;
  price: number;
  line_subtotal: number;
  unit_cost: number | null;
  note: string | null;
  products:
    | {
        name: string;
        barcode: string | null;
      }
    | {
        name: string;
        barcode: string | null;
      }[]
    | null;
}

interface SaleDetail {
  id: string;
  receipt_no: string | null;
  created_at: string;
  status: "saved" | "completed" | "void";
  total: number;
  subtotal: number | null;
  discount_amount: number | null;
  tax: number | null;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  payments:
    | {
        method: string | null;
        amount: number;
        status: string | null;
        amount_tendered: number | null;
        change_amount: number | null;
      }[]
    | null;
  cashier_profile?:
    | {
        full_name: string | null;
      }
    | {
        full_name: string | null;
      }[]
    | null;
  voided_by_profile: {
    full_name: string | null;
  } | null;
  restored_items: Array<{
    id: string;
    productName: string;
    quantity: number;
    created_at: string;
    note: string | null;
  }>;
  items: Array<{
    id: string;
    productName: string;
    barcode: string | null;
    quantity: number;
    price: number;
    unit_cost: number | null;
    line_subtotal: number;
    note: string | null;
  }>;
}

interface LowStockItem {
  id: string;
  stock: number;
  min_stock: number;
  products: {
    name: string;
    barcode: string | null;
  } | null;
}

type PaymentMethod = "cash" | "credit";
// type PaymentMethod= "cash";

export default function POSDashboard() {
  const router = useRouter();
  const pesoFormatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  });

  // --- States ---
  const [sales, setSales] = useState<Sale[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [todaySales, setTodaySales] = useState(0);
  const [todaySalesCount, setTodaySalesCount] = useState(0);

  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"admin" | "cashier">("cashier");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submittingSale, setSubmittingSale] = useState(false);
  const [catalogItems, setCatalogItems] = useState<ProductCatalogItem[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [promiseToPayDate, setPromiseToPayDate] = useState("");
  const [submittingCredit, setSubmittingCredit] = useState(false);
  const [creditFeatureReady, setCreditFeatureReady] = useState(true);
  const [recentCredits, setRecentCredits] = useState<CustomerCredit[]>([]);
  const [dueCreditAlerts, setDueCreditAlerts] = useState<CustomerCredit[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [change, setchange] = useState<number>(0);
  const [selectedSaleDetail, setSelectedSaleDetail] =
    useState<SaleDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [recentTransactionsPage, setRecentTransactionsPage] = useState(1);
  const [recentTransactionsTotalCount, setRecentTransactionsTotalCount] =
    useState(0);
  const hasLoadedInitialDashboard = useRef(false);
  const lastLoadedRecentTransactionsPage = useRef(1);

  //payment  states
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashAmount, setCashAmount] = useState<string>("");
  const [saleCustomerName, setSaleCustomerName] = useState("");
  const [saleCustomerContact, setSaleCustomerContact] = useState("");
  const [saleCreditNote, setSaleCreditNote] = useState("");
  const [salePromiseToPayDate, setSalePromiseToPayDate] = useState("");
  const recentTransactionsPageSize = 5;

  // --- Keyboard shortcut refs ---
  const itemSearchRef = useRef<HTMLInputElement | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const cashInputRef = useRef<HTMLInputElement | null>(null);
  const transactionsTableRef = useRef<HTMLDivElement | null>(null);
  const lastCartItemQtyRef = useRef<HTMLInputElement | null>(null);

  // F7: complete sale without opening print dialog
  const [noPrint, setNoPrint] = useState(false);

  const resetSaleForm = useCallback(() => {
    setCart([]);
    setItemSearch("");
    setBarcodeInput("");
    setPaymentMethod("cash");
    setCashAmount("");
    setchange(0);
    setSaleCustomerName("");
    setSaleCustomerContact("");
    setSaleCreditNote("");
    setSalePromiseToPayDate("");
  }, []);

  const refreshDashboardData = useCallback(async () => {
    try {
      const { count: pCount } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });

      const { count: lCount } = await supabase
        .from("inventory")
        .select("*", { count: "exact", head: true })
        .lt("stock", 10);

      const { data: lowStockData } = await supabase
        .from("inventory")
        .select(
          `
          id,
          stock,
          min_stock,
          products (
            name,
            barcode
          )
        `,
        )
        .lte("stock", 10)
        .order("stock", { ascending: true })
        .limit(8);

      const { data: salesSummaryData, error: salesSummaryError } =
        await supabase.from("sales").select("id, total, created_at, status");

      const from = (recentTransactionsPage - 1) * recentTransactionsPageSize;
      const to = from + recentTransactionsPageSize - 1;
      const {
        data: salesData,
        error: salesError,
        count: salesCount,
      } = await supabase
        .from("sales")
        .select("id, total, created_at, receipt_no, status, user_id", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (salesSummaryError) {
        console.error(
          "Failed to fetch dashboard sales summary:",
          salesSummaryError.message,
        );
      }

      if (salesError) {
        console.error("Failed to fetch sales:", salesError.message);
      }

      if (pCount !== null) setTotalProducts(pCount);
      if (lCount !== null) setLowStockCount(lCount);
      if (salesCount !== null) setRecentTransactionsTotalCount(salesCount);
      if (lowStockData) {
        const normalizedLowStock = (
          lowStockData as {
            id: string;
            stock: number;
            min_stock: number;
            products:
              | { name: string; barcode: string | null }
              | { name: string; barcode: string | null }[]
              | null;
          }[]
        ).map((row) => ({
          id: row.id,
          stock: row.stock,
          min_stock: row.min_stock,
          products: Array.isArray(row.products)
            ? (row.products[0] ?? null)
            : row.products,
        }));
        setLowStockItems(normalizedLowStock);
      }

      if (salesData) {
        const rows = salesData as Omit<Sale, "unit_cost_total" | "profiles">[];
        const uniqueUserIds = Array.from(
          new Set(
            rows
              .map((sale) => sale.user_id)
              .filter((id): id is string => Boolean(id)),
          ),
        );
        let profileNameMap = new Map<string, string | null>();

        if (uniqueUserIds.length > 0) {
          const { data: profileRows, error: profileError } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", uniqueUserIds);
          if (profileError) {
            console.error(
              "Failed to fetch profile names:",
              profileError.message,
            );
          } else {
            profileNameMap = new Map(
              (
                (profileRows ?? []) as {
                  id: string;
                  full_name: string | null;
                }[]
              ).map((p) => [p.id, p.full_name]),
            );
          }
        }

        const recentSaleIds = rows.map((sale) => sale.id);
        let saleCostMap = new Map<string, number>();

        if (recentSaleIds.length > 0) {
          const { data: saleItemsCostData } = await supabase
            .from("sale_items")
            .select("sale_id, quantity, unit_cost")
            .in("sale_id", recentSaleIds);

          const saleItemsRows = (saleItemsCostData as SaleItemCostRow[]) ?? [];
          saleCostMap = saleItemsRows.reduce((acc, row) => {
            const lineCost =
              Number(row.unit_cost ?? 0) * Number(row.quantity ?? 0);
            const current = acc.get(row.sale_id) ?? 0;
            acc.set(row.sale_id, current + lineCost);
            return acc;
          }, new Map<string, number>());
        }

        setSales(
          rows.map((sale) => ({
            ...sale,
            unit_cost_total: saleCostMap.get(sale.id) ?? 0,
            profiles: sale.user_id
              ? { full_name: profileNameMap.get(sale.user_id) ?? null }
              : null,
          })),
        );

        const completedSales = (
          (salesSummaryData as {
            id: string;
            total: number;
            created_at: string;
            status: "saved" | "completed" | "void";
          }[]) ?? []
        ).filter((sale) => sale.status === "completed");
        setRevenue(
          completedSales.reduce((acc, sale) => acc + Number(sale.total), 0),
        );

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const todayCompleted = completedSales.filter(
          (sale) => new Date(sale.created_at) >= startOfDay,
        );
        setTodaySales(
          todayCompleted.reduce((acc, sale) => acc + Number(sale.total), 0),
        );
        setTodaySalesCount(todayCompleted.length);
      } else {
        setSales([]);
      }

      const { data: creditData, error: creditError } = await supabase
        .from("customer_credits")
        .select(
          "id, customer_name, contact_number, amount, note, promise_to_pay_date, is_paid, payment_status, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(10);

      if (creditError) {
        if (creditError.code === "42P01" || creditError.code === "42703") {
          setCreditFeatureReady(false);
        } else {
          console.error(
            "Failed to fetch customer credits:",
            creditError.message,
          );
        }
      } else if (creditData) {
        setCreditFeatureReady(true);
        setRecentCredits(creditData as CustomerCredit[]);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const next7Days = new Date(now);
        next7Days.setDate(next7Days.getDate() + 7);

        const dueSoon = (creditData as CustomerCredit[]).filter((credit) => {
          if (!credit.promise_to_pay_date || credit.is_paid) return false;
          const promiseDate = new Date(credit.promise_to_pay_date);
          return promiseDate >= now && promiseDate <= next7Days;
        });
        setDueCreditAlerts(dueSoon);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }
  }, [recentTransactionsPage]);

  // --- 1. Auth & Initial Data ---
  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/auth/login");
        return;
      }
      setCurrentUserId(session.user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_approved")
        .eq("id", session.user.id)
        .single();
      if (profile?.role === "cashier" && profile?.is_approved === false) {
        await supabase.auth.signOut();
        alert("Your cashier account is pending admin approval.");
        router.push("/auth/login");
        return;
      }
      if (profile?.role === "admin" || profile?.role === "cashier") {
        setUserRole(profile.role);
      }

      // Fetch a valid branch ID for new sales
      const { data: branch } = await supabase
        .from("branches")
        .select("id")
        .limit(1)
        .single();
      if (branch) setActiveBranchId(branch.id);

      setCheckingAuth(false);
      await refreshDashboardData();
      hasLoadedInitialDashboard.current = true;
      lastLoadedRecentTransactionsPage.current = 1;
    };
    init();
  }, [refreshDashboardData, router]);

  useEffect(() => {
    if (checkingAuth || !hasLoadedInitialDashboard.current) return;
    if (lastLoadedRecentTransactionsPage.current === recentTransactionsPage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      lastLoadedRecentTransactionsPage.current = recentTransactionsPage;
      void refreshDashboardData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [checkingAuth, recentTransactionsPage, refreshDashboardData]);

  // --- 3. Actions ---
  const loadCatalogItems = useCallback(async () => {
    if (!activeBranchId) return;
    const { data, error } = await supabase
      .from("inventory")
      .select(
        `
        stock,
        products (
          id,
          name,
          price,
          cost,
          barcode,
          product_type
        )
      `,
      )
      .eq("branch_id", activeBranchId)
      .gt("stock", 0)
      .order("updated_at", { ascending: false });

    const { data: serviceData, error: serviceError } = await supabase
      .from("products")
      .select("id, name, price, cost, barcode, product_type")
      .eq("product_type", "service")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed loading catalog:", error.message);
      return;
    }

    if (serviceError) {
      console.error("Failed loading services:", serviceError.message);
      return;
    }

    const rows = (data ?? []) as {
      stock: number;
      products:
        | {
            id: string;
            name: string;
            price: number;
            cost: number;
            barcode: string | null;
          }
        | {
            id: string;
            name: string;
            price: number;
            cost: number;
            barcode: string | null;
          }[]
        | null;
    }[];

    const stockedItems = rows
      .map((row) =>
        Array.isArray(row.products) ? row.products[0] : row.products,
      )
      .filter((p): p is ProductCatalogItem => Boolean(p));

    const serviceItems = ((serviceData ?? []) as ProductCatalogItem[]) ?? [];
    const mergedItems = [...stockedItems, ...serviceItems];
    const uniqueItems = Array.from(
      new Map(mergedItems.map((item) => [item.id, item])).values(),
    );

    setCatalogItems(uniqueItems);
  }, [activeBranchId]);

  const openNewSaleModal = useCallback(async () => {
    resetSaleForm();
    setIsModalOpen(true);
    await loadCatalogItems();
  }, [resetSaleForm, loadCatalogItems]);

  const ensureCustomerRecord = useCallback(
    async (
      branchId: string,
      userId: string,
      fullName: string,
      contact: string,
    ) => {
      const trimmedName = fullName.trim();
      const trimmedContact = contact.trim();

      if (!trimmedName) {
        return;
      }

      let existingCustomerId: string | null = null;

      if (trimmedContact) {
        const { data: contactMatch, error: contactMatchError } = await supabase
          .from("customers")
          .select("id")
          .eq("branch_id", branchId)
          .eq("contact_number", trimmedContact)
          .limit(1)
          .maybeSingle();

        if (contactMatchError && contactMatchError.code !== "PGRST116") {
          throw new Error(contactMatchError.message);
        }

        existingCustomerId = contactMatch?.id ?? null;
      }

      if (!existingCustomerId) {
        const { data: nameMatch, error: nameMatchError } = await supabase
          .from("customers")
          .select("id")
          .eq("branch_id", branchId)
          .ilike("full_name", trimmedName)
          .limit(1)
          .maybeSingle();

        if (nameMatchError && nameMatchError.code !== "PGRST116") {
          throw new Error(nameMatchError.message);
        }

        existingCustomerId = nameMatch?.id ?? null;
      }

      if (existingCustomerId) {
        return;
      }

      const { error: insertCustomerError } = await supabase
        .from("customers")
        .insert([
          {
            full_name: trimmedName,
            contact_number: trimmedContact || null,
            branch_id: branchId,
            created_by: userId,
          },
        ]);

      if (insertCustomerError) {
        throw new Error(insertCustomerError.message);
      }
    },
    [],
  );

  const addItemToCart = (item: ProductCatalogItem) => {
    setCart((current) => {
      const existing = current.find((c) => c.id === item.id);
      if (existing) {
        return current.map((c) =>
          c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...current, { ...item, quantity: 1 }];
    });
  };

  const handleBarcodeAdd = (code?: string) => {
    const resolvedCode = (code ?? barcodeInput).trim();
    if (!resolvedCode) return;
    const matched = catalogItems.find((item) => item.barcode === resolvedCode);
    if (!matched) {
      alert("Barcode not found in available items.");
      return;
    }
    addItemToCart(matched);
    setBarcodeInput("");
  };

  // Auto-add when barcode scanner finishes typing (scanners send chars very
  // fast then stop — 120 ms idle is enough to distinguish scanner from manual)
  const barcodeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBarcodeChange = (value: string) => {
    setBarcodeInput(value);
    if (barcodeDebounceRef.current) clearTimeout(barcodeDebounceRef.current);
    if (!value.trim()) return;
    barcodeDebounceRef.current = setTimeout(() => {
      handleBarcodeAdd(value.trim());
    }, 120);
  };

  const handleQuantityChange = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((current) => current.filter((c) => c.id !== productId));
      return;
    }
    setCart((current) =>
      current.map((c) => (c.id === productId ? { ...c, quantity } : c)),
    );
  };

  const cartSubtotal = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0,
  );

  const handleAddNewSale = useCallback(async () => {
    if (!activeBranchId || !currentUserId) {
      return alert("Missing branch or user context.");
    }
    if (cart.length === 0) {
      return alert("Add at least one item to cart.");
    }
    if (paymentMethod === "cash" && Number(cashAmount) < cartSubtotal) {
      return alert("Cash amount must cover the sale total.");
    }
    if (paymentMethod === "credit" && !saleCustomerName.trim()) {
      return alert("Customer name is required for credit sales.");
    }

    setSubmittingSale(true);

    const stockedCartItems = cart.filter(
      (item) => item.product_type === "product",
    );
    const cartProductIds = stockedCartItems.map((item) => item.id);
    let inventoryMap = new Map<string, InventoryForSale>();

    if (cartProductIds.length > 0) {
      const { data: inventoryRows, error: inventoryError } = await supabase
        .from("inventory")
        .select("id, product_id, stock")
        .eq("branch_id", activeBranchId)
        .in("product_id", cartProductIds);

      if (inventoryError) {
        alert(inventoryError.message);
        setSubmittingSale(false);
        return;
      }

      inventoryMap = new Map(
        ((inventoryRows ?? []) as InventoryForSale[]).map((row) => [
          row.product_id,
          row,
        ]),
      );
    }

    for (const item of stockedCartItems) {
      const inv = inventoryMap.get(item.id);
      if (!inv) {
        alert(`No inventory record found for "${item.name}".`);
        setSubmittingSale(false);
        return;
      }
      if (inv.stock < item.quantity) {
        alert(
          `Insufficient stock for "${item.name}". Available: ${inv.stock}, requested: ${item.quantity}.`,
        );
        setSubmittingSale(false);
        return;
      }
    }

    const { data: saleData, error } = await supabase
      .from("sales")
      .insert([
        {
          total: cartSubtotal,
          subtotal: cartSubtotal,
          net_total: cartSubtotal,
          status: "completed",
          branch_id: activeBranchId,
          user_id: currentUserId,
          notes:
            paymentMethod === "credit" && saleCustomerName.trim()
              ? `Credit sale for ${saleCustomerName.trim()}`
              : null,
        },
      ])
      .select("id")
      .single();

    if (error || !saleData) {
      alert(error?.message || "Failed creating sale.");
      setSubmittingSale(false);
      return;
    }

    const receiptNo = `RCPT-${saleData.id.slice(0, 8).toUpperCase()}`;
    const { error: receiptUpdateError } = await supabase
      .from("sales")
      .update({
        receipt_no: receiptNo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", saleData.id);

    if (receiptUpdateError) {
      alert(receiptUpdateError.message);
      setSubmittingSale(false);
      return;
    }

    const saleItemsPayload = cart.map((item) => ({
      sale_id: saleData.id,
      product_id: item.id,
      quantity: item.quantity,
      price: item.price,
      line_subtotal: Number(item.price) * item.quantity,
      net_line_total: Number(item.price) * item.quantity,
      unit_cost: Number(item.cost) || 0,
    }));

    const { error: saleItemsError } = await supabase
      .from("sale_items")
      .insert(saleItemsPayload);

    if (saleItemsError) {
      alert(saleItemsError.message);
      setSubmittingSale(false);
      return;
    }

    const { error: paymentError } = await supabase.from("payments").insert([
      {
        sale_id: saleData.id,
        method: paymentMethod,
        amount: cartSubtotal,
        amount_tendered: paymentMethod === "cash" ? Number(cashAmount || 0) : 0,
        change_amount: paymentMethod === "cash" ? Number(change || 0) : 0,
      },
    ]);

    if (paymentError) {
      alert(paymentError.message);
      setSubmittingSale(false);
      return;
    }

    if (paymentMethod === "credit") {
      try {
        await ensureCustomerRecord(
          activeBranchId,
          currentUserId,
          saleCustomerName,
          saleCustomerContact,
        );
      } catch (customerError) {
        alert(
          customerError instanceof Error
            ? customerError.message
            : "Failed to save customer record.",
        );
        setSubmittingSale(false);
        return;
      }

      const { error: creditEntryError } = await supabase
        .from("customer_credits")
        .insert([
          {
            customer_name: saleCustomerName.trim(),
            contact_number: saleCustomerContact.trim() || null,
            amount: cartSubtotal,
            note: saleCreditNote.trim() || null,
            promise_to_pay_date: salePromiseToPayDate || null,
            is_paid: false,
            payment_status: "pending",
            branch_id: activeBranchId,
            created_by: currentUserId,
          },
        ]);

      if (creditEntryError) {
        alert(creditEntryError.message);
        setSubmittingSale(false);
        return;
      }
    }

    for (const item of stockedCartItems) {
      const inv = inventoryMap.get(item.id)!;
      const newStock = inv.stock - item.quantity;
      const { error: updateInventoryError } = await supabase
        .from("inventory")
        .update({
          stock: newStock,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inv.id);

      if (updateInventoryError) {
        alert(
          `Sale created but failed to update stock for "${item.name}": ${updateInventoryError.message}`,
        );
        setSubmittingSale(false);
        return;
      }
    }

    const stockMovementPayload = stockedCartItems.map((item) => ({
      branch_id: activeBranchId,
      product_id: item.id,
      movement_type: "sale" as const,
      quantity: item.quantity,
      unit_cost: Number(item.cost) || 0,
      reference_type: "sale",
      reference_id: saleData.id,
      note: `Stock deducted from sale ${receiptNo}.`,
      created_by: currentUserId,
    }));

    if (stockMovementPayload.length > 0) {
      const { error: stockMovementError } = await supabase
        .from("stock_movements")
        .insert(stockMovementPayload);

      if (stockMovementError) {
        alert(
          `Sale completed but failed to save stock history: ${stockMovementError.message}`,
        );
      }
    }

    setIsModalOpen(false);
    resetSaleForm();
    await refreshDashboardData();
    // F7: skip print, just close silently
    if (!noPrint) {
      // future: auto-open print dialog here if needed
    }
    setNoPrint(false);
    setSubmittingSale(false);
  }, [
    activeBranchId,
    currentUserId,
    cart,
    paymentMethod,
    cashAmount,
    cartSubtotal,
    saleCustomerName,
    saleCustomerContact,
    saleCreditNote,
    salePromiseToPayDate,
    noPrint,
    resetSaleForm,
    refreshDashboardData,
    ensureCustomerRecord,
  ]);


  const filteredCatalogItems = catalogItems.filter((item) => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.barcode?.toLowerCase().includes(q)
    );
  });

  const handleAddCustomerCredit = async () => {
    if (!activeBranchId || !currentUserId) {
      return alert("Missing branch or user context.");
    }
    const amount = Number(creditAmount);
    if (!customerName.trim()) return alert("Customer name is required.");
    if (!Number.isFinite(amount) || amount <= 0) {
      return alert("Please enter a valid credit amount.");
    }

    setSubmittingCredit(true);
    const { error } = await supabase.from("customer_credits").insert([
      {
        customer_name: customerName.trim(),
        contact_number: customerContact.trim() || null,
        amount,
        note: creditNote.trim() || null,
        promise_to_pay_date: promiseToPayDate || null,
        is_paid: false,
        payment_status: "pending",
        branch_id: activeBranchId,
        created_by: currentUserId,
      },
    ]);

    if (error) {
      if (error.code === "42P01") {
        alert(
          "Customer credit table is missing. Run the role-and-credit migration first.",
        );
        setCreditFeatureReady(false);
      } else {
        alert(error.message);
      }
      setSubmittingCredit(false);
      return;
    }

    setIsCreditModalOpen(false);
    setCustomerName("");
    setCustomerContact("");
    setCreditAmount("");
    setCreditNote("");
    setPromiseToPayDate("");
    setSubmittingCredit(false);
    await refreshDashboardData();
  };

  const handleVoidSale = useCallback(async (saleId: string) => {
    if (!activeBranchId || !currentUserId) {
      alert("Missing branch or user context.");
      return;
    }

    const confirmed = window.confirm(
      "Void this transaction and return the sold items back to inventory?",
    );
    if (!confirmed) return;

    const { data: saleRow, error: saleError } = await supabase
      .from("sales")
      .select("id, status")
      .eq("id", saleId)
      .single();

    if (saleError) {
      alert(saleError.message);
      return;
    }

    if (saleRow?.status === "void") {
      alert("This sale is already voided.");
      return;
    }

    const { data: saleItemsData, error: saleItemsError } = await supabase
      .from("sale_items")
      .select(
        `
        id,
        product_id,
        quantity,
        unit_cost,
        products (
          product_type
        )
      `,
      )
      .eq("sale_id", saleId);

    if (saleItemsError) {
      alert(saleItemsError.message);
      return;
    }

    const saleItems = (saleItemsData as SaleItemForVoid[]) ?? [];
    const stockedSaleItems = saleItems.filter((item) => {
      const product = Array.isArray(item.products)
        ? (item.products[0] ?? null)
        : item.products;
      return product?.product_type !== "service";
    });
    const productIds = Array.from(
      new Set(
        stockedSaleItems
          .map((item) => item.product_id)
          .filter((productId): productId is string => Boolean(productId)),
      ),
    );

    if (productIds.length > 0) {
      const { data: inventoryRows, error: inventoryError } = await supabase
        .from("inventory")
        .select("id, product_id, stock")
        .eq("branch_id", activeBranchId)
        .in("product_id", productIds);

      if (inventoryError) {
        alert(inventoryError.message);
        return;
      }

      const inventoryMap = new Map(
        ((inventoryRows ?? []) as InventoryForSale[]).map((row) => [
          row.product_id,
          row,
        ]),
      );

      for (const item of stockedSaleItems) {
        const inventoryRecord = inventoryMap.get(item.product_id);
        if (!inventoryRecord) {
          alert(
            "Unable to restore inventory because a stock record is missing.",
          );
          return;
        }

        const restoredStock =
          Number(inventoryRecord.stock ?? 0) + Number(item.quantity ?? 0);

        const { error: updateInventoryError } = await supabase
          .from("inventory")
          .update({
            stock: restoredStock,
            updated_at: new Date().toISOString(),
          })
          .eq("id", inventoryRecord.id);

        if (updateInventoryError) {
          alert(updateInventoryError.message);
          return;
        }

        const { error: movementError } = await supabase
          .from("stock_movements")
          .insert([
            {
              branch_id: activeBranchId,
              product_id: item.product_id,
              movement_type: "void_restore",
              quantity: Number(item.quantity ?? 0),
              unit_cost: Number(item.unit_cost ?? 0),
              reference_type: "sale",
              reference_id: saleId,
              note: "Inventory restored from voided sale.",
              created_by: currentUserId,
            },
          ]);

        if (movementError) {
          alert(movementError.message);
          return;
        }
      }
    }

    const { error } = await supabase
      .from("sales")
      .update({
        status: "void",
        voided_at: new Date().toISOString(),
        voided_by: currentUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", saleId);

    if (error) {
      alert(error.message);
      return;
    }
    await refreshDashboardData();
  }, [activeBranchId, currentUserId, refreshDashboardData]);

  const viewSaleDetails = async (sale: Sale) => {
    setDetailsLoading(true);

    const { data: saleData, error: saleError } = await supabase
      .from("sales")
      .select(
        `
        id,
        receipt_no,
        created_at,
        status,
        total,
        subtotal,
        discount_amount,
        tax,
        notes,
        voided_at,
        voided_by,
        void_reason,
        cashier_profile:profiles!sales_user_id_fkey (
          full_name
        ),
        payments (
          method,
          amount,
          status,
          amount_tendered,
          change_amount
        )
      `,
      )
      .eq("id", sale.id)
      .single();

    if (saleError || !saleData) {
      alert(saleError?.message || "Failed to load transaction details.");
      setDetailsLoading(false);
      return;
    }

    const saleRow = saleData as Omit<
      SaleDetail,
      "items" | "restored_items" | "voided_by_profile"
    > & {
      voided_by: string | null;
    };

    const { data: saleItemsData, error: saleItemsError } = await supabase
      .from("sale_items")
      .select(
        `
        id,
        product_id,
        quantity,
        price,
        line_subtotal,
        unit_cost,
        note,
        products (
          name,
          barcode
        )
      `,
      )
      .eq("sale_id", sale.id)
      .order("created_at", { ascending: true });

    if (saleItemsError) {
      alert(saleItemsError.message);
      setDetailsLoading(false);
      return;
    }

    const items = ((saleItemsData ?? []) as SaleDetailLineItem[]).map(
      (item) => {
        const product = Array.isArray(item.products)
          ? (item.products[0] ?? null)
          : item.products;

        return {
          id: item.id,
          productName: product?.name || "Unknown item",
          barcode: product?.barcode ?? null,
          quantity: Number(item.quantity ?? 0),
          price: Number(item.price ?? 0),
          unit_cost: item.unit_cost,
          line_subtotal: Number(item.line_subtotal ?? 0),
          note: item.note,
        };
      },
    );

    let voidedByProfile: SaleDetail["voided_by_profile"] = null;
    if (saleRow.voided_by) {
      const { data: voidedByData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", saleRow.voided_by)
        .single();

      voidedByProfile =
        ((voidedByData ?? null) as { full_name: string | null } | null) ?? null;
    }

    let restoredItems: SaleDetail["restored_items"] = [];
    if (sale.status === "void") {
      const { data: restoredRows, error: restoredError } = await supabase
        .from("stock_movements")
        .select("id, product_id, quantity, created_at, note")
        .eq("reference_type", "sale")
        .eq("reference_id", sale.id)
        .eq("movement_type", "void_restore")
        .order("created_at", { ascending: true });

      if (restoredError) {
        alert(restoredError.message);
        setDetailsLoading(false);
        return;
      }

      const restoredProductIds = Array.from(
        new Set(
          ((restoredRows ?? []) as { product_id: string | null }[])
            .map((row) => row.product_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      let restoredProductMap = new Map<string, string>();
      if (restoredProductIds.length > 0) {
        const { data: restoredProducts } = await supabase
          .from("products")
          .select("id, name")
          .in("id", restoredProductIds);

        restoredProductMap = new Map(
          ((restoredProducts ?? []) as { id: string; name: string }[]).map(
            (row) => [row.id, row.name],
          ),
        );
      }

      restoredItems = (
        (restoredRows ?? []) as {
          id: string;
          product_id: string | null;
          quantity: number;
          created_at: string;
          note: string | null;
        }[]
      ).map((row) => ({
        id: row.id,
        productName: row.product_id
          ? (restoredProductMap.get(row.product_id) ?? "Unknown item")
          : "Unknown item",
        quantity: Number(row.quantity ?? 0),
        created_at: row.created_at,
        note: row.note,
      }));
    }

    setSelectedSaleDetail({
      ...(saleRow as Omit<
        SaleDetail,
        "items" | "restored_items" | "voided_by_profile"
      >),
      voided_by_profile: voidedByProfile,
      restored_items: restoredItems,
      items,
    });
    setDetailsLoading(false);
  };

  const closeSaleDetails = useCallback(() => {
    setSelectedSaleDetail(null);
    setDetailsLoading(false);
  }, []);

  // ─── Global keyboard shortcuts (F1–F11 + Escape) ────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Never steal keystrokes from regular text inputs/textareas
      const tag = (e.target as HTMLElement).tagName;
      const isTyping =
        (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") &&
        !["F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","Escape"].includes(e.key);
      if (isTyping) return;

      switch (e.key) {
        // F1 — Input Transaction (open New Sale)
        case "F1": {
          e.preventDefault();
          if (!isModalOpen) {
            void openNewSaleModal();
          }
          break;
        }

        // F2 — Product Details Pane (focus item search inside sale modal)
        case "F2": {
          e.preventDefault();
          if (isModalOpen) {
            itemSearchRef.current?.focus();
          } else {
            void openNewSaleModal().then(() => {
              setTimeout(() => itemSearchRef.current?.focus(), 50);
            });
          }
          break;
        }

        // F3 — Change Quantity (focus barcode/scan field)
        case "F3": {
          e.preventDefault();
          if (isModalOpen) {
            barcodeInputRef.current?.focus();
          }
          break;
        }

        // F4 — Apply Discount / switch to Credit payment
        case "F4": {
          e.preventDefault();
          if (isModalOpen && cart.length > 0) {
            setPaymentMethod("credit");
          }
          break;
        }

        // F5 — Look-up Transactions (close modal, scroll to table)
        case "F5": {
          e.preventDefault();
          if (isModalOpen) {
            setIsModalOpen(false);
            resetSaleForm();
          }
          setTimeout(() => {
            transactionsTableRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }, 100);
          break;
        }

        // F6 — Order Reserved (switch payment to Cash / toggle back)
        case "F6": {
          e.preventDefault();
          if (isModalOpen) {
            setPaymentMethod("cash");
          }
          break;
        }

        // F7 — AutoPay w/o Printing Receipt
        case "F7": {
          e.preventDefault();
          if (isModalOpen && cart.length > 0 && !submittingSale) {
            setNoPrint(true);
            void handleAddNewSale();
          }
          break;
        }

        // F8 — Process Order / Payments (focus cash input or submit)
        case "F8": {
          e.preventDefault();
          if (isModalOpen && cart.length > 0) {
            if (paymentMethod === "cash") {
              cashInputRef.current?.focus();
            } else {
              if (!submittingSale) void handleAddNewSale();
            }
          }
          break;
        }

        // F9 — View Pending Orders (scroll to transactions)
        case "F9": {
          e.preventDefault();
          transactionsTableRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
          break;
        }

        // F10 — Void last transaction (admin only)
        case "F10": {
          e.preventDefault();
          if (userRole === "admin" && sales.length > 0) {
            const lastNonVoided = sales.find((s) => s.status !== "void");
            if (lastNonVoided) void handleVoidSale(lastNonVoided.id);
          }
          break;
        }

        // F11 — Log Off User
        case "F11": {
          e.preventDefault();
          const confirmed = window.confirm("Log off and return to login?");
          if (confirmed) {
            void supabase.auth.signOut().then(() => {
              router.push("/auth/login");
            });
          }
          break;
        }

        // Escape — close any open modal
        case "Escape": {
          if (isModalOpen) {
            setIsModalOpen(false);
            resetSaleForm();
          }
          if (isCreditModalOpen) setIsCreditModalOpen(false);
          if (selectedSaleDetail) closeSaleDetails();
          break;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    isModalOpen,
    isCreditModalOpen,
    selectedSaleDetail,
    cart,
    submittingSale,
    paymentMethod,
    userRole,
    sales,
    openNewSaleModal,
    resetSaleForm,
    handleAddNewSale,
    handleVoidSale,
    closeSaleDetails,
    router,
  ]);
  // ────────────────────────────────────────────────────────────────────────────

  const printSaleDetails = (sale: SaleDetail) => {
    const cashierName =
      (Array.isArray(sale.cashier_profile)
        ? sale.cashier_profile[0]?.full_name
        : sale.cashier_profile?.full_name) || "-";
    const voidedByName = sale.voided_by_profile?.full_name || "-";
    const paymentSummary =
      sale.payments && sale.payments.length > 0
        ? sale.payments
            .map(
              (payment) =>
                `${payment.method || "Unknown"} ${pesoFormatter.format(Number(payment.amount ?? 0))}`,
            )
            .join("<br />")
        : "No payments recorded";
    const itemRows = sale.items
      .map(
        (item) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${item.productName}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${item.quantity}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${pesoFormatter.format(item.price)}</td>
            
          </tr>
        `,
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      alert("Unable to open print preview.");
      return;
    }
//this is the code that generates the HTML for the print preview of the sale details. It creates a new window and writes the HTML content into it, including styles and the sale information. The receipt includes the transaction details, items sold, payments made, and totals. After writing the content, it closes the document, focuses on the new window, and triggers the print dialog.
// 1. Write the initial document structure with a unique ID container
printWindow.document.write(`
  <html>
    <head>
      <title>Transaction ${sale.receipt_no || sale.id}</title>
      <style id="dynamic-page-size">
        /* Fallback size before measurement completes */
        @page { size: 58mm auto; margin: 0mm; }
      </style>
      <style>
        html, body { 
          font-family: "Courier New", monospace; 
          color: #000000; 
          margin: 0; 
          padding: 0; 
          background: #ffffff; 
          -webkit-print-color-adjust: exact;
        }
        
        /* Rigidly lock width down to Xprinter 58mm printable area */
        .receipt { 
          width: 48mm; 
          margin: 0; 
          padding: 2mm 1mm;
          box-sizing: border-box;
          display: inline-block; /* Essential: wraps height exactly to child boundaries */
        }
        
        .center { text-align: center; }
        .muted { color: #000000; font-size: 11px; }
        .divider { border-top: 1px dashed #000000; margin: 8px 0; }
        
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { padding: 3px 0; vertical-align: top; }
        th { text-align: left; font-weight: bold; }
        .right { text-align: right; }
        
        .summary-row { display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px; gap: 4px; }
        .total { font-weight: 700; font-size: 13px; }
      </style>
    </head>
    <body>
      <div id="receipt-container" class="receipt">
        <div class="center">
          <h4 style="margin:0; font-size: 13px;">FCODES COMPUTER SUPPLY AND SERVICES</h4>
          <div class="muted">Transaction Receipt</div>
        </div>
        <div class="divider"></div>
        <div class="summary-row"><span>Receipt</span><span>${sale.receipt_no || "-"}</span></div>
        <div class="summary-row"><span>Sale ID</span><span>${sale.id.slice(0, 8)}</span></div>
        <div class="summary-row"><span>Date</span><span>${new Date(sale.created_at).toLocaleString([], {hour: '2-digit', minute:'2-digit', year: 'numeric', month: 'numeric', day: 'numeric'})}</span></div>
        <div class="summary-row"><span>Cashier</span><span>${cashierName}</span></div>
        <div class="summary-row"><span>Status</span><span>${sale.status.toUpperCase()}</span></div>
        ${
          sale.status === "void"
            ? `
        <div class="summary-row"><span>Voided At</span><span>${sale.voided_at ? new Date(sale.voided_at).toLocaleString([], {hour: '2-digit', minute:'2-digit'}) : "-"}</span></div>
        <div class="summary-row"><span>Voided By</span><span>${voidedByName}</span></div>
        `
            : ""
        }
        <div class="divider"></div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th class="right" style="width: 24px;">Qty</th>
              <th class="right" style="width: 55px;">Amt</th>
            </tr>
          </thead>
           <tbody>${itemRows}</tbody>
        </table>
        <div class="divider"></div>
        <div class="summary-row"><span>Payments</span><span></span></div>
        <div class="muted" style="margin-bottom: 4px;">${paymentSummary}</div>
        <div class="divider"></div>
        <div class="summary-row"><span>Subtotal</span><span>${pesoFormatter.format(Number(sale.subtotal ?? sale.total))}</span></div>
        <div class="summary-row"><span>Discount</span><span>${pesoFormatter.format(Number(sale.discount_amount ?? 0))}</span></div>
        <div class="summary-row"><span>Tax</span><span>${pesoFormatter.format(Number(sale.tax ?? 0))}</span></div>
        <div class="summary-row total"><span>Total</span><span>${pesoFormatter.format(Number(sale.total ?? 0))}</span></div>
        ${
          sale.notes
            ? `<div class="divider"></div><div class="muted">Note: ${sale.notes}</div>`
            : ""
        }
      </div>
    </body>
  </html>
`);

printWindow.document.close();
printWindow.focus();

// 2. Measure content pixel height and calculate required sheet size
const container = printWindow.document.getElementById('receipt-container');
const styleTag = printWindow.document.getElementById('dynamic-page-size');

if (container && styleTag) {
  // Capture precise height including padding boundaries
  const pixelHeight = container.offsetHeight; 
  
  // Standard display printing translates 96 pixels to 1 inch (25.4 millimeters)
  // Adding an explicit 4mm safety margin prevents early cutoffs or rounding hiccups
  const mmHeight = Math.ceil((pixelHeight * 25.4) / 96) + 4; 
  
  // 3. Re-inject the explicit dynamic dimensions right before triggering print
  styleTag.innerHTML = `@page { size: 58mm \${mmHeight}mm; margin: 0mm; }`;
}

// 4. Fire print pipeline
printWindow.print();

  };

  if (checkingAuth) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  const totalRecentTransactionPages = Math.max(
    1,
    Math.ceil(recentTransactionsTotalCount / recentTransactionsPageSize),
  );

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar onNewSaleClick={openNewSaleModal} />

      <main className="flex-1 overflow-y-auto p-4 pt-20 pb-20 md:pt-10 md:p-10 md:pb-20">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">Dashboard Overview</h2>
            <p className="text-slate-500 mt-1 text-sm">Real-time performance metrics</p>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button
            onClick={openNewSaleModal}
            className="flex-1 sm:flex-none px-5 py-2.5 rounded-2xl font-bold bg-blue-600 text-white shadow-xl hover:scale-105 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <Plus size={18} /> New Sale
          </button>
          {creditFeatureReady && (
            <button
              onClick={() => setIsCreditModalOpen(true)}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-2xl font-bold bg-amber-500 text-white shadow-xl hover:scale-105 transition-all text-sm"
            >
              Add Credit
            </button>
          )}
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8">
          <StatCard
            label="Total Revenue"
            value={`₱${revenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
          />
          <StatCard
            label="Today's Sales"
            value={`₱${todaySales.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
          />
          <StatCard
            label="Today's Transactions"
            value={todaySalesCount.toString()}
          />
          {userRole === "admin" ? (
            <StatCard
              label="Low Stock Alert"
              value={lowStockCount.toString()}
              isAlert={lowStockCount > 0}
            />
          ) : (
            <StatCard label="Total Products" value={totalProducts.toString()} />
          )}
        </div>

        {/* Recent Transactions Table */}
        <div ref={transactionsTableRef} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-5 sm:p-8 border-b border-slate-50">
            <h3 className="text-base sm:text-lg font-bold">Recent Transactions</h3>
            <p className="text-sm text-slate-500 mt-1 hidden sm:block">
              Latest sales recorded in your POS, including unit cost per
              transaction.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-slate-400 text-sm bg-slate-50/50">
                  <th className="px-8 py-4 font-medium">Sale ID</th>
                  <th className="px-8 py-4 font-medium">Receipt</th>
                  <th className="px-8 py-4 font-medium">Cashier</th>
                  <th className="px-8 py-4 font-medium">Date & Time</th>
                  <th className="px-8 py-4 font-medium">Total Amount</th>
                  <th className="px-8 py-4 font-medium">Status</th>
                  <th className="px-8 py-4 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sales.length > 0 ? (
                  sales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-8 py-4 text-sm font-medium">
                        #{sale.id.slice(0, 8)}
                      </td>
                      <td className="px-8 py-4 text-sm text-slate-500">
                        {sale.receipt_no || "-"}
                      </td>
                      <td className="px-8 py-4 text-sm text-slate-500">
                        {(Array.isArray(sale.profiles)
                          ? sale.profiles[0]?.full_name
                          : sale.profiles?.full_name) ||
                          (sale.user_id
                            ? `User ${sale.user_id.slice(0, 8)}`
                            : "-")}
                      </td>
                      <td className="px-8 py-4 text-sm text-slate-500">
                        {new Date(sale.created_at).toLocaleString()}
                      </td>
                      <td className="px-8 py-4 font-bold text-sm text-emerald-600">
                        ₱{sale.total.toFixed(2)}
                      </td>
                      <td className="px-8 py-4 text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-bold ${
                            sale.status === "void"
                              ? "bg-rose-100 text-rose-700"
                              : sale.status === "saved"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {sale.status}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => viewSaleDetails(sale)}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                          >
                            <Eye size={14} />
                            Details
                          </button>
                          {sale.status !== "void" && userRole === "admin" ? (
                            <button
                              onClick={() => handleVoidSale(sale.id)}
                              className="text-xs font-semibold px-3 py-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                            >
                              Void
                            </button>
                          ) : (
                            <MoreVertical
                              size={16}
                              className="ml-auto text-slate-400 inline"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-8 py-10 text-center text-slate-400"
                    >
                      No transactions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {recentTransactionsTotalCount > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-100 px-8 py-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-slate-500">
                Showing{" "}
                <span className="font-semibold text-slate-700">
                  {(recentTransactionsPage - 1) * recentTransactionsPageSize +
                    1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-slate-700">
                  {Math.min(
                    recentTransactionsPage * recentTransactionsPageSize,
                    recentTransactionsTotalCount,
                  )}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-700">
                  {recentTransactionsTotalCount}
                </span>{" "}
                transactions
              </p>
              <div className="flex items-center gap-2 self-start md:self-auto">
                <button
                  type="button"
                  onClick={() =>
                    setRecentTransactionsPage((page) => Math.max(1, page - 1))
                  }
                  disabled={recentTransactionsPage === 1}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <span className="text-sm font-semibold text-slate-600">
                  Page {recentTransactionsPage} of {totalRecentTransactionPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setRecentTransactionsPage((page) =>
                      Math.min(totalRecentTransactionPages, page + 1),
                    )
                  }
                  disabled={
                    recentTransactionsPage >= totalRecentTransactionPages
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50">
              <h3 className="text-lg font-bold">Promise-to-Pay Due Alerts</h3>
              <p className="text-sm text-slate-500">
                Credits due today and within 7 days.
              </p>
            </div>
            <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
              {dueCreditAlerts.length > 0 ? (
                dueCreditAlerts.map((credit) => (
                  <div
                    key={credit.id}
                    className="border border-amber-100 bg-amber-50 rounded-xl p-3"
                  >
                    <p className="font-semibold text-sm">
                      {credit.customer_name}
                    </p>
                    <p className="text-xs text-slate-600">
                      ₱{Number(credit.amount).toFixed(2)} - due{" "}
                      {credit.promise_to_pay_date
                        ? new Date(
                            credit.promise_to_pay_date,
                          ).toLocaleDateString()
                        : "-"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">
                  No upcoming due promises.
                </p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50">
              <h3 className="text-lg font-bold">Low Stock Notifications</h3>
              <p className="text-sm text-slate-500">
                Items currently at low stock level.
              </p>
            </div>
            <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
              {lowStockItems.length > 0 ? (
                lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="border border-rose-100 bg-rose-50 rounded-xl p-3"
                  >
                    <p className="font-semibold text-sm">
                      {item.products?.name || "Unknown item"}
                    </p>
                    <p className="text-xs text-slate-600">
                      Stock: {item.stock} / Threshold: {item.min_stock ?? 10}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No low-stock alerts.</p>
              )}
            </div>
          </div>
        </div>

        {creditFeatureReady && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mt-8">
            <div className="p-8 border-b border-slate-50">
              <h3 className="text-lg font-bold">Recent Customer Credit</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-400 text-sm bg-slate-50/50">
                    <th className="px-8 py-4 font-medium">Customer</th>
                    <th className="px-8 py-4 font-medium">Amount</th>
                    <th className="px-8 py-4 font-medium">Promise Date</th>
                    <th className="px-8 py-4 font-medium">Status</th>
                    <th className="px-8 py-4 font-medium">Note</th>
                    <th className="px-8 py-4 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentCredits.length > 0 ? (
                    recentCredits.map((credit) => (
                      <tr key={credit.id}>
                        <td className="px-8 py-4 text-sm font-medium">
                          {credit.customer_name}
                        </td>
                        <td className="px-8 py-4 text-sm text-amber-600 font-bold">
                          ₱{Number(credit.amount).toFixed(2)}
                        </td>
                        <td className="px-8 py-4 text-sm text-slate-500">
                          {credit.promise_to_pay_date
                            ? new Date(
                                credit.promise_to_pay_date,
                              ).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="px-8 py-4 text-sm">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-bold ${
                              credit.payment_status === "paid"
                                ? "bg-emerald-100 text-emerald-700"
                                : credit.payment_status === "overdue"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {credit.payment_status}
                          </span>
                        </td>
                        <td className="px-8 py-4 text-sm text-slate-500">
                          {credit.note || "-"}
                        </td>
                        <td className="px-8 py-4 text-sm text-slate-500">
                          {new Date(credit.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-8 py-10 text-center text-slate-400"
                      >
                        No customer credit records yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* --- NEW SALE MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 w-full sm:max-w-5xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 sm:zoom-in duration-200 max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">New Sale</h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  resetSaleForm();
                }}
                className="p-2 hover:bg-slate-100 rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-3">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    autoFocus
                    ref={itemSearchRef}
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Search item name or barcode"
                    className="w-full p-3 pl-9 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <input
                  ref={barcodeInputRef}
                  value={barcodeInput}
                  onChange={(e) => handleBarcodeChange(e.target.value)}
                  placeholder="Scan barcode (auto-adds)"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (barcodeDebounceRef.current) {
                        clearTimeout(barcodeDebounceRef.current);
                        barcodeDebounceRef.current = null;
                      }
                      handleBarcodeAdd();
                    }
                  }}
                />
                <div className="max-h-80 overflow-y-auto border border-slate-100 rounded-xl">
                  {filteredCatalogItems.length > 0 ? (
                    filteredCatalogItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => addItemToCart(item)}
                        className="w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold">{item.name}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {item.product_type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {item.barcode || "No barcode"} - ₱
                          {Number(item.price).toFixed(2)}
                        </p>
                      </button>
                    ))
                  ) : (
                    <p className="p-4 text-sm text-slate-400">
                      No matching products.
                    </p>
                  )}
                </div>
              </div>
              {/* //cart code */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <h3 className="font-bold mb-3">Cart</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {cart.length > 0 ? (
                    cart.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white rounded-lg p-3 border border-slate-100"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-medium text-sm">{item.name}</p>
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">
                              {item.product_type}
                            </p>
                          </div>
                          <p className="text-sm font-bold">
                            ₱{(Number(item.price) * item.quantity).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-500">
                            ₱{Number(item.price).toFixed(2)} each
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                handleQuantityChange(item.id, item.quantity - 1)
                              }
                              className="h-7 w-7 rounded bg-slate-100"
                            >
                              -
                            </button>
                            <span className="text-sm w-6 text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                handleQuantityChange(item.id, item.quantity + 1)
                              }
                              className="h-7 w-7 rounded bg-slate-100"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">Cart is empty.</p>
                  )}
                </div>
                <div className="border-t border-slate-200 mt-4 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>₱{cartSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>₱{cartSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="space-y-2">
                      {/* <label className="block text-sm font-semibold text-slate-600">
                        Payment Method
                      </label> */}
                      {/* <select
                        value={paymentMethod}
                        disabled={true}
                        onChange={(e) =>
                          setPaymentMethod(e.target.value as PaymentMethod)
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none transition-all focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="cash">Cash</option>
                        <option value="credit">Credit</option>
                      </select> */}
                    </div>

                    {paymentMethod === "cash" ? (
                      <>
                        <div className="flex justify-between font-bold text-lg">
                          <span>Cash</span>
                          <input
                            ref={cashInputRef}
                            type="number"
                            step="any"
                            placeholder="0.00"
                            value={cashAmount}
                            onKeyDown={(e) => {
                              if (["e", "E", "+", "-"].includes(e.key)) {
                                e.preventDefault();
                              }
                            }}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "" || /^\d*\.?\d*$/.test(val)) {
                                setCashAmount(val);
                                setchange(Number(val) - cartSubtotal);
                              }
                            }}
                            className={`w-50 rounded-xl border bg-slate-50 p-2 outline-none transition-all focus:ring-2 ${
                              Number(cashAmount) < cartSubtotal &&
                              cashAmount !== ""
                                ? "border-red-500 focus:ring-red-200"
                                : "border-slate-200 focus:ring-blue-600"
                            }`}
                          />
                        </div>
                        <div className="flex justify-between font-bold text-lg">
                          <span>Change</span>
                          <span>PHP {change.toFixed(2)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <input
                          placeholder="Customer name"
                          value={saleCustomerName}
                          onChange={(e) => setSaleCustomerName(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <input
                          placeholder="Contact number (optional)"
                          value={saleCustomerContact}
                          onChange={(e) =>
                            setSaleCustomerContact(e.target.value)
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <textarea
                          placeholder="Credit note (optional)"
                          value={saleCreditNote}
                          onChange={(e) => setSaleCreditNote(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <div>
                          <label className="mb-1 block text-sm font-semibold text-slate-600">
                            Promise to Pay Date (optional)
                          </label>
                          <input
                            type="date"
                            value={salePromiseToPayDate}
                            onChange={(e) =>
                              setSalePromiseToPayDate(e.target.value)
                            }
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                        <p className="text-xs text-slate-500">
                          If this customer is not registered yet, they will be
                          added automatically when the sale is completed.
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    disabled={
                      submittingSale ||
                      cart.length === 0 ||
                      (paymentMethod === "cash" &&
                        Number(cashAmount) < cartSubtotal) ||
                      (paymentMethod === "credit" && !saleCustomerName.trim())
                    }
                    onClick={handleAddNewSale}
                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
                  >
                    {submittingSale
                      ? "Processing..."
                      : paymentMethod === "credit"
                        ? "Complete Credit Sale"
                        : "Complete Sale"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreditModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 w-full sm:max-w-md shadow-2xl animate-in fade-in slide-in-from-bottom-4 sm:zoom-in duration-200 max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Add Customer Credit</h2>
              <button
                onClick={() => setIsCreditModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <input
                placeholder="Customer name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600"
              />
              <input
                placeholder="Contact number (e.g. +639171234567)"
                value={customerContact}
                onChange={(e) => setCustomerContact(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600"
              />
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600"
              />
              <textarea
                placeholder="Note (optional)"
                value={creditNote}
                onChange={(e) => setCreditNote(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600"
              />
              <div>
                <label className="text-sm font-bold text-slate-500 mb-1 block">
                  Promise to Pay Date (optional)
                </label>
                <input
                  type="date"
                  value={promiseToPayDate}
                  onChange={(e) => setPromiseToPayDate(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                disabled={submittingCredit}
                onClick={handleAddCustomerCredit}
                className="w-full py-4 bg-amber-500 text-white rounded-2xl font-bold hover:bg-amber-600 transition-all shadow-lg"
              >
                {submittingCredit ? "Saving..." : "Save Credit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(detailsLoading || selectedSaleDetail) && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-sm">
          <div className="w-full sm:max-w-4xl rounded-t-3xl sm:rounded-3xl bg-white p-4 sm:p-6 shadow-2xl max-h-[95vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Transaction Details</h2>
                <p className="text-sm text-slate-500">
                  View sold items, exact time, print, and void restoration
                  details.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedSaleDetail ? (
                  <button
                    onClick={() => printSaleDetails(selectedSaleDetail)}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    <Printer size={16} />
                    Print
                  </button>
                ) : null}
                <button
                  onClick={closeSaleDetails}
                  className="rounded-full p-2 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {detailsLoading || !selectedSaleDetail ? (
              <div className="flex min-h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Receipt
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {selectedSaleDetail.receipt_no || "-"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Cashier
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {(Array.isArray(selectedSaleDetail.cashier_profile)
                        ? selectedSaleDetail.cashier_profile[0]?.full_name
                        : selectedSaleDetail.cashier_profile?.full_name) || "-"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Date & Time
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {new Date(selectedSaleDetail.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Status
                    </p>
                    <p className="mt-1 font-semibold capitalize text-slate-900">
                      {selectedSaleDetail.status}
                    </p>
                  </div>
                </div>

                {selectedSaleDetail.status === "void" ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                      <p className="text-xs font-semibold uppercase text-rose-400">
                        Voided At
                      </p>
                      <p className="mt-1 font-semibold text-rose-900">
                        {selectedSaleDetail.voided_at
                          ? new Date(
                              selectedSaleDetail.voided_at,
                            ).toLocaleString()
                          : "-"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                      <p className="text-xs font-semibold uppercase text-rose-400">
                        Voided By
                      </p>
                      <p className="mt-1 font-semibold text-rose-900">
                        {selectedSaleDetail.voided_by_profile?.full_name || "-"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                      <p className="text-xs font-semibold uppercase text-rose-400">
                        Void Reason
                      </p>
                      <p className="mt-1 font-semibold text-rose-900">
                        {selectedSaleDetail.void_reason ||
                          "No reason recorded."}
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-sm text-slate-500">
                        <th className="px-4 py-3 font-medium">Item</th>
                        <th className="px-4 py-3 font-medium">Barcode</th>
                        <th className="px-4 py-3 font-medium">Qty</th>
                        <th className="px-4 py-3 font-medium">Price</th>
                        <th className="px-4 py-3 font-medium">Line Total</th>
                        <th className="px-4 py-3 font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedSaleDetail.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {item.productName}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {item.barcode || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {pesoFormatter.format(item.price)}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-emerald-600">
                            {pesoFormatter.format(item.line_subtotal)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {item.note || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectedSaleDetail.status === "void" ? (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                    <p className="text-xs font-semibold uppercase text-amber-500">
                      Restored Inventory
                    </p>
                    <div className="mt-3 space-y-3">
                      {selectedSaleDetail.restored_items.length > 0 ? (
                        selectedSaleDetail.restored_items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-4 rounded-xl border border-amber-100 bg-white/70 p-3"
                          >
                            <div>
                              <p className="font-semibold text-slate-900">
                                {item.productName}
                              </p>
                              <p className="text-xs text-slate-500">
                                Restored {item.quantity} item(s) at{" "}
                                {new Date(item.created_at).toLocaleString()}
                              </p>
                            </div>
                            <p className="text-xs text-slate-500">
                              {item.note || "-"}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">
                          No restored stock movements recorded for this voided
                          sale.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Payments
                    </p>
                    <div className="mt-2 space-y-2">
                      {selectedSaleDetail.payments &&
                      selectedSaleDetail.payments.length > 0 ? (
                        selectedSaleDetail.payments.map((payment, index) => (
                          <div
                            key={`${payment.method || "payment"}-${index}`}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-3"
                          >
                            <div className="flex items-center justify-between text-sm">
                              <span className="capitalize text-slate-600">
                                {payment.method || "Unknown"}
                              </span>
                              <span className="font-semibold text-slate-900">
                                {pesoFormatter.format(
                                  Number(payment.amount ?? 0),
                                )}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-slate-500">
                              <div className="flex items-center justify-between">
                                <span>Paid Amount</span>
                                <span className="font-medium text-slate-700">
                                  {pesoFormatter.format(
                                    Number(payment.amount ?? 0),
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Cash Received</span>
                                <span className="font-medium text-slate-700">
                                  {payment.amount_tendered != null
                                    ? pesoFormatter.format(
                                        Number(payment.amount_tendered ?? 0),
                                      )
                                    : "-"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Change</span>
                                <span className="font-medium text-slate-700">
                                  {payment.change_amount != null
                                    ? pesoFormatter.format(
                                        Number(payment.change_amount ?? 0),
                                      )
                                    : "-"}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400">
                          No payment records available.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Summary
                    </p>
                    <div className="mt-2 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Subtotal</span>
                        <span className="font-semibold text-slate-900">
                          {pesoFormatter.format(
                            Number(
                              selectedSaleDetail.subtotal ??
                                selectedSaleDetail.total,
                            ),
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Discount</span>
                        <span className="font-semibold text-slate-900">
                          {pesoFormatter.format(
                            Number(selectedSaleDetail.discount_amount ?? 0),
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Tax</span>
                        <span className="font-semibold text-slate-900">
                          {pesoFormatter.format(
                            Number(selectedSaleDetail.tax ?? 0),
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base">
                        <span className="font-semibold text-slate-700">
                          Total
                        </span>
                        <span className="font-bold text-emerald-600">
                          {pesoFormatter.format(
                            Number(selectedSaleDetail.total ?? 0),
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    Sale Note
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {selectedSaleDetail.notes || "No sale note recorded."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── Shortcut Bar ──────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 hidden sm:flex items-stretch border-t border-slate-200 bg-white text-[10px] font-semibold shadow-lg select-none print:hidden overflow-x-auto">
        {[
          { key: "Enter", label: "Execute" },
          { key: "F1",  label: "New Sale" },
          { key: "F2",  label: "Search Items" },
          { key: "F3",  label: "Scan Barcode" },
          { key: "F4",  label: "Credit Pay" },
          { key: "F5",  label: "Transactions" },
          { key: "F6",  label: "Cash Pay" },
          { key: "F7",  label: "Pay (No Print)" },
          { key: "F8",  label: "Process Sale" },
          { key: "F9",  label: "View Orders" },
          { key: "F10", label: "Void Trans" },
          { key: "F11", label: "Log Off" },
        ].map(({ key, label }) => (
          <div
            key={key}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 border-r border-slate-200 px-1 py-2 last:border-r-0"
          >
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 leading-tight">
              {key}
            </span>
            <span className="text-slate-700 leading-tight text-center">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Helper Components ---
function StatCard({
  label,
  value,
  isAlert = false,
}: {
  label: string;
  value: string;
  isAlert?: boolean;
}) {
  return (
    <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm">
      <p className="text-slate-500 text-sm mb-1 font-medium">{label}</p>
      <p
        className={`text-2xl md:text-3xl font-bold ${isAlert ? "text-red-500" : "text-slate-900"}`}
      >
        {value}
      </p>
    </div>
  );
}

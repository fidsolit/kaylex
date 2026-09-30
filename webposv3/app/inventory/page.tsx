"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeft, Loader2, Plus, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/sidebar";
import { PaginationControls } from "../components/pagination-controls";
import { supabase } from "@/lib/supabaseClient";
import { ModalShell } from "./components/modal-shell";
import { InventoryHistoryTable } from "./components/inventory-history-table";
import { InventoryTable } from "./components/inventory-table";
import { RecentDeliveriesTable } from "./components/recent-deliveries-table";
import { RecentLossesTable } from "./components/recent-losses-table";
import {
  DEFAULT_DELIVERY_FORM,
  DEFAULT_LOSS_FORM,
  DEFAULT_NEW_ITEM_FORM,
  DEFAULT_VARIANT_FORM,
} from "./constants";
import type {
  DeliveryFormState,
  InventoryItem,
  InventoryLossRow,
  InventoryRow,
  ProductOption,
  RecentDeliveryItem,
  RecentInventoryHistoryItem,
  RecentLossItem,
  StockMovementRow,
} from "./types";
import {
  buildRecentDeliveryItems,
  buildRecentInventoryHistoryItems,
  buildRecentLossItems,
  formatCurrency,
  normalizeInventoryRows,
} from "./utils";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong.";
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

export default function Inventory() {
  const router = useRouter();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [inventoryTotalCount, setInventoryTotalCount] = useState(0);
  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [recentDeliveries, setRecentDeliveries] = useState<
    RecentDeliveryItem[]
  >([]);
  const [inventoryHistory, setInventoryHistory] = useState<
    RecentInventoryHistoryItem[]
  >([]);
  const [recentLosses, setRecentLosses] = useState<RecentLossItem[]>([]);
  const [selectedLowStockItem, setSelectedLowStockItem] =
    useState<InventoryItem | null>(null);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(
    null,
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [isLossModalOpen, setIsLossModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [activeBranchName, setActiveBranchName] = useState("Loading branch...");
  const [inventoryPage, setInventoryPage] = useState(1);

  const [newItem, setNewItem] = useState(DEFAULT_NEW_ITEM_FORM);
  const [variantForm, setVariantForm] = useState(DEFAULT_VARIANT_FORM);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryFormState>(
    DEFAULT_DELIVERY_FORM,
  );
  const [lossForm, setLossForm] = useState(DEFAULT_LOSS_FORM);
  const [deliverySearch, setDeliverySearch] = useState("");
  const [deliveryBarcodeInput, setDeliveryBarcodeInput] = useState("");
  const inventoryPageSize = 10;
  const inventoryTableRef = useRef<HTMLDivElement | null>(null);

  const fetchInventory = useCallback(async (branchId: string, page = 1) => {
    const from = (page - 1) * inventoryPageSize;
    const to = from + inventoryPageSize - 1;

    const { data, error, count } = await supabase
      .from("inventory")
      .select(
        `
          id,
          stock,
          min_stock,
          branch_id,
          products (
            id,
            name,
            price,
            cost,
            barcode,
            product_type
          )
        `,
        { count: "exact" },
      )
      .eq("branch_id", branchId)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Supabase Error:", error.message);
      return;
    }

    setInventoryPage(page);
    if (count !== null) {
      setInventoryTotalCount(count);
    }
    setItems(normalizeInventoryRows((data as InventoryRow[]) ?? []));
  }, []);

  const loadProductOptions = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, barcode, product_type")
      .eq("product_type", "product")
      .order("name", { ascending: true });

    if (error) {
      console.error("Failed loading products:", error.message);
      return;
    }

    setProductOptions((data as ProductOption[]) ?? []);
  }, []);

  const loadLowStockItems = useCallback(async (branchId: string) => {
    const { data, error } = await supabase
      .from("inventory")
      .select(
        `
          id,
          stock,
          min_stock,
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
      .eq("branch_id", branchId)
      .order("stock", { ascending: true });

    if (error) {
      console.error("Failed loading low stock items:", error.message);
      return;
    }

    const normalizedItems = normalizeInventoryRows(
      (data as InventoryRow[]) ?? [],
    );
    setLowStockItems(
      normalizedItems.filter((item) => item.stock <= (item.min_stock ?? 0)),
    );
  }, []);

  const loadRecentDeliveries = useCallback(async (branchId: string) => {
    const { data, error } = await supabase
      .from("stock_movements")
      .select(
        "id, quantity, unit_cost, note, created_at, product_id, created_by",
      )
      .eq("branch_id", branchId)
      .eq("movement_type", "restock")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Failed loading recent deliveries:", error.message);
      return;
    }

    const rows = (data as StockMovementRow[]) ?? [];
    const productIds = Array.from(
      new Set(
        rows
          .map((row) => row.product_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const encodedByIds = Array.from(
      new Set(
        rows
          .map((row) => row.created_by)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    let productNameMap = new Map<string, string>();
    let encodedByMap = new Map<string, string | null>();

    if (productIds.length > 0) {
      const { data: productRows } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds);

      productNameMap = new Map(
        ((productRows ?? []) as { id: string; name: string }[]).map((row) => [
          row.id,
          row.name,
        ]),
      );
    }

    if (encodedByIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", encodedByIds);

      encodedByMap = new Map(
        ((profileRows ?? []) as { id: string; full_name: string | null }[]).map(
          (row) => [row.id, row.full_name],
        ),
      );
    }

    setRecentDeliveries(
      buildRecentDeliveryItems(rows, productNameMap, encodedByMap),
    );
  }, []);

  const loadInventoryHistory = useCallback(async (branchId: string) => {
    const { data, error } = await supabase
      .from("stock_movements")
      .select(
        "id, quantity, unit_cost, note, created_at, product_id, created_by, movement_type, reference_type",
      )
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed loading inventory history:", error.message);
      return;
    }

    const rows = (data as StockMovementRow[]) ?? [];
    const productIds = Array.from(
      new Set(
        rows
          .map((row) => row.product_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const encodedByIds = Array.from(
      new Set(
        rows
          .map((row) => row.created_by)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    let productNameMap = new Map<string, string>();
    let encodedByMap = new Map<string, string | null>();

    if (productIds.length > 0) {
      const { data: productRows } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds);

      productNameMap = new Map(
        ((productRows ?? []) as { id: string; name: string }[]).map((row) => [
          row.id,
          row.name,
        ]),
      );
    }

    if (encodedByIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", encodedByIds);

      encodedByMap = new Map(
        ((profileRows ?? []) as { id: string; full_name: string | null }[]).map(
          (row) => [row.id, row.full_name],
        ),
      );
    }

    setInventoryHistory(
      buildRecentInventoryHistoryItems(rows, productNameMap, encodedByMap),
    );
  }, []);

  const loadRecentLosses = useCallback(async (branchId: string) => {
    const { data, error } = await supabase
      .from("inventory_losses")
      .select(
        "id, quantity, reason, created_at, product_id, variant_id, created_by",
      )
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Failed loading recent losses:", error.message);
      return;
    }

    const rows = (data as InventoryLossRow[]) ?? [];
    const productIds = Array.from(
      new Set(
        rows
          .map((row) => row.product_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const variantIds = Array.from(
      new Set(
        rows
          .map((row) => row.variant_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const encodedByIds = Array.from(
      new Set(
        rows
          .map((row) => row.created_by)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    let productNameMap = new Map<string, string>();
    let variantNameMap = new Map<string, string>();
    let encodedByMap = new Map<string, string | null>();

    if (productIds.length > 0) {
      const { data: productRows } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds);

      productNameMap = new Map(
        ((productRows ?? []) as { id: string; name: string }[]).map((row) => [
          row.id,
          row.name,
        ]),
      );
    }

    if (variantIds.length > 0) {
      const { data: variantRows } = await supabase
        .from("product_variants")
        .select("id, name")
        .in("id", variantIds);

      variantNameMap = new Map(
        ((variantRows ?? []) as { id: string; name: string }[]).map((row) => [
          row.id,
          row.name,
        ]),
      );
    }

    if (encodedByIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", encodedByIds);

      encodedByMap = new Map(
        ((profileRows ?? []) as { id: string; full_name: string | null }[]).map(
          (row) => [row.id, row.full_name],
        ),
      );
    }

    setRecentLosses(
      buildRecentLossItems(rows, productNameMap, variantNameMap, encodedByMap),
    );
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

      const { data: branches, error: branchError } = await supabase
        .from("branches")
        .select("id, name")
        .limit(1);

      if (branchError) {
        setActiveBranchName("Branch load failed");
        return;
      }

      const branch = branches?.[0];
      if (!branch) {
        setActiveBranchName("No Branch Found");
        return;
      }

      setActiveBranchId(branch.id);
      setActiveBranchName(branch.name);
      await Promise.all([
        fetchInventory(branch.id, 1),
        loadLowStockItems(branch.id),
        loadProductOptions(),
        loadRecentDeliveries(branch.id),
        loadInventoryHistory(branch.id),
        loadRecentLosses(branch.id),
      ]);
    };

    init();
  }, [
    fetchInventory,
    loadLowStockItems,
    loadProductOptions,
    loadRecentDeliveries,
    loadInventoryHistory,
    loadRecentLosses,
    router,
  ]);

  const handleAddItem = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!activeBranchId) {
      alert("Error: No active branch found.");
      return;
    }

    const parsedPrice = Number.parseFloat(newItem.price);
    const parsedCost = Number.parseFloat(newItem.cost);
    const parsedStock = Number.parseInt(newItem.stock, 10);
    const parsedMinStock = Number.parseInt(newItem.minStock, 10);

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      alert("Please enter a valid price.");
      return;
    }

    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      alert("Please enter a valid stock.");
      return;
    }

    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      alert("Please enter a valid unit cost.");
      return;
    }

    if (!Number.isFinite(parsedMinStock) || parsedMinStock < 0) {
      alert("Please enter a valid low stock threshold.");
      return;
    }

    setLoading(true);

    try {
      const { data: product, error: productError } = await supabase
        .from("products")
        .insert([
          {
            name: newItem.name,
            barcode: newItem.barcode || null,
            product_type: "product",
            price: parsedPrice,
            cost: parsedCost,
          },
        ])
        .select()
        .single();

      if (productError) throw productError;

      const { error: inventoryError } = await supabase
        .from("inventory")
        .insert([
          {
            product_id: product.id,
            branch_id: activeBranchId,
            stock: parsedStock,
            min_stock: parsedMinStock,
          },
        ]);

      if (inventoryError) throw inventoryError;

      await Promise.all([
        fetchInventory(activeBranchId, 1),
        loadLowStockItems(activeBranchId),
      ]);
      setNewItem(DEFAULT_NEW_ITEM_FORM);
      setIsModalOpen(false);
    } catch (error) {
      if (getErrorCode(error) === "23505") {
        alert("Barcode already exists. Please use a unique barcode.");
        return;
      }

      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleAddVariant = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!activeBranchId) {
      alert("No active branch found.");
      return;
    }

    if (!variantForm.productId || !variantForm.name.trim()) {
      alert("Please select a product and enter variant name.");
      return;
    }

    const parsedPrice = Number.parseFloat(variantForm.price || "0");
    const parsedStock = Number.parseInt(variantForm.openingStock || "0", 10);

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      alert("Please enter a valid variant price.");
      return;
    }

    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      alert("Please enter a valid opening stock.");
      return;
    }

    setLoading(true);

    const { data: variant, error: variantError } = await supabase
      .from("product_variants")
      .insert([
        {
          product_id: variantForm.productId,
          name: variantForm.name.trim(),
          price: parsedPrice,
          barcode: variantForm.barcode.trim() || null,
        },
      ])
      .select("id")
      .single();

    if (variantError || !variant) {
      alert(variantError?.message || "Failed creating variant.");
      setLoading(false);
      return;
    }

    const { error: stockError } = await supabase
      .from("inventory_variant_stock")
      .insert([
        {
          variant_id: variant.id,
          branch_id: activeBranchId,
          stock: parsedStock,
        },
      ]);

    if (stockError) {
      alert(stockError.message);
      setLoading(false);
      return;
    }

    setVariantForm(DEFAULT_VARIANT_FORM);
    setIsVariantModalOpen(false);
    setLoading(false);
    alert("Variant added successfully.");
    await Promise.all([
      fetchInventory(activeBranchId, 1),
      loadLowStockItems(activeBranchId),
    ]);
  };

  const handleReceiveDelivery = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!activeBranchId) {
      alert("No active branch found.");
      return;
    }

    if (!deliveryForm.productId) {
      alert("Select a product.");
      return;
    }

    const quantity = Number.parseInt(deliveryForm.quantity, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert("Enter a valid delivery quantity.");
      return;
    }

    const unitCost =
      deliveryForm.unitCost.trim() === ""
        ? null
        : Number.parseFloat(deliveryForm.unitCost);
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      alert("Enter a valid unit cost.");
      return;
    }

    const noteParts = [
      deliveryForm.supplierName.trim()
        ? `Supplier: ${deliveryForm.supplierName.trim()}`
        : null,
      deliveryForm.referenceNumber.trim()
        ? `Reference: ${deliveryForm.referenceNumber.trim()}`
        : null,
      deliveryForm.note.trim() ? deliveryForm.note.trim() : null,
    ].filter((part): part is string => Boolean(part));

    setLoading(true);

    const { data: inventoryRecord, error: inventoryError } = await supabase
      .from("inventory")
      .select("id, stock, product_id")
      .eq("branch_id", activeBranchId)
      .eq("product_id", deliveryForm.productId)
      .single();
    // Note: Using maybeSingle() to handle cases where the inventory record might not exist yet.
    //debugger;

    if (inventoryError || !inventoryRecord) {
      alert(inventoryError?.message || "Inventory item not found.");
      setLoading(false);
      return;
    }

    const { data: userResult } = await supabase.auth.getUser();
    const userId = userResult.user?.id ?? null;
    const updatedStock = Number(inventoryRecord.stock ?? 0) + quantity;

    const { error: updateError } = await supabase
      .from("inventory")
      .update({
        stock: updatedStock,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inventoryRecord.id);

    if (updateError) {
      alert(updateError.message);
      setLoading(false);
      return;
    }

    const { error: movementError } = await supabase
      .from("stock_movements")
      .insert([
        {
          branch_id: activeBranchId,
          product_id: deliveryForm.productId,
          movement_type: "restock",
          quantity,
          unit_cost: unitCost,
          reference_type: "delivery",
          note: noteParts.length > 0 ? noteParts.join(" | ") : null,
          created_by: userId,
        },
      ]);

    if (movementError) {
      await supabase
        .from("inventory")
        .update({
          stock: inventoryRecord.stock,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inventoryRecord.id);
      if (
        movementError.message.includes("row-level security policy") ||
        movementError.message.includes("violates row-level security policy")
      ) {
        alert(
          "Delivery was blocked by Supabase RLS for stock_movements. Run database_setup.sql in Supabase SQL Editor, then try again.",
        );
        setLoading(false);
        return;
      }
      alert(movementError.message);
      setLoading(false);
      return;
    }

    setDeliveryForm(DEFAULT_DELIVERY_FORM);
    setDeliverySearch("");
    setDeliveryBarcodeInput("");
    setIsDeliveryModalOpen(false);
    setLoading(false);

    await Promise.all([
      fetchInventory(activeBranchId, inventoryPage),
      loadLowStockItems(activeBranchId),
      loadRecentDeliveries(activeBranchId),
      loadInventoryHistory(activeBranchId),
    ]);
  };

  const handleLogLoss = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!activeBranchId) {
      alert("No active branch found.");
      return;
    }

    const quantity = Number.parseInt(lossForm.quantity, 10);

    if (!lossForm.productId) {
      alert("Select a product.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert("Enter a valid loss quantity.");
      return;
    }

    if (!lossForm.reason.trim()) {
      alert("Reason is required.");
      return;
    }

    setLoading(true);

    const { data: inventoryRecord, error: inventoryError } = await supabase
      .from("inventory")
      .select("id, stock")
      .eq("branch_id", activeBranchId)
      .eq("product_id", lossForm.productId)
      .single();

    if (inventoryError || !inventoryRecord) {
      alert(inventoryError?.message || "Inventory item not found.");
      setLoading(false);
      return;
    }

    if (inventoryRecord.stock < quantity) {
      alert(`Not enough stock. Available: ${inventoryRecord.stock}`);
      setLoading(false);
      return;
    }

    const { data: userResult } = await supabase.auth.getUser();
    const userId = userResult.user?.id ?? null;

    const { error: lossError } = await supabase
      .from("inventory_losses")
      .insert([
        {
          branch_id: activeBranchId,
          product_id: lossForm.productId,
          quantity,
          reason: lossForm.reason.trim(),
          created_by: userId,
        },
      ]);

    if (lossError) {
      alert(lossError.message);
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("inventory")
      .update({
        stock: inventoryRecord.stock - quantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inventoryRecord.id);

    if (updateError) {
      alert(updateError.message);
      setLoading(false);
      return;
    }

    const { error: movementError } = await supabase
      .from("stock_movements")
      .insert([
        {
          branch_id: activeBranchId,
          product_id: lossForm.productId,
          movement_type: "adjustment",
          quantity,
          unit_cost: null,
          reference_type: "inventory_loss",
          note: `Loss recorded: ${lossForm.reason.trim()}`,
          created_by: userId,
        },
      ]);

    if (movementError) {
      await supabase
        .from("inventory")
        .update({
          stock: inventoryRecord.stock,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inventoryRecord.id);
      await supabase
        .from("inventory_losses")
        .delete()
        .eq("branch_id", activeBranchId)
        .eq("product_id", lossForm.productId)
        .eq("created_by", userId)
        .eq("quantity", quantity)
        .eq("reason", lossForm.reason.trim());
      alert(movementError.message);
      setLoading(false);
      return;
    }

    setLossForm(DEFAULT_LOSS_FORM);
    setIsLossModalOpen(false);
    setLoading(false);

    await Promise.all([
      fetchInventory(activeBranchId, inventoryPage),
      loadLowStockItems(activeBranchId),
      loadInventoryHistory(activeBranchId),
      loadRecentLosses(activeBranchId),
    ]);
  };

  const totalInventoryPages = Math.max(
    1,
    Math.ceil(inventoryTotalCount / inventoryPageSize),
  );
  const visibleLowStockItems = useMemo(
    () => lowStockItems.slice(0, 8),
    [lowStockItems],
  );
  const displayedInventoryItems = showLowStockOnly ? lowStockItems : items;
  const filteredDeliveryProducts = useMemo(() => {
    const query = deliverySearch.trim().toLowerCase();
    if (!query) return productOptions;
    return productOptions.filter((product) => {
      const nameMatch = product.name.toLowerCase().includes(query);
      const barcodeMatch = (product.barcode ?? "")
        .toLowerCase()
        .includes(query);
      return nameMatch || barcodeMatch;
    });
  }, [deliverySearch, productOptions]);

  const handleInventoryPageChange = async (page: number) => {
    if (!activeBranchId) return;
    const nextPage = Math.min(Math.max(page, 1), totalInventoryPages);
    if (nextPage === inventoryPage) return;
    await fetchInventory(activeBranchId, nextPage);
  };

  const handleLowStockAlertClick = (item: InventoryItem) => {
    setShowLowStockOnly(true);
    setHighlightedItemId(item.id);
    setSelectedLowStockItem(item);
    window.setTimeout(() => {
      inventoryTableRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };

  const handleDeliveryProductSearch = () => {
    const query = deliverySearch.trim().toLowerCase();
    if (!query) return;
    const matchedProduct = productOptions.find((product) => {
      return (
        product.name.toLowerCase().includes(query) ||
        (product.barcode ?? "").toLowerCase() === query
      );
    });
    if (!matchedProduct) {
      alert("No matching product found.");
      return;
    }
    setDeliveryForm((current) => ({
      ...current,
      productId: matchedProduct.id,
    }));
    setDeliveryBarcodeInput(matchedProduct.barcode ?? "");
    setDeliverySearch(matchedProduct.name);
  };

  const handleDeliveryBarcodeChange = (value: string) => {
    setDeliveryBarcodeInput(value);
    const normalizedBarcode = value.trim().toLowerCase();
    if (!normalizedBarcode) return;

    const matchedProduct = productOptions.find(
      (product) => (product.barcode ?? "").toLowerCase() === normalizedBarcode,
    );

    if (!matchedProduct) return;

    setDeliveryForm((current) => ({
      ...current,
      productId: matchedProduct.id,
    }));
    setDeliverySearch(matchedProduct.name);
  };

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
        <header className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <button
              onClick={() => router.push("/pos")}
              className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline"
            >
              <ArrowLeft size={16} /> Back to Dashboard
            </button>
            <div className="mb-1 flex items-center gap-2">
              <span className="flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                <Store size={10} /> {activeBranchName}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">Inventory List</h1>
            <p className="text-sm text-slate-500 hidden sm:block">
              Managing stock for {activeBranchName}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-105"
            >
              <Plus size={16} /> Add Product
            </button>
            <button
              onClick={() => setIsDeliveryModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-105"
            >
              <Plus size={16} /> Delivery
            </button>
            <button
              onClick={() => setIsVariantModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-105"
            >
              <Plus size={16} /> Variant
            </button>
            <button
              onClick={() => setIsLossModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-105"
            >
              <Plus size={16} /> Log Loss
            </button>
          </div>
        </header>

        <div
          ref={inventoryTableRef}
          className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold">Inventory Items</h2>
              <p className="mt-1 text-sm text-slate-500">
                {showLowStockOnly
                  ? "Showing only items currently in low-stock alert."
                  : "Showing the paginated inventory list for this branch."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowLowStockOnly((current) => !current);
                setHighlightedItemId(null);
              }}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                showLowStockOnly
                  ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {showLowStockOnly ? "Show All Inventory" : "Show Low Stocks"}
            </button>
          </div>
          <InventoryTable
            items={displayedInventoryItems}
            highlightedItemId={highlightedItemId}
          />
          {!showLowStockOnly && (
            <PaginationControls
              currentPage={inventoryPage}
              totalPages={totalInventoryPages}
              pageSize={inventoryPageSize}
              totalItems={inventoryTotalCount}
              itemLabel="inventory items"
              onPageChange={(page) => {
                void handleInventoryPageChange(page);
              }}
            />
          )}
        </div>
        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-lg font-bold">Low Stock Alerts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Items that have reached or dropped below their alert threshold.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {lowStockItems.length > 0 ? (
              visibleLowStockItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleLowStockAlertClick(item)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition hover:bg-rose-50/60"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {item.products?.name || "Unknown product"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Barcode: {item.products?.barcode || "-"}
                    </p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-rose-500">
                      Click to show in inventory list
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-rose-600">
                      Stock: {item.stock}
                    </p>
                    <p className="text-xs text-slate-500">
                      Threshold: {item.min_stock ?? 0}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <p className="px-6 py-8 text-sm text-slate-400">
                No low stock alerts right now.
              </p>
            )}
          </div>
        </section>
        <InventoryHistoryTable historyItems={inventoryHistory} />
        <RecentDeliveriesTable recentDeliveries={recentDeliveries} />
        <RecentLossesTable recentLosses={recentLosses} />
      </main>

      {isModalOpen && (
        <ModalShell title="New Product" onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleAddItem} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-500">
                Product Name
              </label>
              <input
                required
                placeholder="Enter name"
                value={newItem.name}
                onChange={(event) =>
                  setNewItem({ ...newItem, name: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-500">
                Barcode
              </label>
              <input
                required
                placeholder="Scan or type barcode"
                value={newItem.barcode}
                onChange={(event) =>
                  setNewItem({ ...newItem, barcode: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-500">
                Unit Cost (PHP)
              </label>
              <input
                required
                type="number"
                step="0.01"
                value={newItem.cost}
                onChange={(event) =>
                  setNewItem({ ...newItem, cost: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-500">
                Price (PHP)
              </label>
              <input
                required
                type="number"
                step="0.01"
                value={newItem.price}
                onChange={(event) =>
                  setNewItem({ ...newItem, price: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-500">
                Stock
              </label>
              <input
                required
                type="number"
                value={newItem.stock}
                onChange={(event) =>
                  setNewItem({ ...newItem, stock: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-500">
                Low Stock Alert
              </label>
              <input
                required
                type="number"
                value={newItem.minStock}
                onChange={(event) =>
                  setNewItem({ ...newItem, minStock: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              disabled={loading}
              type="submit"
              className="flex w-full items-center justify-center rounded-2xl bg-blue-600 py-4 font-bold text-white transition hover:bg-blue-700"
            >
              {loading ? (
                <Loader2 className="mr-2 animate-spin" size={20} />
              ) : (
                "Save Product"
              )}
            </button>
          </form>
        </ModalShell>
      )}

      {isVariantModalOpen && (
        <ModalShell
          title="Add Variant"
          onClose={() => setIsVariantModalOpen(false)}
        >
          <form onSubmit={handleAddVariant} className="space-y-4">
            <select
              required
              value={variantForm.productId}
              onChange={(event) =>
                setVariantForm({
                  ...variantForm,
                  productId: event.target.value,
                })
              }
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            >
              <option value="">Select base product</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            <input
              required
              placeholder="Variant name (e.g. 16GB RAM)"
              value={variantForm.name}
              onChange={(event) =>
                setVariantForm({ ...variantForm, name: event.target.value })
              }
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Variant price"
              value={variantForm.price}
              onChange={(event) =>
                setVariantForm({ ...variantForm, price: event.target.value })
              }
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            />
            <input
              placeholder="Variant barcode (optional)"
              value={variantForm.barcode}
              onChange={(event) =>
                setVariantForm({ ...variantForm, barcode: event.target.value })
              }
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            />
            <input
              type="number"
              placeholder="Opening stock"
              value={variantForm.openingStock}
              onChange={(event) =>
                setVariantForm({
                  ...variantForm,
                  openingStock: event.target.value,
                })
              }
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            />
            <button
              disabled={loading}
              type="submit"
              className="w-full rounded-2xl bg-violet-600 py-4 font-bold text-white"
            >
              {loading ? "Saving..." : "Save Variant"}
            </button>
          </form>
        </ModalShell>
      )}

      {isDeliveryModalOpen && (
        <ModalShell
          title="Receive Delivery"
          onClose={() => {
            setIsDeliveryModalOpen(false);
            setDeliverySearch("");
            setDeliveryBarcodeInput("");
          }}
        >
          <form onSubmit={handleReceiveDelivery} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              <input
                placeholder="Search product by name or barcode"
                value={deliverySearch}
                onChange={(event) => setDeliverySearch(event.target.value)}
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
              />
              <button
                type="button"
                onClick={handleDeliveryProductSearch}
                className="rounded-2xl bg-slate-800 px-5 py-4 font-bold text-white"
              >
                Search
              </button>
            </div>
            <input
              placeholder="Scan or type barcode"
              value={deliveryBarcodeInput}
              onChange={(event) =>
                handleDeliveryBarcodeChange(event.target.value)
              }
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            />
            <select
              required
              value={deliveryForm.productId}
              onChange={(event) => {
                const selectedProduct = productOptions.find(
                  (product) => product.id === event.target.value,
                );
                setDeliveryForm({
                  ...deliveryForm,
                  productId: event.target.value,
                });
                setDeliverySearch(selectedProduct?.name ?? "");
                setDeliveryBarcodeInput(selectedProduct?.barcode ?? "");
              }}
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            >
              <option value="">Select product</option>
              {filteredDeliveryProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.barcode ? ` (${product.barcode})` : ""}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input
                required
                type="number"
                min="1"
                placeholder="Delivered quantity"
                value={deliveryForm.quantity}
                onChange={(event) =>
                  setDeliveryForm({
                    ...deliveryForm,
                    quantity: event.target.value,
                  })
                }
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit cost (optional)"
                value={deliveryForm.unitCost}
                onChange={(event) =>
                  setDeliveryForm({
                    ...deliveryForm,
                    unitCost: event.target.value,
                  })
                }
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
              />
            </div>
            <input
              placeholder="Supplier name (optional)"
              value={deliveryForm.supplierName}
              onChange={(event) =>
                setDeliveryForm({
                  ...deliveryForm,
                  supplierName: event.target.value,
                })
              }
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            />
            <input
              placeholder="Reference number / invoice (optional)"
              value={deliveryForm.referenceNumber}
              onChange={(event) =>
                setDeliveryForm({
                  ...deliveryForm,
                  referenceNumber: event.target.value,
                })
              }
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            />
            <textarea
              placeholder="Notes (optional)"
              value={deliveryForm.note}
              onChange={(event) =>
                setDeliveryForm({
                  ...deliveryForm,
                  note: event.target.value,
                })
              }
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            />
            <button
              disabled={loading}
              type="submit"
              className="w-full rounded-2xl bg-emerald-600 py-4 font-bold text-white"
            >
              {loading ? "Saving..." : "Receive Delivery"}
            </button>
          </form>
        </ModalShell>
      )}

      {isLossModalOpen && (
        <ModalShell
          title="Log Inventory Loss"
          onClose={() => setIsLossModalOpen(false)}
        >
          <form onSubmit={handleLogLoss} className="space-y-4">
            <select
              required
              value={lossForm.productId}
              onChange={(event) =>
                setLossForm({ ...lossForm, productId: event.target.value })
              }
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            >
              <option value="">Select product</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              placeholder="Loss quantity"
              value={lossForm.quantity}
              onChange={(event) =>
                setLossForm({ ...lossForm, quantity: event.target.value })
              }
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            />
            <textarea
              required
              placeholder="Reason (damaged, expired, missing, etc.)"
              value={lossForm.reason}
              onChange={(event) =>
                setLossForm({ ...lossForm, reason: event.target.value })
              }
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4"
            />
            <button
              disabled={loading}
              type="submit"
              className="w-full rounded-2xl bg-rose-600 py-4 font-bold text-white"
            >
              {loading ? "Saving..." : "Save Loss Record"}
            </button>
          </form>
        </ModalShell>
      )}

      {selectedLowStockItem && (
        <ModalShell
          title="Low Stock Item Details"
          onClose={() => setSelectedLowStockItem(null)}
        >
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Product
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {selectedLowStockItem.products?.name || "Unknown product"}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-rose-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">
                  Current Stock
                </p>
                <p className="mt-1 text-2xl font-bold text-rose-600">
                  {selectedLowStockItem.stock}
                </p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                  Alert Threshold
                </p>
                <p className="mt-1 text-2xl font-bold text-amber-700">
                  {selectedLowStockItem.min_stock ?? 0}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Barcode
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {selectedLowStockItem.products?.barcode || "-"}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Unit Cost
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {formatCurrency(selectedLowStockItem.products?.cost)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Selling Price
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {formatCurrency(selectedLowStockItem.products?.price)}
                </p>
              </div>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

import { accurateFetch } from "./client";
import { saveInventoryAdjustment } from "./inventory";

export interface PosAccurateCredentials { apiToken: string; signatureSecret: string; host: string; session: string; }
export interface PosWarehouse { id: number; name: string; }
export interface PosProduct { id: number; itemCode: string; itemName: string; stock: number; unitPrice: number; unitCost: number; warehouseId: number; warehouseName: string; }
interface AccurateListResponse<T> { d?: T[]; }

export async function listWarehouses(credentials: PosAccurateCredentials): Promise<PosWarehouse[]> {
  const response = await accurateFetch<AccurateListResponse<{ id: number; name: string }>>("/api/warehouse/list.do?fields=id,name&sp.pageSize=100", credentials);
  return (response.d || []).map((warehouse) => ({ id: warehouse.id, name: warehouse.name }));
}

function parseWarehouse(item: Record<string, unknown>): { id: number; name: string } | null {
  const warehouse = (item.warehouse && typeof item.warehouse === "object" ? item.warehouse : null) as Record<string, unknown> | null;
  const id = Number(item.warehouseId ?? warehouse?.id);
  const name = String(item.warehouseName ?? warehouse?.name ?? "");
  return Number.isInteger(id) && id > 0 && name ? { id, name } : null;
}

export async function searchPosProducts(credentials: PosAccurateCredentials, warehouse: PosWarehouse, query: string): Promise<PosProduct[]> {
  const params = new URLSearchParams({ fields: "id,no,name,unitPrice,unitCost,stock,warehouse,warehouseId,warehouseName", "sp.pageSize": "50", "filter.warehouse.id": String(warehouse.id) });
  if (query.trim()) { params.set("filter.keywords.op", "CONTAIN"); params.set("filter.keywords.val[0]", query.trim()); }
  const response = await accurateFetch<AccurateListResponse<Record<string, unknown>>>(`/api/item/list.do?${params.toString()}`, credentials);
  return (response.d || []).flatMap((item) => {
    const itemWarehouse = parseWarehouse(item);
    if (!itemWarehouse || itemWarehouse.id !== warehouse.id || itemWarehouse.name !== warehouse.name) return [];
    const product: PosProduct = { id: Number(item.id), itemCode: String(item.no || ""), itemName: String(item.name || item.no || ""), stock: Number(item.stock || 0), unitPrice: Number(item.unitPrice || item.salePrice || 0), unitCost: Number(item.unitCost || item.purchasePrice || 0), warehouseId: itemWarehouse.id, warehouseName: itemWarehouse.name };
    return product.itemCode && Number.isFinite(product.stock) && product.stock >= 0 && Number.isFinite(product.unitPrice) && product.unitPrice >= 0 && Number.isFinite(product.unitCost) && product.unitCost >= 0 ? [product] : [];
  });
}

export async function resolvePosProducts(credentials: PosAccurateCredentials, warehouse: PosWarehouse, requestedCodes: string[]) {
  const uniqueCodes = [...new Set(requestedCodes)];
  const products = (await Promise.all(uniqueCodes.map((code) => searchPosProducts(credentials, warehouse, code)))).flat();
  const byCode = new Map(products.filter((product) => product.itemCode).map((product) => [product.itemCode, product]));
  if (byCode.size !== uniqueCodes.length) throw new Error("PRODUCT_NOT_FOUND");
  return uniqueCodes.map((code) => byCode.get(code)!);
}

export interface PosSaleForAdjustment {
  id: string;
  warehouseName: string;
  paymentMethod: string;
  items: Array<{ itemCode: string; quantity: number }>;
}

/**
 * POS intentionally records stock movement as an Accurate Inventory Adjustment,
 * not as a Sales Invoice. The local sale remains the source for payment and
 * revenue data until a verified Sales Invoice integration is introduced.
 */
export async function syncPosSale(
  credentials: PosAccurateCredentials,
  sale: PosSaleForAdjustment,
): Promise<{ id: number; number: string }> {
  const result = await saveInventoryAdjustment(credentials, {
    transDate: new Date().toISOString().slice(0, 10),
    description: `POS Sale ${sale.id} | Payment: ${sale.paymentMethod}`,
    detailItem: sale.items.map((item) => ({
      itemNo: item.itemCode,
      quantity: item.quantity,
      itemAdjustmentType: "ADJUSTMENT_OUT",
      warehouseName: sale.warehouseName,
    })),
  });
  return { id: result.id, number: result.r };
}

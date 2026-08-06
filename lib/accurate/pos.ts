import { accurateFetch } from "./client";
import { saveInventoryAdjustment } from "./inventory";

export interface PosAccurateCredentials { apiToken: string; signatureSecret: string; host: string; session: string; }
export interface PosWarehouse { id: number; name: string; }
export interface PosProduct { id: number; itemCode: string; itemName: string; stock: number; unitPrice: number; unitCost: number; warehouseId: number; warehouseName: string; }
interface AccurateListResponse<T> { d?: T[]; }
interface AccurateSaveResponse { s: boolean; d: { id: number; r?: string } | string[]; d_message?: string[]; }

export async function listWarehouses(credentials: PosAccurateCredentials): Promise<PosWarehouse[]> {
  const response = await accurateFetch<AccurateListResponse<{ id: number; name: string }>>("/api/warehouse/list.do?fields=id,name&sp.pageSize=100", credentials);
  return (response.d || []).map((warehouse) => ({ id: warehouse.id, name: warehouse.name }));
}



export async function findAccurateItemByCode(credentials: PosAccurateCredentials, itemCode: string) {
  const params = new URLSearchParams({ fields: "id,no,name,unitPrice,unitCost", "filter.no.op": "EQUAL", "filter.no.val[0]": itemCode });
  const response = await accurateFetch<AccurateListResponse<Record<string, unknown>>>(`/api/item/list.do?${params.toString()}`, credentials);
  const item = response.d?.find((candidate) => String(candidate.no || "") === itemCode);
  return item ? { id: Number(item.id), itemCode: String(item.no), itemName: String(item.name || item.no) } : null;
}

export async function saveAccurateItem(
  credentials: PosAccurateCredentials,
  item: { accurateItemId?: number | null; itemCode: string; itemName: string; unit: string; buyPrice: number; sellPrice: number },
) {
  const response = await accurateFetch<AccurateSaveResponse>("/api/item/save.do", credentials, {
    method: "POST",
    body: {
      id: item.accurateItemId || undefined,
      no: item.itemCode,
      name: item.itemName,
      itemType: "INVENTORY",
      unit1Name: item.unit,
      unitPrice: item.sellPrice,
      unitCost: item.buyPrice,
    },
  });
  if (!response.s || Array.isArray(response.d)) {
    throw new Error((Array.isArray(response.d) ? response.d[0] : response.d_message?.[0]) || "Unable to save Accurate item");
  }
  return response.d;
}

export async function syncPosProduct(
  credentials: PosAccurateCredentials,
  warehouse: PosWarehouse,
  product: { accurateItemId?: number | null; itemCode: string; itemName: string; unit: string; stock: number; buyPrice: number; sellPrice: number },
) {
  const existing = await findAccurateItemByCode(credentials, product.itemCode);
  const saved = await saveAccurateItem(credentials, { ...product, accurateItemId: existing?.id ?? product.accurateItemId });
  const adjustment = await saveInventoryAdjustment(credentials, {
    transDate: new Date().toISOString().slice(0, 10),
    description: `POS product sync ${product.itemCode}`,
    detailItem: [{
      itemNo: product.itemCode,
      quantity: product.stock,
      itemAdjustmentType: "ADJUSTMENT_STOCK",
      unitCost: product.buyPrice,
      warehouseName: warehouse.name,
    }],
  });
  return { accurateItemId: saved.id, adjustmentId: adjustment.id, adjustmentNumber: adjustment.r };
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

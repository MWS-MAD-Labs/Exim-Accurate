import { accurateFetch } from "./client";
import {
  findInventoryAdjustmentByDescription,
  parseAccurateSaveResponse,
  saveInventoryAdjustment,
  type AccurateSaveResponse,
} from "./inventory";

export interface PosAccurateCredentials { apiToken: string; signatureSecret: string; host: string; session: string; }
export interface PosWarehouse { id: number; name: string; }
export interface PosProduct { id: number; itemCode: string; itemName: string; stock: number; unitPrice: number; unitCost: number; warehouseId: number; warehouseName: string; }
interface AccurateListResponse<T> { d?: T[]; }

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
  const response = await accurateFetch<AccurateSaveResponse<{ id: number; r?: string }>>("/api/item/save.do", credentials, {
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
  return parseAccurateSaveResponse(response, "Unable to save Accurate item");
}

export async function syncPosProduct(
  credentials: PosAccurateCredentials,
  warehouse: PosWarehouse,
  product: { accurateItemId?: number | null; itemCode: string; itemName: string; unit: string; stock: number; buyPrice: number; sellPrice: number },
) {
  const existing = await findAccurateItemByCode(credentials, product.itemCode);
  const saved = await saveAccurateItem(credentials, { ...product, accurateItemId: existing?.id ?? product.accurateItemId });

  // Accurate rejects zero-quantity adjustment lines. A new/empty item already
  // has zero stock, so there is no inventory movement to record.
  if (product.stock === 0) {
    return { accurateItemId: saved.id, adjustmentId: null, adjustmentNumber: null };
  }

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
  const payload = {
    transDate: new Date().toISOString().slice(0, 10),
    description: `POS Sale ${sale.id} | Payment: ${sale.paymentMethod}`,
    detailItem: sale.items.map((item) => ({
      itemNo: item.itemCode,
      quantity: item.quantity,
      itemAdjustmentType: "ADJUSTMENT_OUT" as const,
      warehouseName: sale.warehouseName,
    })),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const existing = await findInventoryAdjustmentByDescription(
        credentials,
        `POS Sale ${sale.id}`,
        payload.transDate,
      );
      if (existing) return { id: existing.id, number: existing.number };

      const result = await saveInventoryAdjustment(credentials, payload);
      return { id: result.id, number: result.r };
    } catch (error) {
      if (
        attempt === 2 ||
        !(error instanceof Error) ||
        !/(unsuccessful response|status (408|429|5\\d\\d)|fetch failed|timed? out|timeout|reset)/i.test(error.message)
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }

  throw new Error("Unable to create the Accurate inventory adjustment");
}

export async function reversePosSale(
  credentials: PosAccurateCredentials,
  sale: PosSaleForAdjustment & { accurateId: number; voidReason: string },
): Promise<{ id: number; number: string }> {
  const result = await saveInventoryAdjustment(credentials, {
    transDate: new Date().toISOString().slice(0, 10),
    description: `VOID POS Sale ${sale.id} | Original Accurate ID: ${sale.accurateId} | Reason: ${sale.voidReason.slice(0, 200)}`,
    detailItem: sale.items.map((item) => ({
      itemNo: item.itemCode,
      quantity: item.quantity,
      itemAdjustmentType: "ADJUSTMENT_IN",
      warehouseName: sale.warehouseName,
    })),
  });
  return { id: result.id, number: result.r };
}

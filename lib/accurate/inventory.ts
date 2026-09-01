import { accurateFetch } from "./client";

interface AccurateCredentials {
  apiToken: string;
  signatureSecret: string;
  host: string;
  session?: string;
}

export interface InventoryAdjustment {
  id: number;
  transDate: string;
  number: string;
  description?: string;
  status?: string;
}

export interface InventoryAdjustmentDetail {
  id: number;
  transDate: string;
  number: string;
  description?: string;
  detailItem: Array<{
    id: number;
    item: {
      id: number;
      name: string;
      no: string;
    };
    unitPrice: number;
    quantity: number;
    unit: {
      name: string;
    };
    warehouse?: {
      name: string;
    };
    type?: string; // Penambahan or Pengurangan
  }>;
}

export interface InventoryAdjustmentListResponse {
  d: InventoryAdjustment[];
  sp: {
    page: number;
    pageSize: number;
    pageCount: number;
  };
}

export interface ItemResponse {
  d: Array<{
    id: number;
    name: string;
    no: string;
  }>;
}

export interface AccurateSaveResponse<T> {
  s?: boolean;
  r?: T;
  d?: T | string[];
  d_message?: string[];
}

export function parseAccurateSaveResponse<T>(
  response: AccurateSaveResponse<T>,
  fallbackMessage: string,
): T {
  const result = response.r ?? (Array.isArray(response.d) ? undefined : response.d);
  if (result && response.s !== false) {
    return result;
  }

  const messages = Array.isArray(response.d) ? response.d : response.d_message;
  throw new Error(messages?.[0] || fallbackMessage);
}

/**
 * List inventory adjustments with pagination
 */
export async function listInventoryAdjustments(
  credentials: AccurateCredentials,
  page: number = 1,
  pageSize: number = 100,
  filter?: {
    startDate?: string; // YYYY-MM-DD
    endDate?: string; // YYYY-MM-DD
  }
): Promise<InventoryAdjustmentListResponse> {
  const params = new URLSearchParams({
    "sp.page": page.toString(),
    "sp.pageSize": pageSize.toString(),
    "fields": "id,transDate,number,description",
  });

  if (filter?.startDate) {
    params.append("filter.transDate.start", filter.startDate);
  }

  if (filter?.endDate) {
    params.append("filter.transDate.end", filter.endDate);
  }

  const response = await accurateFetch<InventoryAdjustmentListResponse>(
    `/api/item-adjustment/list.do?${params.toString()}`,
    credentials,
    { method: "GET" }
  );

  return response;
}

export async function findInventoryAdjustmentByDescription(
  credentials: AccurateCredentials,
  description: string,
  transDate: string,
): Promise<InventoryAdjustment | null> {
  const params = new URLSearchParams({
    "sp.page": "1",
    "sp.pageSize": "20",
    fields: "id,transDate,number,description",
    "filter.transDate.start": transDate,
    "filter.transDate.end": transDate,
    "filter.description.op": "CONTAIN",
    "filter.description.val[0]": description,
  });
  const response = await accurateFetch<InventoryAdjustmentListResponse>(
    `/api/item-adjustment/list.do?${params.toString()}`,
    credentials,
    { method: "GET" },
  );
  return response.d?.find((adjustment) => adjustment.description?.includes(description)) ?? null;
}

/**
 * Get inventory adjustment detail by ID
 */
export async function getInventoryAdjustmentDetail(
  credentials: AccurateCredentials,
  id: number
): Promise<InventoryAdjustmentDetail> {
  const response = await accurateFetch<{ d: InventoryAdjustmentDetail }>(
    `/api/item-adjustment/detail.do?id=${id}`,
    credentials,
    { method: "GET" }
  );

  return response.d;
}

/**
 * Save inventory adjustment (for import)
 */
export async function saveInventoryAdjustment(
  credentials: AccurateCredentials,
  data: {
    transDate: string; // expect YYYY-MM-DD from caller
    number?: string;
    description?: string;
    detailItem: Array<{
      itemNo: string;
      quantity: number;
      itemAdjustmentType: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "ADJUSTMENT_STOCK";
      unitCost?: number;
      warehouseName?: string;
    }>;
  }
): Promise<{ id: number; r: string }> {
  // Format date to DD/MM/YYYY as required by Accurate
  const [year, month, day] = data.transDate.split("-");
  const formattedDate = `${day}/${month}/${year}`;

  const requestBody = {
    transDate: formattedDate,
    number: data.number,
    description: data.description,
    detailItem: data.detailItem.map((item) => ({
      itemNo: item.itemNo,
      quantity: item.quantity,
      itemAdjustmentType: item.itemAdjustmentType,
      unitCost: item.unitCost || 0,
      warehouseName: item.warehouseName,
    })),
  };

  const response = await accurateFetch<AccurateSaveResponse<{ id: number; r?: string; number?: string }>>(
    `/api/item-adjustment/save.do`,
    credentials,
    {
      method: "POST",
      body: requestBody,
    }
  );

  const saved = parseAccurateSaveResponse(
    response,
    "Failed to save inventory adjustment",
  );

  return {
    id: saved.id,
    r: saved.r || saved.number || String(saved.id),
  };
}

/**
 * Search for item by code (exact match first, then keyword fallback)
 */
export async function findItemByCode(
  credentials: AccurateCredentials,
  itemCode: string
): Promise<{ id: number; name: string; no: string } | null> {
  // First, try exact match by item number
  const exactMatch = await accurateFetch<ItemResponse>(
    `/api/item/list.do?fields=id,name,no&filter.no.op=EQUAL&filter.no.val[0]=${encodeURIComponent(itemCode)}`,
    credentials,
    { method: "GET" }
  );

  if (exactMatch.d.length > 0) {
    return exactMatch.d[0];
  }

  // Fallback: search by keywords (broader search)
  const keywordSearch = await accurateFetch<ItemResponse>(
    `/api/item/list.do?fields=id,name,no&filter.keywords.op=CONTAIN&filter.keywords.val[0]=${encodeURIComponent(itemCode)}`,
    credentials,
    { method: "GET" }
  );

  // Return first match from keyword search, if any
  return keywordSearch.d.length > 0 ? keywordSearch.d[0] : null;
}



/**
 * Export all inventory adjustments for a date range
 */
export async function exportInventoryAdjustments(
  credentials: AccurateCredentials,
  startDate: string,
  endDate: string,
  limit?: number
): Promise<
  Array<{
    adjustmentNumber: string;
    date: string;
    itemName: string;
    itemCode: string;
    type: string;
    quantity: number;
    unit: string;
    warehouse?: string;
    description?: string;
  }>
> {
  const allRecords: Array<any> = [];
  let page = 1;
  let hasMore = true;

  console.log(`[exportInventoryAdjustments] Starting export for ${startDate} to ${endDate}${limit ? ` with limit ${limit}` : ""}`);

  // Fetch all pages
  while (hasMore) {
    console.log(`[exportInventoryAdjustments] Fetching page ${page}...`);
    const response = await listInventoryAdjustments(credentials, page, 100, {
      startDate,
      endDate,
    });

    console.log(`[exportInventoryAdjustments] Page ${page} returned ${response.d?.length || 0} items`);

    if (!response.d || response.d.length === 0) {
      hasMore = false;
      break;
    }

    // Fetch details for each adjustment
    for (const adjustment of response.d) {
      console.log(`[exportInventoryAdjustments] Fetching detail for adjustment ${adjustment.id}...`);
      const detail = await getInventoryAdjustmentDetail(
        credentials,
        adjustment.id
      );
      console.log(`[exportInventoryAdjustments] Detail has ${detail.detailItem?.length || 0} items`);

      // Flatten item lines
      for (const item of detail.detailItem) {
        allRecords.push({
          adjustmentNumber: detail.number,
          date: detail.transDate,
          itemName: item.item?.name || (item as any).detailName || "",
          itemCode: item.item?.no || "",
          type: (item as any).itemAdjustmentTypeName || item.type || "",
          quantity: item.quantity,
          unit: (item as any).itemUnit?.name || (item as any).unit?.name || "",
          warehouse: item.warehouse?.name || "",
          description: detail.description || "",
        });

        // Check if limit reached
        if (limit && allRecords.length >= limit) {
          console.log(`[exportInventoryAdjustments] Limit of ${limit} reached, stopping early.`);
          return allRecords;
        }
      }
    }

    // Check if there are more pages
    if (page >= response.sp.pageCount) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allRecords;
}

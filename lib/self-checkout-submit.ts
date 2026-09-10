export interface SelfCheckoutItem {
  itemCode: string;
  itemName?: string;
  quantity: number;
}

export interface ResolvedCheckoutItem extends SelfCheckoutItem {
  unitCost: number;
}

export interface CreatedCheckoutSession {
  id: string;
}

export interface CheckoutAdjustmentResult {
  id: number;
  r: string;
}

interface SubmitSelfCheckoutOptions {
  items: SelfCheckoutItem[];
  createSession: () => Promise<CreatedCheckoutSession>;
  resolveItems: (items: SelfCheckoutItem[]) => Promise<ResolvedCheckoutItem[]>;
  saveAdjustment: (items: ResolvedCheckoutItem[]) => Promise<CheckoutAdjustmentResult>;
  completeSession: (sessionId: string, result: CheckoutAdjustmentResult) => Promise<void>;
  failSession: (sessionId: string, errorMessage: string) => Promise<void>;
}

export async function submitSelfCheckoutAdjustment({
  items,
  createSession,
  resolveItems,
  saveAdjustment,
  completeSession,
  failSession,
}: SubmitSelfCheckoutOptions): Promise<{ sessionId: string; result: CheckoutAdjustmentResult }> {
  const checkoutSession = await createSession();

  try {
    const resolvedItems = await resolveItems(items);
    const result = await saveAdjustment(resolvedItems);
    await completeSession(checkoutSession.id, result);
    return { sessionId: checkoutSession.id, result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Gagal mengirim checkout";

    try {
      await failSession(checkoutSession.id, errorMessage);
    } catch (sessionError) {
      console.error("[self-checkout/submit] Failed to mark checkout session as failed:", sessionError);
    }

    throw error;
  }
}

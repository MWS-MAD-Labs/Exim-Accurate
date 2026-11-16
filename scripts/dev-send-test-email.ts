// DEV ONLY. Sends a sample shopping receipt and a sample allowance reminder (debt) to the address you give, through the
// email settings in .env (Gmail API with the service account by default, or SMTP when EMAIL_PROVIDER=smtp).
// It checks the SMTP setup and the receipt template without a real sale and without touching the database.
//
//   npx tsx --env-file=.env scripts/dev-send-test-email.ts <your-email>
import { sendEmail } from "../lib/email";
import { buildNotificationMessage } from "../lib/pos-allowance-notifications";
import { buildReceiptMessage } from "../lib/pos-sale-receipt";

async function main() {
  const to = process.argv[2];
  if (!to?.includes("@")) throw new Error("Usage: scripts/dev-send-test-email.ts <your-email>");

  const message = buildReceiptMessage({
    saleId: "TEST-RECEIPT",
    customerName: "Tes Sade",
    items: [
      { itemName: "Teh Botol", quantity: 2, unitPrice: 5000 },
      { itemName: "Nasi Kotak", quantity: 1, unitPrice: 25000 },
    ],
    paymentStrategy: "allowance_then_external",
    payments: [{ method: "allowance", amount: 35000 }],
    total: 35000,
    allowanceBalanceBefore: 100000,
    allowanceBalanceAfter: 65000,
    purchasedAt: new Date(),
  });

  const reminder = buildNotificationMessage({
    name: "Tes Sade",
    email: to,
    amount: 45000,
    cutoffDate: new Date(),
    reminderDay: 1,
    scenario: "debt",
  });

  console.log("Provider:", process.env.EMAIL_PROVIDER || "gmail", "| Sender:", process.env.GMAIL_SENDER_EMAIL || process.env.SMTP_USER || "(not set)");
  for (const [label, mail] of [["receipt", message], ["allowance reminder", reminder]] as const) {
    const info = await sendEmail({ to, ...mail, subject: `[TEST] ${mail.subject}` });
    console.log(`${label}: accepted ${info.accepted.length}, rejected ${info.rejected.length}${info.id ? `, id ${info.id}` : ""}`);
  }
}

main().catch((error) => {
  console.error("Send failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

// Brings the people Central gives access to Exima into the local user list.
//   npm run users:sync
import { syncUsersFromCentral } from "../lib/central-user-sync";
import { prisma } from "../lib/prisma";

syncUsersFromCentral()
  .then((summary) => {
    console.log(
      `users synced: ${summary.created} new, ${summary.updated} updated, ${summary.revoked} without access, ${summary.unchanged} unchanged`,
    );
    if (summary.emailsChanged > 0) console.log(`${summary.emailsChanged} emails changed in Central, the old ones are kept for badges`);
    if (summary.needsReview > 0) console.warn(`${summary.needsReview} accounts keep their old email because the new one belongs to someone else`);
    if (summary.unmapped > 0) {
      console.warn(`${summary.unmapped} people skipped: their Central organization is not mapped (npm run db:map-central-organization)`);
    }
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

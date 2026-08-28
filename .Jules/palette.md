## 2024-05-23 - [Destructive Action Feedback]
**Learning:** Users lack confidence when clicking destructive actions (like delete) without immediate visual feedback. Adding a specific loading state for the item being deleted prevents "rage clicking" and assures the user the system is working.
**Action:** Always verify delete actions have a loading state, especially in lists/tables where multiple items exist.

## 2026-02-04 - [Consistent Empty States]
**Learning:** Replacing plain text empty states with visually rich components significantly improves the perceived quality of the application and provides clearer calls to action.
**Action:** Always check for empty states in lists/tables and use the `EmptyState` component instead of plain text.

## 2024-05-25 - [ActionIcon Accessibility in Tooltips]
**Learning:** Even when `ActionIcon` buttons are near a tooltip or self-evident in context (like a kiosk), they often lack raw `aria-label`s, which is a major barrier for screen-reader users accessing interactive elements. Relying solely on icons or visually implied contexts is insufficient.
**Action:** Always explicitly verify that icon-only buttons (like Mantine `ActionIcon`) include an `aria-label` utilizing localized strings (`t.common...`), especially in high-visibility contexts like kiosk interfaces.

## 2026-06-01 - Confirmation Modal for Destructive Actions
**Learning:** Destructive actions (like delete) on lists or tables without an explicit visual confirmation dialog cause anxiety, especially when actions are immediate. Tooltips on `ActionIcon` components only explain the action ("Hapus") but don't prevent accidental clicks or provide sufficient screen reader context (a Tooltip doesn't automatically set an `aria-label` on its child). Additionally, full-page loading states or list re-fetches without targeted loading indicators (e.g., using `deletingItemIds: string[]` instead of a boolean or single string) make list interactions feel janky and less responsive.
**Action:** When adding or auditing list deletion features, use `@mantine/modals` (`modals.openConfirmModal`) to provide a localized, destructive confirmation dialog. Track the loading state specifically for the item being deleted using an array of IDs to prevent UI freezing or mismatched loading indicators. Always add an explicit, localized `aria-label` directly to the `ActionIcon` element to ensure robust screen reader support, regardless of the presence of a Tooltip wrapper.

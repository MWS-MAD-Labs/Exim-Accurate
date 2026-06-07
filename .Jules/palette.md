## 2024-05-23 - [Destructive Action Feedback]
**Learning:** Users lack confidence when clicking destructive actions (like delete) without immediate visual feedback. Adding a specific loading state for the item being deleted prevents "rage clicking" and assures the user the system is working.
**Action:** Always verify delete actions have a loading state, especially in lists/tables where multiple items exist.

## 2026-02-04 - [Consistent Empty States]
**Learning:** Replacing plain text empty states with visually rich components significantly improves the perceived quality of the application and provides clearer calls to action.
**Action:** Always check for empty states in lists/tables and use the `EmptyState` component instead of plain text.

## 2024-05-25 - [ActionIcon Accessibility in Tooltips]
**Learning:** Even when `ActionIcon` buttons are near a tooltip or self-evident in context (like a kiosk), they often lack raw `aria-label`s, which is a major barrier for screen-reader users accessing interactive elements. Relying solely on icons or visually implied contexts is insufficient.
**Action:** Always explicitly verify that icon-only buttons (like Mantine `ActionIcon`) include an `aria-label` utilizing localized strings (`t.common...`), especially in high-visibility contexts like kiosk interfaces.
## 2024-05-25 - [ActionIcon Accessibility & Localization]
**Learning:** When using translated text for ARIA labels in nested Next.js components, attempting to guess the shape of the `t` object from `useLanguage()` without reading the translation source file (e.g., `id.ts`) can cause critical `TypeError` runtime crashes if the nested property (like `t.common.delete`) does not exist. Furthermore, relying on `language === "id" ? "Hapus" : "Delete"` while other components use `t.common.delete` creates inconsistent localization patterns.
**Action:** Always inspect the actual translation files (e.g., `lib/translations/id.ts`) to confirm the existence and exact path of localized keys before using them in `aria-label` attributes.

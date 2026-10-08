// Two letters for an avatar: the first letters of the first two words of the name, or the first
// two letters of a single word. Without a name, the same from the part of the email before the @.
export function initialsOf(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "U";
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

// "cashier_lead" -> "Cashier Lead"
export function roleLabelOf(role?: string | null) {
  if (!role) return "";
  return role.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

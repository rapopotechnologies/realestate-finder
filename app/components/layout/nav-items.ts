import { Heart, Search, UserRound, type LucideIcon } from "lucide-react";

// The app's rooms, same names and order in the header (desktop) and the bottom bar (phones).
// Don't add a fourth; put new things in a room or on the Account page.
export const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/search", label: "Search", icon: Search },
  { href: "/my-list", label: "My List", icon: Heart },
  { href: "/account", label: "Account", icon: UserRound },
];

export function isActive(pathname: string, href: string) {
  // Property pages belong to Search
  return pathname.startsWith(href) || (href === "/search" && pathname.startsWith("/property"));
}

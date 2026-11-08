import {
  Activity,
  BarChart3,
  Bot,
  ClipboardCheck,
  Compass,
  CreditCard,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  badge?: "pendingApprovals";
  /** Hidden for roles without this permission (the API enforces it anyway). */
  perm?: string;
}

export const NAV: { group: string | null; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Key numbers across sales, payments and security." },
      { href: "/activity", label: "Live activity", icon: Activity, description: "Every agent action as it happens.", perm: "events:read" },
      { href: "/workflows", label: "Workflows", icon: GitBranch, description: "Customer journeys and their current state.", perm: "workflows:read" },
      { href: "/agents", label: "Agents", icon: Bot, description: "The six agents and the orchestrator: status, config and runs.", perm: "agents:read" },
    ],
  },
  {
    group: "Commerce",
    items: [
      { href: "/studio", label: "Studio", icon: Sparkles, description: "Conversations with prospects and the insights agents extracted.", perm: "conversations:read" },
      { href: "/customers", label: "Customers", icon: Users, description: "Profiles, journey stage, intent and history.", perm: "customers:read" },
      { href: "/products", label: "Products", icon: Package, description: "Training offers, pricing and seats.", perm: "products:read" },
      { href: "/orders", label: "Orders", icon: ShoppingCart, description: "Orders and enrollments.", perm: "orders:read" },
      { href: "/payments", label: "Payments", icon: CreditCard, description: "Simulated transactions, holds and refunds.", perm: "payments:read" },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3, description: "Revenue, conversion, customers and agent performance.", perm: "analytics:read" },
      { href: "/strategy", label: "Strategy", icon: Compass, description: "Business recommendations from the strategy agent.", perm: "strategy:read" },
    ],
  },
  {
    group: "Trust",
    items: [
      { href: "/security", label: "Security", icon: ShieldCheck, description: "Fraud alerts, prompt injection attempts and risk events.", perm: "security:read" },
      { href: "/approvals", label: "Approvals", icon: ClipboardCheck, description: "Actions held for a human decision.", badge: "pendingApprovals", perm: "approvals:read" },
      { href: "/audit", label: "Audit", icon: ScrollText, description: "Tamper-evident log of every action.", perm: "audit:read" },
    ],
  },
  {
    group: null,
    items: [
      { href: "/settings", label: "Settings", icon: Settings, description: "Users, roles, AI providers and simulation settings." },
      { href: "/demo", label: "Demo control", icon: FlaskConical, description: "Run scripted scenarios and reset demo data.", perm: "workflows:write" },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);

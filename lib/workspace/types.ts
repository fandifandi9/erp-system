import type { LucideIcon } from "lucide-react";

export type WorkspaceId =
  | "owner"
  | "hr"
  | "director"
  | "accounting"
  | "warehouse"
  | "pos"
  | "sales"
  | "purchasing"
  | "staff";

export type WorkspaceQuickAction = {
  id: string;
  titleKey: string;
  descriptionKey?: string;
  href: string;
  icon: LucideIcon;
  /** Path prefix for canAccess check */
  accessPath: string;
};

export type WorkspaceSection = {
  id: string;
  titleKey: string;
  actionIds: string[];
};

export type WorkspaceConfig = {
  id: WorkspaceId;
  /** Page title i18n key — use workspace.desk.title (role-neutral "Meja Kerja"). */
  titleKey: string;
  /** Page subtitle i18n key — describes workspace scope for the user. */
  subtitleKey: string;
  quickActions: WorkspaceQuickAction[];
  /**
   * Optional personal section (profile). Shown in main workspace only — not in sidebar.
   * Resolved via canAccess() on each action's accessPath.
   */
  personalSection?: WorkspaceSection;
  /**
   * Common workspace modules: attendance, payroll, company info.
   * Available to users who have the matching route permissions.
   */
  commonSections: WorkspaceSection[];
  /**
   * Additional modules by responsibility (finance, warehouse, HR, etc.).
   * Populated incrementally; resolved only through canAccess(), not role string checks.
   */
  roleSections?: WorkspaceSection[];
  /**
   * @deprecated Use personalSection + commonSections + roleSections.
   */
  sections?: WorkspaceSection[];
};

/** All section definitions in display order (common → role-specific). */
export function mergeWorkspaceSections(config: WorkspaceConfig): WorkspaceSection[] {
  if (config.commonSections?.length) {
    return [...config.commonSections, ...(config.roleSections ?? [])];
  }
  return config.sections ?? [];
}

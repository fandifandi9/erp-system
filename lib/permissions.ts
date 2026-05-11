export const PERMISSIONS = {
  owner: {
    manageUsers: true,
    manageFinance: true,
    manageInventory: true,
  },
  hr: {
    manageUsers: false,
    viewUsers: true,
    editProfile: true,
  },
  staff: {
    viewOwnData: true,
  },
};

type PermissionRole = keyof typeof PERMISSIONS;

export const can = (role: string, action: string): boolean => {
  if (!(role in PERMISSIONS)) return false;

  const rolePermissions = PERMISSIONS[role as PermissionRole] as Record<string, boolean>;
  return rolePermissions[action] ?? false;
};
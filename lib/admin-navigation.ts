export const ADMIN_NAVIGATION_REFRESH_EVENT =
  "wbtes:admin-navigation-refresh";

export function requestAdminNavigationRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ADMIN_NAVIGATION_REFRESH_EVENT));
  }
}

import { useTranslation } from "react-i18next";
import {
  LogOut,
  Settings,
  User as UserIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

export function UserMenu() {
  const navigate = useNavigate();
  const { t } = useTranslation("usermenu");

  const user = useAuthStore(
    (state) => state.user,
  );

  const logout = useAuthStore(
    (state) => state.logout,
  );

  if (!user) {
    return null;
  }

  async function handleLogout() {
    await logout();
    navigate("/", {
      replace: true,
    });
  }

  return (
    <div className="group relative">
      <button
        type="button"
        className="flex h-7 items-center gap-2 rounded px-2 text-sm hover:bg-secondary"
        aria-label={t("label")}
        title={t("label")}
      >
        <UserIcon className="h-4 w-4" />

        <span className="hidden max-w-32 truncate sm:inline">
          {user.username}
        </span>
      </button>

      <div className="absolute right-0 top-full z-50 hidden w-52 flex-col rounded-md border bg-popover p-1 text-popover-foreground shadow-md group-hover:flex group-focus-within:flex">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
        >
          <Settings className="h-4 w-4" />
          {t("settings")}
        </button>

        <div className="my-1 h-px bg-border" />

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          {t("logout")}
        </button>
      </div>
    </div>
  );
}
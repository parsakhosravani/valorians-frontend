export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "Valorians Legend",
  description: "Valorians Legend",
  navItems: [
    {
      label: "Home",
      href: "/",
    },
    {
      label: "Resources",
      href: "/resources",
    },
    {
      label: "Army",
      href: "/army",
    },
    {
      label: "Allies",
      href: "/allies",
    },
    {
      label: "World",
      href: "/world",
    },
  ],
  navMenuItems: [
    {
      label: "Mine More",
      href: "/profile",
    },
    {
      label: "Random Boost",
      href: "/dashboard",
    },
    {
      label: "Full Charge",
      href: "/projects",
    },
    {
      label: "Increase Capacity",
      href: "/team",
    },
    {
      label: "Calendar",
      href: "/calendar",
    },
    {
      label: "Settings",
      href: "/settings",
    },
    {
      label: "Help & Feedback",
      href: "/help-feedback",
    },
    {
      label: "Logout",
      href: "/logout",
    },
  ],
};

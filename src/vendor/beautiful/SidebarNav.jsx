// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LogOut as IconArrowBoxLeft } from "lucide-react";
import { Check as IconCheckmark1Small } from "lucide-react";
import { ChevronDown as IconChevronDownSmall } from "lucide-react";
import { X as IconCrossSmall } from "lucide-react";
import { Pencil as IconEditBig } from "lucide-react";
import { Home as IconHome } from "lucide-react";
import { Search as IconMagnifyingGlass } from "lucide-react";
import { Plus as IconPlusMedium } from "lucide-react";
import { IceCream as IconPopsicle2 } from "lucide-react";
import { Settings as IconSettingsGear1 } from "lucide-react";
import { PanelLeft as IconSidebarLeftArrow } from "lucide-react";
import { UserPlus as IconUserAdd } from "lucide-react";
import GlideMenu from "../../components/primitives";
const WORKSPACE = { key: "creamery", name: "Creamery Ops", monogram: "C" };
const NAV_ITEMS = [
  { key: "home", label: "Home", icon: /* @__PURE__ */ jsx(IconHome, { size: 18 }) },
  { key: "invite", label: "Invite users", icon: /* @__PURE__ */ jsx(IconUserAdd, { size: 18 }), count: "3/10" }
];
const DEFAULT_RECENTS = [
  { id: "suppliers", label: "Supplier records" },
  { id: "todos", label: "Urgent to-dos this morning" },
  { id: "flavor", label: "Flavor page ticket" },
  { id: "workload", label: "Workload summary" },
  { id: "offboarding", label: "Off-board a supplier" },
  { id: "restock", label: "Batch restock function" },
  { id: "edits", label: "Propose flavor edits" },
  { id: "subway", label: "Subway surfing" }
];
const SIDEBAR_MOTION = {
  expandedWidth: 224,
  collapsedWidth: 52,
  duration: 280,
  copyDuration: 180,
  copyOffset: 8,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)"
};
const CHAT_SEARCH_MOTION = {
  duration: 180,
  closedWidth: 28,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)"
};
function GlideGroup({ children }) {
  return /* @__PURE__ */ jsx(
    GlideMenu,
    {
      rowSelector: "[data-row]",
      highlightClassName: "sidebar-glide-highlight rounded-[7px] bg-hover-2",
      className: "group/glide flex flex-col gap-px",
      children
    }
  );
}
function RailButton({
  icon,
  label,
  active = false,
  count,
  onClick
}) {
  return /* @__PURE__ */ jsxs(
    "button",
    {
      "data-row": true,
      type: "button",
      onClick,
      className: `sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] px-2 text-left
        transition-[width,background-color,color,transform] duration-150 active:scale-[0.98]
        ${active ? "bg-hover-2 group-hover/glide:bg-transparent" : ""}`,
      children: [
        /* @__PURE__ */ jsx("span", { className: `flex size-5 shrink-0 items-center justify-center ${active ? "text-ink" : "text-ink-2"}`, children: icon }),
        /* @__PURE__ */ jsx("span", { className: `sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[14px] font-medium ${active ? "text-ink" : "text-ink-2"}`, children: label }),
        count && /* @__PURE__ */ jsx("span", { className: "sidebar-copy mr-2 shrink-0 text-[12px] font-medium tabular-nums text-ink-3", children: count })
      ]
    }
  );
}
function WorkspaceMenu({
  position,
  onClose
}) {
  return createPortal(
    /* @__PURE__ */ jsx(
      "div",
      {
        "data-workspace-menu": true,
        className: "fixed z-50 w-64 rounded-[14px] bg-surface p-1.5 shadow-overlay",
        style: {
          top: position.top,
          left: position.left,
          animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
          transformOrigin: "top left"
        },
        children: /* @__PURE__ */ jsxs(GlideMenu, { className: "flex flex-col gap-px", highlightClassName: "inset-x-0 rounded-[8px] bg-hover-2", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              "data-menu-row": true,
              type: "button",
              onClick: onClose,
              className: "relative z-10 flex h-10 w-full items-center gap-1.5 rounded-[8px] px-2 text-left",
              children: [
                /* @__PURE__ */ jsx("span", { className: "flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-ink text-[11px] font-semibold text-surface", children: WORKSPACE.monogram }),
                /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink", children: WORKSPACE.name }),
                /* @__PURE__ */ jsx("span", { className: "shrink-0 text-ink", children: /* @__PURE__ */ jsx(IconCheckmark1Small, { size: 18 }) })
              ]
            }
          ),
          /* @__PURE__ */ jsx("div", { className: "my-1 h-px bg-line" }),
          [
            { label: "New workspace", icon: /* @__PURE__ */ jsx(IconPlusMedium, { size: 16 }) },
            { label: "Workspace settings", icon: /* @__PURE__ */ jsx(IconSettingsGear1, { size: 16 }) },
            { label: "Invite team members", icon: /* @__PURE__ */ jsx(IconUserAdd, { size: 16 }) }
          ].map((item) => /* @__PURE__ */ jsxs(
            "button",
            {
              "data-menu-row": true,
              type: "button",
              onClick: onClose,
              className: "relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2 text-left",
              children: [
                /* @__PURE__ */ jsx("span", { className: "flex size-5 shrink-0 items-center justify-center text-ink-2", children: item.icon }),
                /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate text-[13.5px] text-ink", children: item.label })
              ]
            },
            item.label
          )),
          /* @__PURE__ */ jsx("div", { className: "my-1 h-px bg-line" }),
          /* @__PURE__ */ jsxs(
            "button",
            {
              "data-menu-row": true,
              type: "button",
              onClick: onClose,
              className: "relative z-10 flex h-9 w-full items-center gap-1.5 rounded-[8px] px-2 text-left",
              children: [
                /* @__PURE__ */ jsx("span", { className: "flex size-5 shrink-0 items-center justify-center text-ink-2", children: /* @__PURE__ */ jsx(IconArrowBoxLeft, { size: 16 }) }),
                /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate text-[13.5px] text-ink", children: "Sign out" })
              ]
            }
          )
        ] })
      }
    ),
    document.body
  );
}
function SidebarNav({
  activeTitle,
  navItems = NAV_ITEMS,
  workspaceName = WORKSPACE.name,
  workspaceLogo,
  onCollapse,
  onWorkspaceClick,
  className = "",
  fill = false,
  onNewChat,
  onPick,
  activeNav,
  onNavigate,
  footerLabel = "Upgrade",
  footerIcon,
  onFooterClick,
  recents = DEFAULT_RECENTS
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [internalNav, setInternalNav] = useState("chats");
  const currentNav = activeNav ?? internalNav;
  const selectNav = (key) => {
    setInternalNav(key);
    onNavigate?.(key);
  };
  const [demoActiveTitle, setDemoActiveTitle] = useState(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspacePosition, setWorkspacePosition] = useState({ top: 0, left: 0 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const workspaceButtonRef = useRef(null);
  const searchRef = useRef(null);
  const selectedTitle = activeTitle === void 0 ? demoActiveTitle : activeTitle;
  const visibleRecents = recents.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    if (!workspaceOpen) return;
    const close = (event) => {
      const target = event.target;
      if (!target.closest("[data-workspace-trigger]") && !target.closest("[data-workspace-menu]")) {
        setWorkspaceOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [workspaceOpen]);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);
  const collapse = () => {
    onCollapse?.();
    setCollapsed(true);
    setWorkspaceOpen(false);
    setSearchOpen(false);
    setQuery("");
  };
  return /* @__PURE__ */ jsx(
    "aside",
    {
      "data-sidebar-collapsed": collapsed,
      "aria-label": "Workspace navigation",
      className: `relative flex shrink-0 overflow-hidden transition-[width] ${fill ? "h-full" : "h-[600px]"} ${className}`,
      style: {
        width: collapsed ? SIDEBAR_MOTION.collapsedWidth : SIDEBAR_MOTION.expandedWidth,
        transitionDuration: `${SIDEBAR_MOTION.duration}ms`,
        transitionTimingFunction: SIDEBAR_MOTION.easing,
        "--sidebar-copy-duration": `${SIDEBAR_MOTION.copyDuration}ms`,
        "--sidebar-copy-offset": `${SIDEBAR_MOTION.copyOffset}px`,
        "--sidebar-easing": SIDEBAR_MOTION.easing
      },
      children: /* @__PURE__ */ jsxs("div", { className: "flex min-h-0 w-[224px] shrink-0 flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "relative mb-2.5 h-10 shrink-0", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              ref: workspaceButtonRef,
              "data-workspace-trigger": true,
              type: "button",
              "aria-expanded": workspaceOpen,
              "aria-hidden": collapsed,
              tabIndex: collapsed ? -1 : 0,
              onClick: () => {
                if (onWorkspaceClick) {
                  onWorkspaceClick();
                  return;
                }
                if (!workspaceOpen && workspaceButtonRef.current) {
                  const rect = workspaceButtonRef.current.getBoundingClientRect();
                  setWorkspacePosition({ top: rect.bottom + 6, left: rect.left });
                }
                setWorkspaceOpen((open) => !open);
              },
              className: "sidebar-workspace-control absolute left-2 top-1 flex h-8 w-[164px] items-center rounded-[8px] px-2 text-left transition-[background-color,transform] duration-100 hover:bg-hover-2 active:scale-[0.99]",
              children: [
                workspaceLogo !== null && /* @__PURE__ */ jsx("span", { className: "sidebar-logo flex size-5 shrink-0 items-center justify-center text-ink", children: workspaceLogo || /* @__PURE__ */ jsx(IconPopsicle2, { size: 18 }) }),
                /* @__PURE__ */ jsx("span", { className: `sidebar-copy ${workspaceLogo === null ? "" : "ml-1.5"} min-w-0 flex-1 truncate text-[14px] font-medium text-ink-2`, children: workspaceName }),
                /* @__PURE__ */ jsx("span", { className: "sidebar-copy ml-1 flex shrink-0 text-ink-3", children: /* @__PURE__ */ jsx(IconChevronDownSmall, { size: 16 }) })
              ]
            }
          ),
          workspaceOpen && /* @__PURE__ */ jsx(WorkspaceMenu, { position: workspacePosition, onClose: () => setWorkspaceOpen(false) }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              "aria-label": "Collapse sidebar",
              "aria-hidden": collapsed,
              tabIndex: collapsed ? -1 : 0,
              onClick: collapse,
              className: "sidebar-collapse-control absolute right-2 top-1 flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color] duration-150 hover:bg-hover-2 hover:text-ink",
              children: /* @__PURE__ */ jsx(IconSidebarLeftArrow, { size: 18 })
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              "aria-label": "Expand sidebar",
              "aria-hidden": !collapsed,
              tabIndex: collapsed ? 0 : -1,
              onClick: () => setCollapsed(false),
              className: "sidebar-expand-control absolute left-2 top-0.5 flex size-9 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color] duration-150 hover:bg-hover-2 hover:text-ink",
              children: /* @__PURE__ */ jsx(IconSidebarLeftArrow, { size: 18, className: "rotate-180" })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs(GlideGroup, { children: [
          /* @__PURE__ */ jsx(
            RailButton,
            {
              icon: /* @__PURE__ */ jsx(IconEditBig, { size: 18 }),
              label: "New chat",
              onClick: () => {
                if (activeTitle === void 0) setDemoActiveTitle(null);
                selectNav("chats");
                onNewChat?.();
              }
            }
          ),
          navItems.map((item) => /* @__PURE__ */ jsx(
            RailButton,
            {
              icon: item.icon,
              label: item.label,
              count: item.count,
              active: currentNav === item.key,
              onClick: () => selectNav(item.key)
            },
            item.key
          ))
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-3 min-h-0 flex-1 overflow-y-auto", children: [
          /* @__PURE__ */ jsxs("div", { className: "sidebar-copy relative mx-2 mb-1 h-8", children: [
            /* @__PURE__ */ jsxs(
              "div",
              {
                "aria-hidden": searchOpen,
                className: `absolute inset-0 flex items-center gap-1.5 px-2 text-[12.5px] font-medium text-ink-3 transition-[opacity,transform] ${searchOpen ? "pointer-events-none -translate-x-1 opacity-0" : "translate-x-0 opacity-100"}`,
                style: { transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms`, transitionTimingFunction: CHAT_SEARCH_MOTION.easing },
                children: [
                  /* @__PURE__ */ jsx(IconChevronDownSmall, { size: 16 }),
                  /* @__PURE__ */ jsx("span", { children: "Chats" })
                ]
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                "aria-label": "Search chats",
                "aria-expanded": searchOpen,
                onClick: () => setSearchOpen(true),
                className: `absolute right-0 top-0 z-10 flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color,transform] hover:bg-hover-2 hover:text-ink active:scale-[0.96] ${searchOpen ? "pointer-events-none opacity-0" : "opacity-100"}`,
                style: { transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms` },
                children: /* @__PURE__ */ jsx(IconMagnifyingGlass, { size: 16 })
              }
            ),
            /* @__PURE__ */ jsxs(
              "div",
              {
                className: `absolute right-0 top-0 z-20 flex h-8 items-center overflow-hidden rounded-[8px] bg-field text-ink-3 shadow-hairline transition-[width,opacity] focus-within:text-ink-2 ${searchOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`,
                style: {
                  width: searchOpen ? "100%" : CHAT_SEARCH_MOTION.closedWidth,
                  transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms`,
                  transitionTimingFunction: CHAT_SEARCH_MOTION.easing
                },
                children: [
                  /* @__PURE__ */ jsx("span", { className: "ml-2 flex shrink-0 items-center justify-center", children: /* @__PURE__ */ jsx(IconMagnifyingGlass, { size: 15 }) }),
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      ref: searchRef,
                      value: query,
                      onChange: (event) => setQuery(event.target.value),
                      onKeyDown: (event) => {
                        if (event.key === "Escape") {
                          setSearchOpen(false);
                          setQuery("");
                        }
                      },
                      placeholder: "Search chats",
                      "aria-label": "Search chat history",
                      className: "ml-1.5 min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-ink-3"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      "aria-label": "Close chat search",
                      onClick: () => {
                        setSearchOpen(false);
                        setQuery("");
                      },
                      className: "flex size-8 shrink-0 items-center justify-center rounded-[8px] text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink active:scale-[0.96]",
                      children: /* @__PURE__ */ jsx(IconCrossSmall, { size: 16 })
                    }
                  )
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs(GlideGroup, { children: [
            visibleRecents.map((item) => {
              const active = item.label === selectedTitle;
              return /* @__PURE__ */ jsx(
                "button",
                {
                  "data-row": true,
                  type: "button",
                  title: item.label,
                  onClick: () => {
                    selectNav("chats");
                    if (activeTitle === void 0) setDemoActiveTitle(item.label);
                    onPick?.(item.id, item.label, item.prompt);
                  },
                  className: `sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] px-2 text-left transition-[width,background-color,color,transform] duration-150 active:scale-[0.98] ${active ? "bg-hover-2 group-hover/glide:bg-transparent" : ""}`,
                  children: /* @__PURE__ */ jsx("span", { className: `sidebar-copy min-w-0 flex-1 truncate text-[14px] font-medium ${active ? "text-ink" : "text-ink-2"}`, children: item.label })
                },
                item.id
              );
            }),
            query && visibleRecents.length === 0 && /* @__PURE__ */ jsx("div", { className: "sidebar-copy mx-2 px-2 py-2 text-[12.5px] text-ink-3", children: "No chats found" })
          ] })
        ] }),
        footerLabel && /* @__PURE__ */ jsx("div", { className: "sidebar-copy mx-2 mt-3 w-[208px] border-t border-line pt-3", children: /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: onFooterClick ?? onNewChat,
            className: "flex h-8 w-full items-center justify-center gap-1.5 rounded-control bg-hover-2 text-[12.5px] font-medium text-ink transition-[background-color,transform] duration-150 hover:bg-line-strong active:scale-[0.98]",
            children: [
              footerIcon,
              footerLabel
            ]
          }
        ) })
      ] })
    }
  );
}
export {
  SidebarNav as default
};

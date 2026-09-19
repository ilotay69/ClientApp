"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CGSelect } from "./cg-select";
import { useRouter } from "next/navigation";
import { branchGeometry } from "@/lib/branched-nav";
import s from "./client-surfaces.module.css";

export type BranchItem = {
  id: string;
  label: string;
  href: string;
  group: string;
};
/** CG-themed curved disclosure tree: real links, one open group, reduced motion. */
export function CGBranchedNav({
  items,
  active,
  label = "Client sections",
}: {
  items: BranchItem[];
  active: string;
  label?: string;
}) {
  const router = useRouter();
  const prefix = useId();
  const navRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const activeGroup = items.find((item) => item.id === active)?.group ?? "";
  const [selection, setSelection] = useState({ active, open: activeGroup });
  // Respond to back/forward and deep links, without reopening a branch that
  // the user deliberately collapsed on the current page.
  if (selection.active !== active) setSelection({ active, open: activeGroup });
  // Follow the active group through folding and responsive/font changes. The
  // marker is decorative: measuring it never changes focus or navigation state.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const target = nav.querySelector<HTMLElement>(
        '[data-active-group="true"]',
      );
      if (!target) {
        nav.style.setProperty("--branch-marker-opacity", "0");
        return;
      }
      const rect = target.getBoundingClientRect();
      nav.style.setProperty(
        "--branch-marker-y",
        `${rect.top - nav.getBoundingClientRect().top + rect.height / 2 - 8}px`,
      );
      nav.style.setProperty("--branch-marker-opacity", "1");
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [active, activeGroup, selection.open]);
  const groups = [...new Set(items.filter((i) => i.group).map((i) => i.group))];
  const renderLink = (item: BranchItem) => (
    <Link
      prefetch={false}
      scroll={false}
      href={item.href}
      aria-current={active === item.id ? "page" : undefined}
      className={s.branchLink}
      data-active-group={!item.group && active === item.id ? "true" : undefined}
    >
      <span>{item.label}</span>
    </Link>
  );
  return (
    <>
      <div className={s.mobileNav}>
        <CGSelect
          label={label}
          value={active}
          options={items.map((i) => ({ value: i.id, label: i.label }))}
          onChange={(id) => {
            const item = items.find((i) => i.id === id);
            if (item) router.push(item.href, { scroll: false });
          }}
        />
      </div>
      <nav ref={navRef} className={s.branchNav} aria-label={label}>
        <span className={s.branchMarker} aria-hidden="true" />
        <ul>
          {items
            .filter((i) => !i.group)
            .map((i) => (
              <li key={i.id}>{renderLink(i)}</li>
            ))}
        </ul>
        {groups.map((group, index) => {
          const open = selection.open === group;
          const groupId = `${prefix}-${index}`;
          const children = items.filter((i) => i.group === group);
          const geometry = branchGeometry(children.length);
          return (
            <div className={s.branchGroup} key={group}>
              <button
                type="button"
                className={s.branchToggle}
                aria-expanded={open}
                aria-controls={groupId}
                data-active-group={activeGroup === group ? "true" : undefined}
                onClick={() =>
                  setSelection({ active, open: open ? "" : group })
                }
              >
                <span>{group}</span>
                <span aria-hidden="true" className={s.chevron} data-open={open}>
                  ⌄
                </span>
                {!open && activeGroup === group && (
                  <span className={s.srOnly}>Contains the current page</span>
                )}
              </button>
              <motion.div
                id={groupId}
                initial={false}
                animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                transition={{
                  duration: reduced ? 0 : 0.24,
                  ease: [0.23, 1, 0.32, 1],
                }}
                inert={!open}
                aria-hidden={!open}
                className={s.branchChildren}
              >
                <div className={s.branchTree}>
                  <svg
                    className={s.branchLines}
                    width="30"
                    height={geometry.height}
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path className={s.branchBase} d={geometry.trunk} />
                    {geometry.branches.map((branch, childIndex) => (
                      <g key={children[childIndex].id}>
                        <path className={s.branchBase} d={branch.curve} />
                        <motion.path
                          className={s.branchReach}
                          d={branch.reach}
                          initial={false}
                          animate={{
                            pathLength:
                              open && children[childIndex].id === active
                                ? 1
                                : 0,
                          }}
                          transition={{
                            duration: reduced ? 0 : 0.36,
                            ease: [0.23, 1, 0.32, 1],
                          }}
                        />
                      </g>
                    ))}
                  </svg>
                  <ul>
                    {children.map((i) => (
                      <li key={i.id}>{renderLink(i)}</li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            </div>
          );
        })}
      </nav>
    </>
  );
}

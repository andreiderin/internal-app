// components/ProductionTimeline/Tooltip.tsx
"use client";
import React from "react";
import { createPortal } from "react-dom";
import { formatInTimeZone } from "date-fns-tz";
import { IoIosArrowUp } from "react-icons/io";
import { CgArrowsExpandRight } from "react-icons/cg";

type Pt = { x: number; y: number };

export type TooltipData = {
  id: string;
  label?: string;
  workOrderId?: string;
  salesOrderId?: string;
  machineName?: string;
  productCode?: string | null;
  quantity?: number | null;
  start: number; // ms
  end: number; // ms
  status?:
    | "planned"
    | "actual"
    | "incomplete"
    | "not_accepted"
    | "current"
    | "frozen";
  color: string;
  hatch?: boolean;

  // Optional extras
  salesOrderDeliveryMs?: number | null; // delivery date in ms
  salesOrderWorkOrderCount?: number | null; // total WOs in SO
  workOrderIndexInSO?: number | null; // 1-based index of this WO in SO
  customerName?: string;
};

const APP_TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Europe/Istanbul";

function fmtDate(ms: number) {
  return formatInTimeZone(ms, APP_TZ, "MMM d, HH:mm");
}
function fmtDur(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}
function titleForStatus(s?: TooltipData["status"]) {
  switch (s) {
    case "planned":
      return "Planned";
    case "actual":
      return "Actual";
    case "incomplete":
      return "Incomplete";
    case "not_accepted":
      return "Not accepted";
    case "current":
      return "Current";
    default:
      return "—";
  }
}

type TooltipProps = {
  open: boolean;
  anchor: Pt | null; // viewport coords
  data?: TooltipData | null;

  // Parent hover wiring
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;

  /** Parent can close the tooltip entirely when modal closes (optional) */
  onRequestClose?: () => void;

  /** If true, expanded view becomes a modal (centered, backdrop). Default: true */
  asModalOnExpand?: boolean;
};

export function Tooltip({
  open,
  anchor,
  data,
  onMouseEnter,
  onMouseLeave,
  onRequestClose,
  asModalOnExpand = true,
}: TooltipProps) {
  const swatchId = React.useMemo(
    () => `swatch_${Math.random().toString(36).slice(2)}`,
    []
  );

  const [mounted, setMounted] = React.useState(false);
  const [pos, setPos] = React.useState<Pt>({ x: 0, y: 0 });
  const [expanded, setExpanded] = React.useState(false);

  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMounted(true), []);

  // Reset expansion when a different bar is hovered
  React.useEffect(() => {
    setExpanded(false);
  }, [data?.id]);

  // Position tooltip near anchor with viewport clamping (only for non-modal)
  React.useEffect(() => {
    if (!open || !anchor || (asModalOnExpand && expanded)) return;
    const rAF = requestAnimationFrame(() => {
      const node = ref.current;
      const pad = 8;
      const w = node?.offsetWidth ?? 260;
      const h = node?.offsetHeight ?? 80;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const x = Math.min(Math.max(anchor.x + 12, pad), vw - w - pad);
      const y = Math.min(Math.max(anchor.y + 12, pad), vh - h - pad);
      setPos({ x, y });
    });
    return () => cancelAnimationFrame(rAF);
  }, [open, anchor, expanded, asModalOnExpand]);

  // Scroll lock + Esc handling when modal
  React.useEffect(() => {
    if (!(open && expanded && asModalOnExpand)) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onRequestClose) onRequestClose();
        else setExpanded(false);
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, expanded, asModalOnExpand, onRequestClose]);

  // Basic focus trap when modal
  React.useEffect(() => {
    if (!(open && expanded && asModalOnExpand)) return;
    const panel = ref.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0] ?? panel;
    const last = focusable[focusable.length - 1] ?? panel;
    (first || panel).focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [open, expanded, asModalOnExpand]);

  if (!mounted || !open || !data) return null;

  const color = data.color || "#9CA3AF";
  const hatch = !!data.hatch;

  // Are we in modal mode right now?
  const suppressHover = asModalOnExpand && expanded;

  // Backdrop (non-closable by click)
  const backdrop =
    asModalOnExpand && expanded ? (
      <div
        role="presentation"
        aria-hidden="true"
        className="fixed inset-0 z-[99] bg-black/30 backdrop-blur-[2px] transition-opacity duration-150"
      />
    ) : null;

  // Panel positioning: anchored tooltip vs centered modal
  const panelStyle: React.CSSProperties =
    asModalOnExpand && expanded
      ? {
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 100,
          maxWidth: 520,
          width: "calc(100vw - 32px)",
          pointerEvents: "auto",
          userSelect: "text",
          WebkitUserSelect: "text",
        }
      : {
          position: "fixed",
          left: pos.x,
          top: pos.y,
          zIndex: 60,
          maxWidth: 280,
          pointerEvents: "auto",
          userSelect: "text",
          WebkitUserSelect: "text",
        };

  // Panel classes: compact tooltip vs elevated modal
  const panelClasses =
    asModalOnExpand && expanded
      ? [
          "rounded-xl bg-white shadow-[0_20px_40px_rgba(17,24,39,0.18)]",
          "ring-1 ring-[#E5E7EB]",
          "p-4 sm:p-5 text-[13px] text-[#4B5563]",
          "outline-none",
          "opacity-100 scale-100 transition duration-150 ease-out",
        ].join(" ")
      : [
          "rounded-lg bg-white shadow-[0_8px_24px_rgba(28,28,45,0.12)]",
          "p-3 text-[12px] text-[#4B5563]",
        ].join(" ");

  // In modal: suppress hover semantics.
  const enterHandler = suppressHover ? undefined : onMouseEnter;
  const leaveHandler = suppressHover ? undefined : onMouseLeave;
  console.log("[DEBUG DATA] data:", data);
  return createPortal(
    <>
      {backdrop}

      <div
        ref={ref}
        onMouseEnter={enterHandler}
        onMouseLeave={leaveHandler}
        style={panelStyle}
        className={panelClasses}
        role="dialog"
        aria-modal={asModalOnExpand && expanded ? true : undefined}
        aria-live="polite"
        aria-labelledby={data.label ? `tt-title-${data.id}` : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()} // don't propagate to backdrop
      >
        {/* Header */}
        {(data.label || (asModalOnExpand && expanded)) && (
          <div className="flex items-center justify-between mb-2">
            <div
              id={`tt-title-${data.id}`}
              className={
                asModalOnExpand && expanded
                  ? "text-[15px] font-semibold text-[#111827] truncate"
                  : "text-[13px] font-medium text-[#111827] truncate"
              }
            >
              {data.label ?? "Details"}
            </div>

            <div className="flex items-center gap-2">
              {asModalOnExpand && expanded ? (
                // Modal view: only X (close)
                <button
                  type="button"
                  onClick={() => {
                    if (onRequestClose) onRequestClose();
                    else setExpanded(false);
                  }}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-[#F3F4F6] text-[#6B7280] hover:text-[#374151] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  aria-label="Close"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              ) : expanded ? (
                // Expanded (non-modal): collapse chevron up
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-[#F3F4F6] text-[#6B7280] hover:text-[#374151] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  aria-label="Collapse details"
                >
                  <IoIosArrowUp className="h-3.5 w-3.5" />
                </button>
              ) : (
                // Small tooltip: expand using CgArrowsExpandRight
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-[#F3F4F6] text-[#6B7280] hover:text-[#374151] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  aria-label="Expand details"
                >
                  <CgArrowsExpandRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="my-2 h-px bg-[#EEF0F6]" />

        {/* Primary info */}
        <div
          className={
            asModalOnExpand && expanded
              ? "grid grid-cols-2 gap-y-1 gap-x-4"
              : "space-y-[2px]"
          }
        >
          <div>
            <span className="text-[#6B7280]">Start:</span> {fmtDate(data.start)}
          </div>
          <div>
            <span className="text-[#6B7280]">End:</span> {fmtDate(data.end)}
          </div>
          {data.productCode && (
            <div>
              <span className="text-[#6B7280]">Product:</span>{" "}
              {data.productCode}
            </div>
          )}
          {typeof data.quantity === "number" && (
            <div>
              <span className="text-[#6B7280]">Quantity (kg):</span>{" "}
              {data.quantity}
            </div>
          )}
        </div>

        {/* Expanded details */}
        {(expanded || (asModalOnExpand && expanded)) && (
          <div
            id={`tt-details-${data.id}`}
            className="mt-2 grid grid-cols-2 gap-y-1 gap-x-4"
          >
            {data.machineName && (
              <div>
                <span className="text-[#6B7280]">Machine:</span>{" "}
                {data.machineName}
              </div>
            )}
            {data.workOrderId && (
              <div>
                <span className="text-[#6B7280]">Work Order:</span>{" "}
                {data.workOrderId}
              </div>
            )}
            {data.salesOrderId && (
              <div>
                <span className="text-[#6B7280]">Sales Order:</span>{" "}
                {data.salesOrderId}
              </div>
            )}
            {data.customerName && (
              <div>
                <span className="text-[#6B7280]">Customer:</span>{" "}
                {data.customerName}
              </div>
            )}
            {typeof data.salesOrderDeliveryMs === "number" && (
              <div>
                <span className="text-[#6B7280]">Delivery:</span>{" "}
                {fmtDate(data.salesOrderDeliveryMs)}
              </div>
            )}
            <div>
              <span className="text-[#6B7280]">Duration:</span>{" "}
              {fmtDur(data.end - data.start)}
            </div>
            {typeof data.workOrderIndexInSO === "number" &&
              typeof data.salesOrderWorkOrderCount === "number" && (
                <div>
                  <span className="text-[#6B7280]">Order in SO:</span>{" "}
                  {data.workOrderIndexInSO}/{data.salesOrderWorkOrderCount}
                </div>
              )}
          </div>
        )}

        <div className="my-3 h-px bg-[#EEF0F6]" />

        {/* Status */}
        <div className="mt-1 flex items-center gap-2">
          <svg width="14" height="14" aria-hidden="true" focusable="false">
            <defs>
              {hatch && (
                <pattern
                  id={swatchId}
                  patternUnits="userSpaceOnUse"
                  width={6}
                  height={6}
                  patternTransform="rotate(45)"
                >
                  <rect width="100%" height="100%" fill="none" />
                  <rect x="0" y="0" width={3} height="100%" fill={color} />
                </pattern>
              )}
            </defs>
            <rect
              x="1"
              y="1"
              width="12"
              height="12"
              rx="2"
              ry="2"
              fill={hatch ? `url(#${swatchId})` : color}
            />
          </svg>
          <span className="text-[#374151]">{titleForStatus(data.status)}</span>
        </div>

        {/* Optional actions area (only visible in modal; future use) */}
        {asModalOnExpand && expanded && (
          <div className="mt-4 flex justify-end gap-2">{/* actions */}</div>
        )}
      </div>
    </>,
    document.body
  );
}

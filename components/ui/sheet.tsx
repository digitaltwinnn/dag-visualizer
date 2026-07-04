"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Sheet({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  // Deliberately faint scrim (a whisper of darkening + a hair of blur) so the 3D scene stays
  // clearly visible behind an open sheet. Only rendered for MODAL sheets (`overlay` true) —
  // the non-modal rail docks drop it (see SheetContent).
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-40 bg-[rgba(3,5,12,0.16)] backdrop-blur-[1px]",
        className,
      )}
      {...props}
    />
  )
}

// Per-side placement + slide-in for the fixed sheet surface. Left/right dock to a screen edge and
// carry the `.ig-sheet-edge` instrument channel (spine + ruler, globals.css); the bottom sheet
// (phone) docks flush to the viewport bottom and carries `.ig-sheet-topruler`.
const SHEET_SIDE: Record<"left" | "right" | "bottom", string> = {
  left:
    "top-0 left-0 bottom-0 w-[min(300px,86vw)] rounded-r-[var(--radius)] " +
    "ig-sheet-edge data-[state=open]:animate-sheet-in-left",
  right:
    "top-0 right-0 bottom-0 w-[min(320px,90vw)] rounded-l-[var(--radius)] " +
    "ig-sheet-edge data-[state=open]:animate-sheet-in-right",
  bottom:
    "left-0 right-0 bottom-0 h-[60vh] max-h-[72vh] rounded-t-[var(--radius)] " +
    "ig-sheet-topruler data-[state=open]:animate-sheet-in-bottom",
}

function SheetContent({
  className,
  children,
  side = "right",
  overlay = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "left" | "right" | "bottom"
  // `overlay={false}` skips the dimming scrim — for NON-MODAL sheets (the tablet/phone rail docks)
  // where multiple sheets can be open at once and the 3D scene between them must stay visible +
  // interactive. A scrim would dim/trap that scene, so those sheets drop it.
  overlay?: boolean
}) {
  return (
    <SheetPortal>
      {overlay && <SheetOverlay />}
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        // Light glass surface (more see-through than the desktop `--panel`) so the scene still
        // reads through it; `overflow-visible` lets the bottom sheet paint its top ruler outside
        // its edge (cards scroll in the inner `.sheet-body`, see RailDock). `p-3` = the old 12px.
        className={cn(
          "fixed z-[41] flex flex-col gap-[var(--rail-gap)] p-3 overflow-visible",
          "bg-[rgba(12,16,32,0.35)] border border-[rgba(178,193,223,0.10)] backdrop-blur-[7px]",
          // `!` needed: SHEET_SIDE's `data-[state=open]:animate-sheet-in-*` compiles to
          // class+attribute specificity (0,2,0), which would beat this (0,1,0) variant —
          // the retired CSS used `animation: none !important` for the same reason.
          "motion-reduce:!animate-none",
          SHEET_SIDE[side],
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetTitle,
}

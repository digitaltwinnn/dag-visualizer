import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// The design-system Card baseline. Themed with the app's `ig-panel` glass recipe in its base
// class (so a Card IS a rail-card frame), and given an idiomatic `asChild` (radix-ui `Slot`,
// exactly like `Button`) so consumers can keep their own element + a11y role — the rail cards
// render as `<Card asChild><aside …>` to preserve `<aside>`/`complementary` semantics while the
// Card supplies the frame. RailThread measures `:scope > .ig-panel`, so `ig-panel` must survive
// in every merged output — it leads the base class and consumers only ADD to it.
//
// Default spacing (`gap-4 py-4 pl-5 pr-4`) is the baseline OPINION; consumers whose today-spacing
// differs override it via `className` (tailwind-merge resolves the conflict, className wins) — the
// migration rule is "the consumer's current spacing wins; do not visually change a card". The
// right-rail frame's exact override lives once as `RIGHT_CARD` in `CardHead.tsx`.
function Card({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="card"
      className={cn(
        "ig-panel text-card-foreground flex flex-col gap-4 py-4 pl-5 pr-4",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}

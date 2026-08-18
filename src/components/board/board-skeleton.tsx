import { Skeleton } from "@/components/ui/skeleton";

/**
 * Streams in place of the columns while the day's orders load.
 *
 * Deliberately *not* a route-level `loading.tsx`. A loading boundary above a
 * page starts the response before the page resolves, which means `notFound()`
 * can no longer set a 404 status — an unknown order id would answer 200 with
 * not-found markup. Keeping the boundary inside the board gives the same
 * streaming without imposing that on `/orders/[id]`.
 */
export function BoardSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-busy>
      {[0, 1].map((column) => (
        <div key={column} className="rounded-lg border bg-muted/40">
          <div className="border-b bg-card/60 px-4 py-2.5">
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="flex flex-col gap-3 p-3">
            {[0, 1, 2].map((card) => (
              <Skeleton key={card} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

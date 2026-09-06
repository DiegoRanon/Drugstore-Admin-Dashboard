"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, LoaderCircle, MapPin, TriangleAlert } from "lucide-react";

import type { PlaceSuggestion, ResolvedPlace } from "@/api/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** What the form needs to submit: the text, and the geocode behind it. */
export type AddressValue = {
  address: string;
  place_id: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
};

export function emptyAddress(address = ""): AddressValue {
  return {
    address,
    place_id: null,
    formatted_address: null,
    latitude: null,
    longitude: null,
  };
}

/**
 * Address entry with Google Places suggestions, brokered by the server.
 *
 * Modelled on the patient picker — debounced fetch to a same-origin Route
 * Handler, `AbortController`, server-side filtering — but built around a real
 * text input rather than a button, because an address is typed and a patient
 * is looked up.
 *
 * TYPING IS ALWAYS ALLOWED
 *
 * A rural address, a brand-new building, or a Google outage must never stop an
 * employee from taking an order with a patient on the phone. So this is an
 * input with a suggestion list attached, not a select: whatever is in the box
 * is what gets submitted. Picking a suggestion additionally fills in the
 * coordinates, which is what lets the stop be routed rather than appended.
 * The hint below the field says which of the two happened, quietly.
 *
 * SESSION TOKENS
 *
 * Google bills a burst of keystrokes plus one details lookup as a single
 * autocomplete session, keyed by a token the caller invents. One token per
 * address being picked: minted on first keystroke, spent on selection, then
 * retired so the next address starts a new session.
 */
export function AddressPicker({
  name,
  id,
  defaultValue,
  required,
  onResolved,
}: {
  /** Base field name. Hidden geocode inputs are derived from it. */
  name: string;
  id?: string;
  defaultValue?: AddressValue;
  required?: boolean;
  /** Lets a parent react to a pick, e.g. to show the standardized form. */
  onResolved?: (place: ResolvedPlace) => void;
}) {
  const t = useTranslations();
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const listId = `${fieldId}-suggestions`;

  const [value, setValue] = useState<AddressValue>(
    defaultValue ?? emptyAddress(),
  );
  const [query, setQuery] = useState(defaultValue?.address ?? "");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const sessionToken = useRef<string | null>(null);
  // Set while a suggestion is being applied, so the effect that reacts to
  // `query` does not immediately reopen the list under the new text.
  const justPicked = useRef(false);

  function startSession(): string {
    sessionToken.current ??= crypto.randomUUID();
    return sessionToken.current;
  }

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }

    const term = query.trim();
    const controller = new AbortController();

    // Everything, including clearing a too-short query, happens on the debounce
    // timer rather than synchronously in the effect body — partly because
    // setState during an effect cascades renders, and partly because it reads
    // better: the list settles once, 250ms after typing stops, instead of
    // blinking away on the third backspace and back on the next keystroke.
    const timer = setTimeout(() => {
      if (term.length < 3) {
        setSuggestions([]);
        setOpen(false);
        return;
      }

      setLoading(true);
      const token = startSession();

      fetch(
        `/api/places/autocomplete?q=${encodeURIComponent(term)}&session_token=${encodeURIComponent(token)}`,
        { signal: controller.signal, cache: "no-store" },
      )
        .then((response) => (response.ok ? response.json() : { data: [] }))
        .then((payload: { data: PlaceSuggestion[] }) => {
          setSuggestions(payload.data);
          setHighlighted(0);
          setOpen(payload.data.length > 0);
        })
        // An aborted keystroke is the normal case, not a failure. A real
        // outage lands here too and leaves the field working as plain text.
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  async function pick(suggestion: PlaceSuggestion) {
    const token = startSession();
    const typed = `${suggestion.primary_text}, ${suggestion.secondary_text}`;

    justPicked.current = true;
    setOpen(false);
    setSuggestions([]);
    setQuery(typed);
    setResolving(true);

    try {
      const response = await fetch(
        `/api/places/resolve?place_id=${encodeURIComponent(suggestion.place_id)}&session_token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("resolve failed");

      const place = (await response.json()) as ResolvedPlace;

      justPicked.current = true;
      setQuery(place.formatted_address);
      setValue({
        address: place.formatted_address,
        place_id: place.place_id,
        formatted_address: place.formatted_address,
        latitude: place.latitude,
        longitude: place.longitude,
      });
      onResolved?.(place);
    } catch {
      // Keep the text the employee chose and drop the geocode. The order
      // still saves; the stop is appended to the route rather than placed.
      setValue(emptyAddress(typed));
    } finally {
      setResolving(false);
      // Session spent — the next address is a new one.
      sessionToken.current = null;
    }
  }

  function handleType(next: string) {
    setQuery(next);
    // Editing after a pick invalidates the coordinate: the text no longer
    // describes the place that was resolved. Better no geocode than one
    // pointing at the address the employee just corrected away from.
    setValue((current) =>
      current.place_id === null && current.address === next
        ? current
        : emptyAddress(next),
    );
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted(
        (index) => (index - 1 + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Enter") {
      // Only while the list is open — otherwise this is the user submitting
      // the form with a hand-typed address, which is allowed.
      event.preventDefault();
      const chosen = suggestions[highlighted];
      if (chosen) void pick(chosen);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const geocoded = value.latitude !== null;

  return (
    <div className="relative">
      <div className="relative">
        <Input
          id={fieldId}
          name={name}
          value={query}
          onChange={(event) => handleType(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Deferred so a click on a suggestion lands before the list closes.
            window.setTimeout(() => setOpen(false), 150);
          }}
          onFocus={() => setOpen(suggestions.length > 0)}
          maxLength={500}
          required={required}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {(loading || resolving) && (
          <LoaderCircle
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
      </div>

      {/*
        The geocode travels as hidden fields so the form stays inside its plain
        uncontrolled-FormData model, the same way package rows do.
      */}
      <input type="hidden" name={`${name}_place_id`} value={value.place_id ?? ""} />
      <input
        type="hidden"
        name={`${name}_formatted`}
        value={value.formatted_address ?? ""}
      />
      <input type="hidden" name={`${name}_latitude`} value={value.latitude ?? ""} />
      <input type="hidden" name={`${name}_longitude`} value={value.longitude ?? ""} />

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.place_id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                onMouseEnter={() => setHighlighted(index)}
                // mousedown, not click: blur fires first otherwise and the
                // list is gone before the click lands.
                onMouseDown={(event) => {
                  event.preventDefault();
                  void pick(suggestion);
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm",
                  index === highlighted && "bg-accent text-accent-foreground",
                )}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{suggestion.primary_text}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {suggestion.secondary_text}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        Advisory, never blocking. "Not located" is a perfectly valid order —
        it just tells the employee this stop will not take part in route
        optimization, while there is still time to pick a suggestion.
      */}
      {query.trim().length > 0 && !resolving && (
        <p
          className={cn(
            "mt-1.5 flex items-center gap-1.5 text-xs",
            geocoded ? "text-muted-foreground" : "text-amber-600 dark:text-amber-500",
          )}
        >
          {geocoded ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <TriangleAlert className="size-3.5" aria-hidden />
          )}
          {geocoded ? t("address.located") : t("address.notLocated")}
        </p>
      )}
    </div>
  );
}

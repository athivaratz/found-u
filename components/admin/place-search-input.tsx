"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeoPoint } from "@/lib/types";

export type PlaceSearchResult = {
  id: string;
  label: string;
  lat: number;
  lng: number;
};

type PlaceSearchInputProps = {
  onSelect: (place: GeoPoint & { label: string }) => void;
  className?: string;
  placeholder?: string;
};

const DEBOUNCE_MS = 400;

export function PlaceSearchInput({
  onSelect,
  className,
  placeholder = "ค้นหาสถานที่ เช่น โรงเรียนบดินทรเดชา…",
}: PlaceSearchInputProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
    setOpen(false);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      abortRef.current?.abort();
      setLoading(false);
      clearResults();
      return;
    }

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/geocode/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal, credentials: "same-origin" }
        );

        if (response.status === 429) {
          setError("ค้นหาถี่เกินไป กรุณารอสักครู่");
          setResults([]);
          setOpen(true);
          return;
        }

        if (!response.ok) {
          setError("ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง");
          setResults([]);
          setOpen(true);
          return;
        }

        const data = (await response.json()) as { results?: PlaceSearchResult[] };
        const next = Array.isArray(data.results) ? data.results : [];
        setResults(next);
        setError(next.length === 0 ? "ไม่พบสถานที่ที่ตรงกัน" : null);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง");
        setResults([]);
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query, clearResults]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!containerRef.current || !target) return;
      if (!containerRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  const handleSelect = (place: PlaceSearchResult) => {
    onSelect({ lat: place.lat, lng: place.lng, label: place.label });
    setQuery(place.label.split(",")[0]?.trim() || place.label);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={containerRef} className={cn("relative min-w-0", className)}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        ค้นหาสถานที่
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0 || error) setOpen(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="w-full pl-9 pr-10 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-line-green"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
          {query && !loading && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                clearResults();
              }}
              className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="ล้างการค้นหา"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {open && (results.length > 0 || error) && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg"
        >
          {error && results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-300">{error}</p>
          ) : (
            <ul className="py-1">
              {results.map((place) => (
                <li key={place.id} role="option">
                  <button
                    type="button"
                    onClick={() => handleSelect(place)}
                    className="w-full flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-[#06C755]" />
                    <span className="min-w-0 text-gray-800 dark:text-gray-100 leading-snug">
                      {place.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

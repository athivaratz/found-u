import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Found-U/0.3 (school lost-and-found; https://foundu.bodin2.ac.th)";
const MAX_RESULTS = 6;
const MIN_QUERY_LENGTH = 2;
/** Nominatim usage policy: max ~1 req/sec */
const MIN_INTERVAL_MS = 1100;

let lastRequestAt = 0;

async function isAdminUser(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("accounts").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin";
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await isAdminUser(user.id))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
};

export type GeocodePlace = {
  id: string;
  label: string;
  lat: number;
  lng: number;
};

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ results: [] as GeocodePlace[] });
  }

  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastRequestAt);
  if (wait > 0) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }
  lastRequestAt = now;

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(MAX_RESULTS));
  url.searchParams.set("countrycodes", "th");
  url.searchParams.set("addressdetails", "0");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Accept-Language": "th",
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Geocoding service unavailable" },
        { status: 502 }
      );
    }

    const data = (await response.json()) as NominatimResult[];
    const results: GeocodePlace[] = (Array.isArray(data) ? data : [])
      .map((item) => {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: String(item.place_id),
          label: item.display_name,
          lat,
          lng,
        } satisfies GeocodePlace;
      })
      .filter((item): item is GeocodePlace => item !== null);

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Geocoding request failed" }, { status: 502 });
  }
}

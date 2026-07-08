import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function resolveOrigin(request: Request): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");
  const requestOrigin = new URL(request.url).origin;

  return forwardedProto && forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : host
      ? `${requestOrigin.startsWith("https://") ? "https" : "http"}://${host}`
      : requestOrigin;
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export function GET(request: Request) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || resolveOrigin(request);

  return NextResponse.json(
    {
      url: origin,
      name: "Flipo",
      iconUrl: `${origin}/tonconnect-icon.png`,
      termsOfUseUrl: `${origin}/terms`,
      privacyPolicyUrl: `${origin}/privacy`,
    },
    {
      headers: {
        ...corsHeaders,
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}

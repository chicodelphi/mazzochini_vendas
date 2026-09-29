import { NextResponse } from "next/server";
import { buildOpenApi } from "@/lib/openapi";

export const GET = () => NextResponse.json(buildOpenApi());

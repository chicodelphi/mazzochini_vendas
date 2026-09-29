import { route } from "@/lib/http";

export const GET = route({}, async (_req, { session }) => ({ user: session }));

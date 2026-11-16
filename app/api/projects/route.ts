/**
 * [74] /api/projects — thin route: all parsing, validation and error mapping
 * live in the projects module server seam (`projects/api.ts`).
 */
import {
   projectCreateResponse,
   projectsListResponse,
} from "@/src/modules/studio/projects/api";

export async function GET(): Promise<Response> {
   return projectsListResponse();
}

export async function POST(request: Request): Promise<Response> {
   return projectCreateResponse(request);
}

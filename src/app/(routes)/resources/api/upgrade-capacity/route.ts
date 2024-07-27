import { NextRequest } from "next/server";
import { option, responder, targetPoint } from "@/app/api/config";

export async function POST(request: NextRequest) {
    const body = await request.json();

    const endPointUrl = targetPoint(`user/game/upgrade-capacity`);
    const serverResponse = await fetch(endPointUrl, option("POST", body));

    return responder(serverResponse);
}

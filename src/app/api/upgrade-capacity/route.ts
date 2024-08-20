import { NextRequest } from "next/server";
import { option, responder, targetPoint } from "@/app/api/config";

export async function PUT(request: NextRequest) {
  const body = await request.json();

  const endPointUrl = targetPoint(`userAssets/updateQuantity`);
  const serverResponse = await fetch(endPointUrl, option("PUT", body));

  return responder(serverResponse);
}

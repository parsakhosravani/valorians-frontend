import { targetPoint, option, responder } from "../config";

export async function GET() {
  const url = targetPoint("userAssets", "internal");
  const options = option("GET");

  const response = await fetch(url, options);
  return responder(response);
}

export async function PUT(request: Request) {
  const url = targetPoint("userAssets/updateQuantity/1", "internal");
  const options = option("PUT", await request.json());
  const response = await fetch(url, options);
  return responder(response);
}

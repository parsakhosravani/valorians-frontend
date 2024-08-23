import { targetPoint, option, responder } from "../config";

export async function GET() {
  const url = targetPoint("userAssets", "internal");
  const options = option("GET");

  const response = await fetch(url, options);
  return responder(response);
}

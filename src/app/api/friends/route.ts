import { targetPoint, option, responder } from "../config";

export async function GET() {
  const url = targetPoint("friends", "internal");
  const options = option("GET");

  const response = await fetch(url, options);
  return responder(response);
}
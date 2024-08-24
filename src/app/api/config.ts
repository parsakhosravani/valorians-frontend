import { cookies } from "next/headers";

export const targetPoint = (
  query: string,
  type?: "internal" | "external"
): string => {
  const serverUrlInternal = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const serverUrlExternal = process.env.API_BASE_URL ?? "";
  return `${
    type === "internal" ? serverUrlInternal : serverUrlExternal
  }${query}`;
};

type HttpMethod = "POST" | "GET" | "PUT" | "DELETE";

const createHeaders = () => {
  const token = cookies().get("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3MzE2ZGNjNi1lZGUwLTRiYTItYTYzMS1lOGE1ZTZiOWVjMjUiLCJ1c2VybmFtZSI6IkVyZmFuIEFiYmFzaSAiLCJpYXQiOjE3MjQ1MjkzMjksImV4cCI6MTcyNDU0MDEyOX0.JpLKZJlsJKavOlXxy-LbMVSllLF3sBU1s_ut6AUDiJ4`,
    "X-Hash": "process.env.X_Hash",
  };
};

export const option = (method: HttpMethod, body?: object) => {
  const headers = createHeaders();
  const options: RequestInit = { method, headers };

  if (method !== "GET" && body) {
    options.body = JSON.stringify(body);
  }

  return options;
};

export const optionFormData = (method: "POST" | "PUT", body: FormData) => {
  const headers = createHeaders();
  const { "Content-Type": _, ...restHeaders } = headers;
  return { method, headers: restHeaders, body };
};

export const responder = async (responseServer: Response) => {
  if (responseServer.ok) {
    const responseData = await responseServer.json();
    return new Response(JSON.stringify(responseData.result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } else {
    const errorText = await responseServer.text();
    return new Response(errorText, { status: responseServer.status });
  }
};

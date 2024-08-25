export const fetcher = (url: string, options?: RequestInit) =>
  fetch(url, options).then((res) => {
    if (res.ok) return res.json();
    else
      return res.json().then((re) => {
        throw re;
      });
  });

export const fetcherWithToken = (url: string, options?: RequestInit) => {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyMzUzODJmOC05ZDI5LTQ5ZWEtYWVhNC01OTQxYjdhMjUxMmYiLCJ1c2VybmFtZSI6IkVyZmFuIEFiYmFzaSAiLCJpYXQiOjE3MjQ2MDY2MDYsImV4cCI6MTcyNDYxNzQwNn0.2OrmktlZd72qiu5rZwInXJHo59zoleXD0JsoHh2L37o`,
  };
  return fetch(url, { ...options, headers }).then((res) => {
    if (res.ok) return res.json();
    else
      return res.json().then((re) => {
        throw re;
      });
  });
};

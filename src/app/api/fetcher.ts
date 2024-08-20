export const fetcher = (url: string, options?: RequestInit) =>
  fetch(url, options).then((res) => {
    if (res.ok) return res.json();
    else
      return res.json().then((re) => {
        throw re;
      });
  });

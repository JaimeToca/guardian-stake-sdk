export function buildUrl(
  base: string,
  path: string,
  query: Record<string, string>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    params.set(key, value.toString());
  }
  return `${base}${path}?${params}`;
}

export async function performOrError<T>(request: Request): Promise<T> {
  try {
    const res = await fetch(request);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `Network request failed: ${res.status}: ${res.statusText} - ${errorText}`
      );
    }

    const data = (await res.json()) as T;
    return data;
  } catch (err) {
    console.error(`Failed with error:`, err);
    throw err;
  }
}

export type GraphQueryParams = Record<
  string,
  string | number | boolean | undefined
>;

export function generateGraphUrl(
  baseUrl: string,
  params: GraphQueryParams,
): string {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.append(key, String(value));
  }

  return url.toString();
}

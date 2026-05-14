export interface OwnedUpdateQuery {
  eq(column: string, value: string): OwnedUpdateQuery
  select(columns: string): {
    maybeSingle(): Promise<{ data: { id: string } | null; error: { message: string } | null }>
  }
}

export function getBearerToken(headers: Headers): string | null {
  const authorization = headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export function applyOwnedRowFilter(
  query: OwnedUpdateQuery,
  rowId: string,
  userId: string,
): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  return query
    .eq('id', rowId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()
}

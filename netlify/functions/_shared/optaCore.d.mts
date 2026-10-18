export function handleOpta(args: {
  feed: string | null | undefined
  fx: string | null | undefined
  authHeader: string | undefined
  env: Record<string, string | undefined>
}): Promise<{ status: number; headers: Record<string, string>; body: string }>

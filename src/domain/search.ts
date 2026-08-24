export type SearchRecord = { organizationId: string; id: string; kind: 'transaction' | 'person' | 'debt'; searchable: string; restrictedRoles?: string[] }
export type SearchViewer = { organizationId: string; role: 'owner' | 'manager' | 'accountant' | 'cashier' | 'viewer' | 'compliance_officer' }

export function searchRecords(records: SearchRecord[], query: string, viewer: SearchViewer): SearchRecord[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  return records.filter((record) => record.organizationId === viewer.organizationId && (!record.restrictedRoles || record.restrictedRoles.includes(viewer.role)) && record.searchable.toLocaleLowerCase().includes(needle))
}

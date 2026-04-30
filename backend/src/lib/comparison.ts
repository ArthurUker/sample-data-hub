import type { ComparisonInput, CompStatus } from './types'

export interface ComparisonOutput {
  sampleId: string
  projectName: string
  versionIds: string[]
  minCt: number | null
  maxCt: number | null
  ctDiff: number | null
  threshold: number
  compStatus: CompStatus
  needsReview: boolean
}

export function calculateComparison(input: ComparisonInput): ComparisonOutput {
  const { sampleId, projectName, snapshots, threshold } = input

  const versionIds = snapshots.map((s) => s.versionId)
  const hasAnyMissing = snapshots.some((s) => s.isMissing)

  if (hasAnyMissing || snapshots.length === 0) {
    return { sampleId, projectName, versionIds, minCt: null, maxCt: null, ctDiff: null, threshold, compStatus: 'MISSING_DATA', needsReview: true }
  }

  const ctValues = snapshots
    .map((s) => s.ctValue)
    .filter((v): v is number => v !== null && v !== undefined)

  if (ctValues.length === 0) {
    return { sampleId, projectName, versionIds, minCt: null, maxCt: null, ctDiff: null, threshold, compStatus: 'MISSING_DATA', needsReview: true }
  }

  const minCt = Math.min(...ctValues)
  const maxCt = Math.max(...ctValues)
  const ctDiff = parseFloat((maxCt - minCt).toFixed(4))
  const isDivergent = ctDiff > threshold

  return {
    sampleId, projectName, versionIds, minCt, maxCt, ctDiff, threshold,
    compStatus: isDivergent ? 'DIVERGENT' : 'CONSISTENT',
    needsReview: isDivergent,
  }
}

export function calculateAllComparisons(
  sampleId: string,
  snapshotsByVersion: Array<{
    versionId: string
    snapshots: Array<{ projectName: string; ctValue: number | null; isMissing: boolean }>
  }>,
  threshold: number
): ComparisonOutput[] {
  const projectMap = new Map<
    string,
    Array<{ versionId: string; ctValue: number | null; isMissing: boolean }>
  >()

  for (const { versionId, snapshots } of snapshotsByVersion) {
    for (const snap of snapshots) {
      const existing = projectMap.get(snap.projectName) ?? []
      existing.push({ versionId, ctValue: snap.ctValue, isMissing: snap.isMissing })
      projectMap.set(snap.projectName, existing)
    }
  }

  const results: ComparisonOutput[] = []
  for (const [projectName, items] of projectMap.entries()) {
    results.push(calculateComparison({ sampleId, projectName, snapshots: items, threshold }))
  }
  return results
}

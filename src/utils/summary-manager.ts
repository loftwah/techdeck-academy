import { promises as fs } from 'fs'
import path from 'path'
import type { Summary, Challenge } from '../types.js'
import { readJsonFileWithSchema, writeJsonFileWithSchema } from './file-operations.js'
import { SummarySchema } from '../schemas.js'
import { PATHS } from './files.js'

// Path relative to DATA_DIR used by file-operations
const SUMMARY_FILE_PATH = path.join('progress', 'summary.json')

// Default summary structure
const DEFAULT_SUMMARY: Summary = {
  meta: {
    lastUpdated: new Date().toISOString(),
    activeCount: 0,
    archivedCount: 0
  },
  activeChallenges: [],
  archivedChallenges: []
}

// Refactored readSummary using the utility
export async function readSummary(): Promise<Summary> {
  try {
    const summary = await readJsonFileWithSchema<Summary>(SUMMARY_FILE_PATH, SummarySchema)
    return summary ?? DEFAULT_SUMMARY
  } catch (error) {
    console.error(`Error reading or validating summary file (${SUMMARY_FILE_PATH}):`, error)
    console.warn('Returning default summary due to error.')
    return DEFAULT_SUMMARY
  }
}

// Refactored writeSummary using the utility
export async function writeSummary(summary: Summary): Promise<void> {
  try {
    await writeJsonFileWithSchema<Summary>(SUMMARY_FILE_PATH, summary, SummarySchema)
    console.log('Summary data saved successfully.')
  } catch (error) {
    console.error(`Error writing or validating summary file (${SUMMARY_FILE_PATH}):`, error)
    throw error
  }
}

// --- Functions modifying summary --- 
// Benefit from validated read/write implicitly

export async function addActiveChallengeToSummary(challenge: Challenge): Promise<void> {
  const summary = await readSummary()
  summary.activeChallenges.push(challenge)
  summary.meta.activeCount = summary.activeChallenges.length
  summary.meta.lastUpdated = new Date().toISOString()
  await writeSummary(summary)
}

export async function archiveChallengeInSummary(challengeId: string): Promise<void> {
  const summary = await readSummary()
  const challengeIndex = summary.activeChallenges.findIndex(c => c.id === challengeId)

  if (challengeIndex !== -1) {
    const [challengeToArchive] = summary.activeChallenges.splice(challengeIndex, 1)
    summary.archivedChallenges.push({
      id: challengeToArchive.id,
      title: challengeToArchive.title,
      createdAt: challengeToArchive.createdAt,
      archivedAt: new Date().toISOString()
    })
    summary.meta.activeCount = summary.activeChallenges.length
    summary.meta.archivedCount = summary.archivedChallenges.length
    summary.meta.lastUpdated = new Date().toISOString()
    await writeSummary(summary)
  } else {
    console.warn(`Challenge ${challengeId} not found in active summary for archiving.`)
  }
}

export async function pruneOldSummaryEntries(thresholdDays: number): Promise<void> {
  const summary = await readSummary()
  const now = Date.now()

  // Remove archived challenges older than threshold
  summary.archivedChallenges = summary.archivedChallenges.filter(challenge => {
    const age = (now - new Date(challenge.archivedAt).getTime()) / (1000 * 60 * 60 * 24)
    return age <= thresholdDays
  })

  summary.meta.archivedCount = summary.archivedChallenges.length
  summary.meta.lastUpdated = new Date().toISOString()

  await writeSummary(summary)
}

export async function getContextForAI(operationType: 'challenge' | 'feedback'): Promise<object> {
  const summary = await readSummary()

  if (operationType === 'challenge') {
    // For challenge generation, provide recent challenges to avoid repetition
    return {
      recentChallenges: summary.activeChallenges.slice(-5),
      totalActive: summary.meta.activeCount,
      totalArchived: summary.meta.archivedCount
    }
  } else {
    // For feedback, provide all active challenges for context
    return {
      activeChallenges: summary.activeChallenges,
      totalChallenges: summary.meta.activeCount + summary.meta.archivedCount
    }
  }
} 
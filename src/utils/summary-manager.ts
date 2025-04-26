import { promises as fs } from 'fs'
import path from 'path'
import type { Summary, Challenge } from '../types.js'
import { PATHS } from './files.js'

const SUMMARY_FILE = path.join('challenges', 'summary.json')

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

export async function readSummary(): Promise<Summary> {
  try {
    const content = await fs.readFile(SUMMARY_FILE, 'utf-8')
    return JSON.parse(content) as Summary
  } catch (error) {
    // Return default summary if file doesn't exist
    return DEFAULT_SUMMARY
  }
}

export async function writeSummary(summary: Summary): Promise<void> {
  await fs.mkdir(path.dirname(SUMMARY_FILE), { recursive: true })
  await fs.writeFile(SUMMARY_FILE, JSON.stringify(summary, null, 2))
}

export async function addChallengeToSummary(challenge: Challenge): Promise<void> {
  const summary = await readSummary()

  // Add to active challenges
  summary.activeChallenges.push(challenge)
  summary.meta.activeCount++
  summary.meta.lastUpdated = new Date().toISOString()

  await writeSummary(summary)
}

export async function moveChallengeToArchived(
  challengeId: string,
  archivedAt = new Date().toISOString()
): Promise<void> {
  const summary = await readSummary()

  // Find the challenge
  const challengeIndex = summary.activeChallenges.findIndex(c => c.id === challengeId)
  if (challengeIndex === -1) {
    throw new Error(`Challenge ${challengeId} not found in active challenges`)
  }

  const challenge = summary.activeChallenges[challengeIndex]

  // Remove from active challenges
  summary.activeChallenges.splice(challengeIndex, 1)
  summary.meta.activeCount--

  // Add to archived challenges
  summary.archivedChallenges.push({
    id: challenge.id,
    title: challenge.title,
    createdAt: challenge.createdAt,
    archivedAt
  })
  summary.meta.archivedCount++
  summary.meta.lastUpdated = new Date().toISOString()

  await writeSummary(summary)
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
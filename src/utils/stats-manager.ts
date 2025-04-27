import { promises as fs } from 'fs'
import path from 'path'
import type { Stats, Challenge, Submission, Feedback } from '../types.js'
import { PATHS } from './files.js'
import { readJsonFileWithSchema, writeJsonFileWithSchema } from './file-operations.js'
import { StatsSchema } from '../schemas.js'

const STATS_FILE_PATH = path.join('progress', 'stats.json')

// Default stats structure
const DEFAULT_STATS: Stats = {
  meta: {
    lastCompaction: new Date().toISOString(),
    version: 1,
    retentionPolicy: {
      daily: 30,
      weekly: 90,
      monthly: 365
    }
  },
  challenges: {
    daily: [],
    weekly: [],
    monthly: []
  },
  submissions: {
    daily: [],
    weekly: [],
    monthly: []
  },
  topics: {},
  activity: {
    daysActive: 0,
    streakCurrent: 0,
    streakLongest: 0,
    preferredTimes: []
  }
}

export async function readStats(): Promise<Stats> {
  try {
    const stats = await readJsonFileWithSchema<Stats>(STATS_FILE_PATH, StatsSchema)
    return stats ?? DEFAULT_STATS
  } catch (error) {
    console.error(`Error reading or validating stats file (${STATS_FILE_PATH}):`, error)
    console.warn('Returning default stats due to error.')
    return DEFAULT_STATS
  }
}

export async function writeStats(stats: Stats): Promise<void> {
  try {
    await writeJsonFileWithSchema<Stats>(STATS_FILE_PATH, stats, StatsSchema)
    console.log('Stats data saved successfully.')
  } catch (error) {
    console.error(`Error writing or validating stats file (${STATS_FILE_PATH}):`, error)
    throw error
  }
}

export async function addChallengeStats(challenge: Challenge): Promise<void> {
  const stats = await readStats()
  const date = new Date().toISOString()

  // Add to daily stats
  stats.challenges.daily.push({
    date,
    count: 1,
    details: {
      challengeId: challenge.id,
      topics: challenge.topics,
      difficulty: challenge.difficulty
    }
  })

  // Update topic stats
  for (const topic of challenge.topics) {
    if (!stats.topics[topic]) {
      stats.topics[topic] = {
        completedChallenges: 0,
        lastActivity: date
      }
    }
    stats.topics[topic].lastActivity = date
  }

  await writeStats(stats)
}

/**
 * Adds stats for a completed submission.
 * @param challengeId The ID of the challenge submitted.
 * @param submittedAt ISO string timestamp of when the submission was processed.
 * @param feedback The feedback object generated (contains the unique feedback/submission ID).
 */
export async function addSubmissionStats(
  challengeId: string,
  submittedAt: string,
  feedback: Feedback
): Promise<void> {
  const stats = await readStats()
  const date = submittedAt

  // Add to daily stats
  stats.submissions.daily.push({
    date,
    count: 1,
    details: {
      submissionId: feedback.submissionId,
      challengeId: challengeId
    }
  })

  // Update activity
  const todayDate = new Date(submittedAt)
  const todayString = todayDate.toDateString()
  const lastActive = stats.activity.lastActivity ? new Date(stats.activity.lastActivity).toDateString() : null
  
  if (todayString !== lastActive) {
    stats.activity.daysActive++
    const yesterday = new Date(todayDate)
    yesterday.setDate(todayDate.getDate() - 1)
    const yesterdayString = yesterday.toDateString()

    if (lastActive === yesterdayString) {
      stats.activity.streakCurrent++
    } else {
      stats.activity.streakCurrent = 1
    }
    stats.activity.streakLongest = Math.max(
      stats.activity.streakCurrent,
      stats.activity.streakLongest
    )
  }

  // Update preferred times
  const hour = new Date(submittedAt).getHours()
  stats.activity.preferredTimes.push(`${hour}:00`)
  stats.activity.preferredTimes = stats.activity.preferredTimes.slice(-100)
  
  // Update lastActivity timestamp
  stats.activity.lastActivity = date

  await writeStats(stats)
}

export async function aggregateOldEntries(): Promise<void> {
  const stats = await readStats()
  const now = Date.now()

  // Aggregate daily to weekly
  const oldDailyChallenges = stats.challenges.daily.filter(entry => {
    const age = (now - new Date(entry.date).getTime()) / (1000 * 60 * 60 * 24)
    return age > stats.meta.retentionPolicy.daily
  })

  if (oldDailyChallenges.length > 0) {
    // Group by week
    const weeklyGroups = groupByWeek(oldDailyChallenges)
    stats.challenges.weekly.push(...weeklyGroups)
    
    // Remove old daily entries
    stats.challenges.daily = stats.challenges.daily.filter(entry => {
      const age = (now - new Date(entry.date).getTime()) / (1000 * 60 * 60 * 24)
      return age <= stats.meta.retentionPolicy.daily
    })
  }

  // Similar aggregation for submissions...
  // (Implement similar logic for submissions)

  stats.meta.lastCompaction = new Date().toISOString()
  await writeStats(stats)
}

// Helper function to group daily stats into weekly
function groupByWeek(dailyStats: Array<{ date: string; count: number; details: any }>) {
  const weeks: Record<string, any[]> = {}
  
  for (const stat of dailyStats) {
    const date = new Date(stat.date)
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - date.getDay())
    const weekKey = weekStart.toISOString()
    
    if (!weeks[weekKey]) {
      weeks[weekKey] = []
    }
    weeks[weekKey].push(stat)
  }

  return Object.entries(weeks).map(([weekStart, stats]) => {
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    
    return {
      weekStart,
      weekEnd: weekEnd.toISOString(),
      count: stats.reduce((sum, stat) => sum + stat.count, 0),
      summary: {
        totalEntries: stats.length,
        details: stats.map(s => s.details)
      }
    }
  })
}

export async function shouldCompactStats(): Promise<boolean> {
  try {
    const dataDirRoot = path.resolve(process.cwd(), 'data')
    const absoluteStatsPath = path.resolve(dataDirRoot, STATS_FILE_PATH)
    const fileStats = await fs.stat(absoluteStatsPath)
    const sizeMB = fileStats.size / (1024 * 1024)
    if (sizeMB > 5) return true // Compact if larger than 5MB

    const statsData = await readStats()
    const lastCompaction = statsData.meta.lastCompaction
    const daysSinceCompaction = 
      (Date.now() - new Date(lastCompaction).getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceCompaction > 7 // Compact if more than 7 days old
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    console.error("Error checking if stats need compaction:", error)
    return false
  }
} 
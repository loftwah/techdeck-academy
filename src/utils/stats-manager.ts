import { promises as fs } from 'fs'
import path from 'path'
import type { Stats, Challenge, Submission, Feedback } from '../types.js'
import { PATHS } from './files.js'

const STATS_FILE = path.join('progress', 'stats.json')

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
  scores: [],
  activity: {
    daysActive: 0,
    streakCurrent: 0,
    streakLongest: 0,
    preferredTimes: []
  }
}

export async function readStats(): Promise<Stats> {
  try {
    const content = await fs.readFile(STATS_FILE, 'utf-8')
    return JSON.parse(content) as Stats
  } catch (error) {
    // Return default stats if file doesn't exist
    return DEFAULT_STATS
  }
}

export async function writeStats(stats: Stats): Promise<void> {
  await fs.mkdir(path.dirname(STATS_FILE), { recursive: true })
  await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2))
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
        averageScore: 0,
        lastActivity: date
      }
    }
    stats.topics[topic].lastActivity = date
  }

  await writeStats(stats)
}

export async function addSubmissionStats(
  submission: Submission,
  feedback: Feedback
): Promise<void> {
  const stats = await readStats()
  const date = new Date().toISOString()

  // Add to daily stats
  stats.submissions.daily.push({
    date,
    count: 1,
    details: {
      submissionId: submission.challengeId,
    }
  })

  // Update activity
  const today = new Date().toDateString()
  const lastActive = new Date(stats.activity.lastActivity || 0).toDateString()
  
  if (today !== lastActive) {
    stats.activity.daysActive++
    if (today === new Date(lastActive).toDateString() + 1) {
      stats.activity.streakCurrent++
      stats.activity.streakLongest = Math.max(
        stats.activity.streakCurrent,
        stats.activity.streakLongest
      )
    } else {
      stats.activity.streakCurrent = 1
    }
  }

  // Update preferred times
  const hour = new Date().getHours()
  stats.activity.preferredTimes.push(`${hour}:00`)
  // Keep only the last 100 times
  stats.activity.preferredTimes = stats.activity.preferredTimes.slice(-100)

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
    const stats = await fs.stat(STATS_FILE)
    const sizeMB = stats.size / (1024 * 1024)
    if (sizeMB > 5) return true // Compact if larger than 5MB

    const lastCompaction = (await readStats()).meta.lastCompaction
    const daysSinceCompaction = 
      (Date.now() - new Date(lastCompaction).getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceCompaction > 7 // Compact if more than 7 days old
  } catch {
    return false
  }
} 
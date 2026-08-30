import type { Insight } from '../domain/insights'
import { EmptyState } from './common'

export function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return <EmptyState title="No insights yet">Record expenses for this month to generate insights.</EmptyState>
  }
  return (
    <ul className="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {insights.map((insight) => (
        <li className={`insight ${insight.tone}`} key={insight.id}>
          <span className="insight-label">{insight.label}</span>
          <span className="insight-text">{insight.text}</span>
        </li>
      ))}
    </ul>
  )
}

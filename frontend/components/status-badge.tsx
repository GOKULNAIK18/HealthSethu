import clsx from 'clsx'

interface Props {
  status: 'Active' | 'Resolved' | 'Escalated'
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, size = 'md' }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-medium rounded-full border',
        {
          'text-xs px-2 py-0.5': size === 'sm',
          'text-xs px-2.5 py-1': size === 'md',
        },
        {
          'bg-sky-500/15 text-sky-400 border-sky-500/30': status === 'Active',
          'bg-emerald-500/15 text-emerald-400 border-emerald-500/30': status === 'Resolved',
          'bg-orange-500/15 text-orange-400 border-orange-500/30': status === 'Escalated',
        }
      )}
    >
      {status}
    </span>
  )
}

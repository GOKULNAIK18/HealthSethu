import clsx from 'clsx'

interface Props {
  severity: 'Early' | 'Moderate' | 'Severe'
  size?: 'sm' | 'md' | 'lg'
  pulse?: boolean
}

export default function SeverityBadge({ severity, size = 'md', pulse = false }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-semibold rounded-full border',
        {
          'text-xs px-2 py-0.5': size === 'sm',
          'text-xs px-2.5 py-1': size === 'md',
          'text-sm px-3 py-1.5': size === 'lg',
        },
        {
          'bg-emerald-500/15 text-emerald-400 border-emerald-500/30': severity === 'Early',
          'bg-amber-500/15 text-amber-400 border-amber-500/30': severity === 'Moderate',
          'bg-red-500/15 text-red-400 border-red-500/30': severity === 'Severe',
        }
      )}
    >
      <span
        className={clsx('rounded-full', {
          'w-1.5 h-1.5': size !== 'lg',
          'w-2 h-2': size === 'lg',
          'bg-emerald-400': severity === 'Early',
          'bg-amber-400': severity === 'Moderate',
          'bg-red-400': severity === 'Severe',
          'animate-pulse': pulse && severity === 'Severe',
        })}
      />
      {severity}
    </span>
  )
}

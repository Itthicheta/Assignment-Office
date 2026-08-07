const COLORS = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-pink-500']

export default function Avatar({ name, size = 7 }: { name: string; size?: 6 | 7 | 9 }) {
  // first 3 letters of the name (works for Thai and Latin alike)
  const label = [...name.trim()].slice(0, 3).join('').toUpperCase()
  const color = COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
  const sizeCls = size === 6 ? 'h-6 w-6 text-[8px]' : size === 9 ? 'h-9 w-9 text-[11px]' : 'h-7 w-7 text-[9px]'
  return (
    <span
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${color} ${sizeCls}`}
    >
      {label}
    </span>
  )
}

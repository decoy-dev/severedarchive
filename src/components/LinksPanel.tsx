const LINKS = [
  { label: 'INSTAGRAM', value: '@severedarchive', href: 'https://instagram.com/severedarchive' },
  { label: 'MAIL', value: 'CONTACT@SEVEREDARCHIVE', href: 'mailto:hello@example.com' },
  { label: 'COMMISSIONS', value: 'STATUS: OPEN', href: '#' },
]

export default function LinksPanel() {
  return (
    <div className="panel links-panel">
      {LINKS.map((l) => (
        <a key={l.label} className="link-row" href={l.href} target="_blank" rel="noreferrer">
          <span className="panel-label">{l.label}</span>
          <span className="link-value">{l.value}</span>
          <span className="link-go">►</span>
        </a>
      ))}
    </div>
  )
}

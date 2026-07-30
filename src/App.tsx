export default function App() {
  return (
    <div className="stage" data-booted="true">
      <div className="glass-strip top" />
      <div className="glass-strip bottom" />
      <div className="glass-strip left" />
      <div className="glass-strip right" />
      <div className="terminal-window">
        <header style={{ padding: '10px 14px', borderBottom: '1px solid var(--hair)' }}>
          SEVEREDARCHIVE // FILE SYSTEM
        </header>
      </div>
    </div>
  )
}

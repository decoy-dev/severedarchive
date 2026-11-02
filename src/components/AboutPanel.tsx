import { SITE_CONTENT } from '../data/content'

/**
 * The owner's copy, and nothing else. The panel is the scroll region: the
 * document never scrolls, but this copy is the owner's own and has no fixed
 * length, so when it outgrows the panel it scrolls inside it rather than being
 * clipped out of reach. See `.about-panel` for how it centres when it fits.
 */
export default function AboutPanel() {
  return (
    <div className="panel about-panel">
      {/* From `SITE_CONTENT`, which is also what the admin editor seeds itself
          from — the copy has one home rather than one per surface. */}
      <div className="about-copy">
        {SITE_CONTENT.about.map((block) => (
          <div className="panel-block" key={block.label}>
            <span className="panel-label">{block.label}</span>
            {block.big ? <p className="panel-big">{block.body}</p> : <p>{block.body}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

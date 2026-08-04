import { type ArchiveFile, formatDuration, posterSrc } from '../data/archive'

/**
 * A static poster tile — no video, ever (spec §2: "there is no focused video
 * in grid view"). The old focus-to-stage zoom and its SND toggle are gone;
 * a click just hands off to the activation policy via `onClick`.
 */
export default function FileCard({
  file, onClick, onSelect, selected,
}: {
  file: ArchiveFile
  onClick: () => void
  /** Hover and keyboard focus select — same contract as the explorer's tiles. */
  onSelect: () => void
  selected: boolean
}) {
  return (
    <button
      data-card
      data-file-id={file.id}
      className={selected ? 'file-card is-selected' : 'file-card'}
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
      // Selection only — it moves the backdrop and nothing else. Grid was the
      // one surface that never did this, so hovering a poster left the
      // background on whatever the list had last selected.
      onMouseEnter={onSelect}
      onFocus={onSelect}
    >
      <div className="file-card-media">
        <img src={posterSrc(file.id)} alt={file.name} />
      </div>
      <div className="file-card-label">
        <span>{file.name}<span className="tw-dim">.{file.ext}</span></span>
        <span className="tw-dim">{formatDuration(file.durationSec)}</span>
      </div>
    </button>
  )
}

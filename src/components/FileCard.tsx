import { type ArchiveFile, formatDuration, posterSrc } from '../data/archive'

/**
 * A static poster tile — no video, ever (spec §2: "there is no focused video
 * in grid view"). The old focus-to-stage zoom and its SND toggle are gone;
 * a click just hands off to the activation policy via `onClick`.
 */
export default function FileCard({ file, onClick }: { file: ArchiveFile; onClick: () => void }) {
  return (
    <button data-card data-file-id={file.id} className="file-card" onClick={onClick}>
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

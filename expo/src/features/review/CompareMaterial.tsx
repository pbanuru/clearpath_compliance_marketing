import type { Asset } from './model';
import { AssetViewer } from './AssetViewer';

export function CompareMaterial({
  previous,
  current,
  previousNumber,
  currentNumber,
}: {
  previous: Asset;
  current: Asset;
  previousNumber: number;
  currentNumber: number;
}) {
  if (previous.kind === 'text' && current.kind === 'text') {
    const oldLines = previous.content.text.split('\n');
    const newLines = current.content.text.split('\n');
    const oldSet = new Set(oldLines),
      newSet = new Set(newLines);
    return (
      <div className="cp-compare-text">
        <div className="cp-compare-legend">
          <span>Version {previousNumber}</span>
          <span>Version {currentNumber}</span>
        </div>
        <div className="cp-compare-grid">
          <div>
            {oldLines.map((line, i) => (
              <div key={i} className={newSet.has(line) ? 'cp-diff-line' : 'cp-diff-line removed'}>
                <span aria-label={newSet.has(line) ? undefined : 'Removed'}>
                  {newSet.has(line) ? ' ' : '−'}
                </span>
                {line || '\u00a0'}
              </div>
            ))}
          </div>
          <div>
            {newLines.map((line, i) => (
              <div key={i} className={oldSet.has(line) ? 'cp-diff-line' : 'cp-diff-line added'}>
                <span aria-label={oldSet.has(line) ? undefined : 'Added'}>
                  {oldSet.has(line) ? ' ' : '+'}
                </span>
                {line || '\u00a0'}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="cp-compare-grid">
      <section>
        <h3>Version {previousNumber}</h3>
        <AssetViewer key={previous._id} asset={previous} />
      </section>
      <section>
        <h3>Version {currentNumber}</h3>
        <AssetViewer key={current._id} asset={current} />
      </section>
    </div>
  );
}

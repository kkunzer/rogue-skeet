import type { ControlTestResult } from './schema';

export function resultToJSON(r: ControlTestResult, pretty = false): string {
  return JSON.stringify(r, null, pretty ? 2 : undefined);
}

export function resultFilename(r: ControlTestResult): string {
  const id = r.tester.id.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 24) || 'tester';
  return `skeet-control-test_${id}_${r.createdAt.slice(0, 10)}.json`;
}

export async function copyJSON(r: ControlTestResult): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(resultToJSON(r, true));
    return true;
  } catch {
    return false;
  }
}

export function canShare(r: ControlTestResult): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  return (
    typeof File === 'undefined' || !navigator.canShare || navigator.canShare({ files: [asFile(r)] })
  );
}

function asFile(r: ControlTestResult): File {
  return new File([resultToJSON(r, true)], resultFilename(r), { type: 'application/json' });
}

/** Web Share API: shares the JSON as a file when supported, else as text. */
export async function shareJSON(r: ControlTestResult): Promise<boolean> {
  try {
    if (navigator.canShare?.({ files: [asFile(r)] })) {
      await navigator.share({ files: [asFile(r)], title: 'Rogue Skeet control test' });
    } else {
      await navigator.share({ title: 'Rogue Skeet control test', text: resultToJSON(r, true) });
    }
    return true;
  } catch {
    return false;
  }
}

export function downloadJSON(r: ControlTestResult): void {
  const url = URL.createObjectURL(new Blob([resultToJSON(r, true)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = resultFilename(r);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import fs from 'fs';
import path from 'path';

// AskWorkspace.tsx was split into ./workspace/ (P2, FRD v1.103): the big cards, the concierge home, the history rail
// and the shared helpers live in their own files. These checks keep it from growing back and stop an import cycle.
const askDir = path.join(__dirname, '..');
const workspaceDir = path.join(askDir, 'workspace');
const read = (file: string) => fs.readFileSync(file, 'utf8');
const workspaceFiles = fs.readdirSync(workspaceDir).filter((name) => /\.tsx?$/.test(name));

describe('AskWorkspace split guardrails', () => {
  it('AskWorkspace.tsx stays under its ceiling and holds only the AskWorkspace component', () => {
    const source = read(path.join(askDir, 'AskWorkspace.tsx'));
    expect(source.split('\n').length).toBeLessThanOrEqual(650);
    const topLevel = source.split('\n').filter((line) => /^(export )?(async )?(function|const|class)\s/.test(line));
    expect(topLevel).toHaveLength(1);
    expect(topLevel[0]).toMatch(/^export function AskWorkspace\(/);
  });

  it('no workspace file imports AskWorkspace, and each stays below 700 lines', () => {
    expect(workspaceFiles.sort()).toEqual(['CaptureCards.tsx', 'ConciergeHome.tsx', 'ConversationHistoryNav.tsx', 'ExecutionCard.tsx', 'support.ts', 'useAskRequest.ts', 'useConversationHistory.ts', 'usePendingWork.ts', 'useResultRefresh.ts', 'useSessionHistoryActions.ts']);
    for (const name of workspaceFiles) {
      const source = read(path.join(workspaceDir, name));
      expect(source).not.toMatch(/from '(\.\.\/)?(\.\/)?AskWorkspace'/);
      expect(source.split('\n').length).toBeLessThan(700);
    }
  });

  it('AskWorkspace re-exports what existing imports use, and the workspace files import only lower layers', () => {
    const source = read(path.join(askDir, 'AskWorkspace.tsx'));
    expect(source).toMatch(/export \{ ConversationHistoryNav \} from '\.\/workspace\/ConversationHistoryNav'/);
    expect(source).toMatch(/export \{ draftStorageKey \} from '\.\/workspace\/support'/);
    expect(read(path.join(workspaceDir, 'support.ts'))).not.toMatch(/from '\.\/(CaptureCards|ConciergeHome|ConversationHistoryNav|ExecutionCard)'/);
  });
});

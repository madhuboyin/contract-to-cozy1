import fs from 'fs';
import path from 'path';

// AskWorkspace.tsx was split into ./workspace/ (P2, FRD v1.103): the big cards, the concierge home, the history rail
// and the shared helpers live in their own files. These checks keep it from growing back and stop an import cycle.
const askDir = path.join(__dirname, '..');
const workspaceDir = path.join(askDir, 'workspace');
const dashboardLayout = path.join(askDir, '..', '..', 'app', '(dashboard)', 'layout.tsx');
const read = (file: string) => fs.readFileSync(file, 'utf8');
const workspaceFiles = fs.readdirSync(workspaceDir).filter((name) => /\.tsx?$/.test(name));

describe('AskWorkspace split guardrails', () => {
  it('keeps collapsed navigation conversation-oriented instead of exposing domain modes', () => {
    const source = read(path.join(workspaceDir, 'CollapsedConversationRail.tsx'));
    expect(source).toContain('aria-label="Ask Cozy conversation navigation"');
    expect(source).toContain('aria-label="New conversation"');
    expect(source).toContain('aria-label="History"');
    expect(source).not.toContain('>Work</Link>');
    expect(source).not.toContain('>Record</Link>');
    expect(read(path.join(askDir, 'AskWorkspace.tsx'))).not.toContain('railExpanded && !calm');
  });
  it('AskWorkspace.tsx stays under its ceiling and holds only the AskWorkspace component', () => {
    const source = read(path.join(askDir, 'AskWorkspace.tsx'));
    expect(source.split('\n').length).toBeLessThanOrEqual(450);
    const topLevel = source.split('\n').filter((line) => /^(export )?(async )?(function|const|class)\s/.test(line));
    expect(topLevel).toHaveLength(1);
    expect(topLevel[0]).toMatch(/^export function AskWorkspace\(/);
  });

  it('no workspace file imports AskWorkspace, and each stays below 700 lines', () => {
    expect(workspaceFiles.sort()).toEqual(['AskShellHeader.tsx', 'CaptureCards.tsx', 'CollapsedConversationRail.tsx', 'ConciergeHome.tsx', 'ConversationHistoryNav.tsx', 'ExecutionCard.tsx', 'support.ts', 'useAskAccount.ts', 'useAskRequest.ts', 'useComposerKeys.ts', 'useConversationHistory.ts', 'usePendingWork.ts', 'useResponseContextPanel.ts', 'useResultRefresh.ts', 'useSelectedPropertyLabel.ts', 'useSessionHistoryActions.ts', 'useSessionLifecycle.ts']);
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

  it('pins footer follow-ups to the answer that declared them', () => {
    const source = read(path.join(askDir, 'AskWorkspace.tsx'));
    expect(source).toContain('latestExecution ? { sourceExecutionId: latestExecution.executionId } : undefined');
  });

  it('keeps the add-inventory workflow compact and balanced', () => {
    const source = read(path.join(workspaceDir, 'CaptureCards.tsx'));
    expect(source).toContain("request.captureKey === 'INVENTORY_ITEM_CREATE_INPUTS'");
    expect(source).toContain("data-compact-capture={compactMaintenanceTask ? 'maintenance-task' : compactInventoryCreate ? 'inventory-item-create'");
    expect(source).toContain("compactInventoryCreate && (field.key === 'name' || field.key === 'category')");
    expect(source).toContain('compact={compactWorkflow}');
  });

  it('pins the full-page composer to a stable dynamic viewport without sticky positioning', () => {
    const workspace = read(path.join(askDir, 'AskWorkspace.tsx'));
    const layout = read(dashboardLayout);
    expect(layout).toContain('viewportLocked={isAskWorkspace}');
    expect(layout).toContain("'h-full min-h-0 overflow-hidden");
    expect(read(path.join(askDir, '..', 'layout', 'AppShell.tsx'))).toContain('className="flex min-h-0 min-w-0 flex-1"');
    expect(workspace).toContain('data-ask-scroll-container');
    expect(workspace).not.toContain('?.scrollIntoView');
    expect(layout).not.toContain('lg:h-[calc(100dvh-72px)]');
    expect(workspace).toContain("<footer className={cn('shrink-0 border-t");
    expect(workspace).not.toContain("<footer className={cn('sticky bottom-0");
  });
});

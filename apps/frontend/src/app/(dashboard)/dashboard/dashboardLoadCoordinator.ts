export type DashboardLoadToken = Readonly<{
  key: string;
  revision: number;
}>;

type BeginDashboardLoadOptions = {
  force?: boolean;
};

/**
 * Coordinates the dashboard's imperative bootstrap without tying its lifecycle
 * to React object identity. A key is loaded automatically at most once; an
 * explicit retry may supersede it, and late responses from superseded loads are
 * ignored by checking their token before committing state.
 */
export function createDashboardLoadCoordinator() {
  let activeKey: string | null = null;
  let revision = 0;

  return {
    begin(key: string, options: BeginDashboardLoadOptions = {}): DashboardLoadToken | null {
      if (!options.force && activeKey === key) return null;

      activeKey = key;
      revision += 1;
      return { key, revision };
    },

    isCurrent(token: DashboardLoadToken): boolean {
      return token.key === activeKey && token.revision === revision;
    },
  };
}

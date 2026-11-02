/**
 * RIDB pages through the options of `find`, not through the selector. A Pluto
 * query carries `offset` and `limit` next to its selector, so the store hands
 * them to `find` with this helper. Kept free of runtime SDK imports so it can
 * be tested on its own.
 */

export type PageOptions = {
  offset?: number;
  limit?: number;
};

/**
 * The paging part of a query, as RIDB `find` options. Only the fields the
 * caller set are passed on, and a query without paging gives `undefined`, so
 * it still reads every row.
 */
export function pageOptions(query?: PageOptions): PageOptions | undefined {
  const page: PageOptions = {};
  if (query?.offset !== undefined) {
    page.offset = query.offset;
  }
  if (query?.limit !== undefined) {
    page.limit = query.limit;
  }
  return Object.keys(page).length > 0 ? page : undefined;
}

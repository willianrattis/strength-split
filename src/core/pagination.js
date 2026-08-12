// Pure pagination loop — no Firestore, no DOM, no state. The caller injects the page
// fetcher and holds no cursor itself; this drives it until the source reports `done`.
// See features/day/session-io.js's fetchAllSessions for the Firestore-backed caller.
export async function collectAllPages(fetchPage){
  const all = [];
  let cursor = null;
  for(;;){
    const { sessions, cursor: nextCursor, done } = await fetchPage(cursor);
    all.push(...sessions);
    if(done) break;
    // A cursor that doesn't advance would otherwise loop forever re-fetching the same
    // page. This is a defensive guard, not an expected path.
    if(nextCursor === cursor){
      console.warn("collectAllPages: cursor did not advance, stopping to avoid an infinite loop:", nextCursor);
      break;
    }
    cursor = nextCursor;
  }
  return all;
}

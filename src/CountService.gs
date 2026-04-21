/**
 * Selection counting now stored in PostgreSQL through backend API.
 */

function getSelectionDedupSet_(eventDate) {
  return {};
}

function getSelectionCountDedupSet_(weekKey, eventDateKey) {
  return {};
}

function countSelections_(weekKey, eventDate, selectedItems, source) {
  var items = Array.isArray(selectedItems) ? selectedItems : [];
  if (!items.length) {
    return { added: 0, skipped: 0, countedEmails: [] };
  }

  var eventDateKey = formatDate_(eventDate, 'yyyy-MM-dd');
  var result = apiPost_('/internal/increment-selection-counts', {
    weekKey: String(weekKey || ''),
    eventDate: eventDateKey,
    selectedItems: items,
    source: String(source || 'MANUAL')
  });

  return {
    added: Number(result.added || 0),
    skipped: Number(result.skipped || 0),
    countedEmails: Array.isArray(result.countedEmails) ? result.countedEmails : []
  };
}

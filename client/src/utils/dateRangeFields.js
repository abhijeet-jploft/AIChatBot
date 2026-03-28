/**
 * HTML date inputs use YYYY-MM-DD. Keep "to" >= "from" for paired range filters.
 */

export function nextToAfterFromChange(from, prevTo) {
  if (!from || !prevTo) return prevTo;
  return prevTo < from ? from : prevTo;
}

/** @param {string} from */
/** @param {string} candidateTo */
export function clampToNotBeforeFrom(from, candidateTo) {
  if (!from || !candidateTo) return candidateTo;
  return candidateTo < from ? from : candidateTo;
}

/** @param {string} to */
/** @param {string} candidateFrom */
export function clampFromNotAfterTo(to, candidateFrom) {
  if (!to || !candidateFrom) return candidateFrom;
  return candidateFrom > to ? to : candidateFrom;
}

/**
 * @param {string} oldValue
 * @param {number} changeStart
 * @param {number} changeLength
 * @param {string} changeReplacement
 */
export function applyChange(oldValue, changeStart, changeLength, changeReplacement) {
    return oldValue.substring(0, changeStart) +
        changeReplacement +
        oldValue.substring(changeStart + changeLength);
}

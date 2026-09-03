// HTTP header values are restricted to Latin-1 (character codes 0-255) —
// anything past that throws a cryptic browser/Node error ("Cannot convert
// argument to a ByteString...") right at the fetch call, far from whatever
// credential actually caused it. This turns that into a clear, actionable
// message naming the field and the exact character, so a copy-paste mistake
// (an em dash "—" landing where a hyphen should be is the common case) is
// obvious instead of a dead end.
export function assertAsciiHeaderValue(value: string, label: string) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 255) {
      throw new Error(
        `${label} contains a character that isn't allowed in credentials ("${value[i]}", code ${code}, at position ${i + 1}). ` +
          `This is usually a copy-paste mistake — an em dash or curly quote landing where a plain hyphen or straight quote should be. ` +
          `Re-enter ${label} and check for that.`
      );
    }
  }
}

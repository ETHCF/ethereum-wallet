// A field's type ends in [] or [n] when it is an array.
const ARRAY_SUFFIX = /\[\d*\]$/u;
// Deeper than any real struct; stops a recursive type definition.
const MAX_DEPTH = 32;

function pickValue(type, value, types, depth) {
  if (ARRAY_SUFFIX.test(type)) {
    const itemType = type.replace(ARRAY_SUFFIX, '');
    return Array.isArray(value)
      ? value.map((item) => pickValue(itemType, item, types, depth + 1))
      : value;
  }
  if (Object.hasOwn(types, type) && Array.isArray(types[type])) {
    return pickStruct(type, value, types, depth + 1);
  }
  return value;
}

function pickStruct(typeName, value, types, depth) {
  if (
    depth > MAX_DEPTH ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {};
  }
  const fields =
    Object.hasOwn(types, typeName) && Array.isArray(types[typeName])
      ? types[typeName]
      : [];
  const picked = {};
  for (const field of fields) {
    if (field && Object.hasOwn(value, field.name)) {
      picked[field.name] = pickValue(
        field.type,
        value[field.name],
        types,
        depth,
      );
    }
  }
  return picked;
}

/**
 * Keeps only the parts of EIP-712 typed data that the signature covers, shared
 * by the confirmation UI and background security checks.
 *
 * Fields that `types` does not declare are left out of the hash, so a site can
 * add them only to mislead, for example `vaIue` beside `value`, or a domain
 * `chainId` that the domain type omits. A message whose primary type is
 * EIP712Domain is not signed at all.
 *
 * @param {object} typedData - The parsed typed data
 * @param {object} typedData.domain - The domain the site sent
 * @param {object} typedData.message - The message the site sent
 * @param {string} typedData.primaryType - The message's struct type
 * @param {object} typedData.types - The struct type definitions
 * @returns {{ domain: object, message: object }} The signed domain and message
 */
export function getSignedTypedData({ domain, message, primaryType, types }) {
  const knownTypes = types && typeof types === 'object' ? types : {};
  return {
    domain: pickStruct('EIP712Domain', domain ?? {}, knownTypes, 0),
    message:
      primaryType === 'EIP712Domain'
        ? {}
        : pickStruct(primaryType, message ?? {}, knownTypes, 0),
  };
}

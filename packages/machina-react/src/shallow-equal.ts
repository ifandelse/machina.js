function isObjectRecord(value: unknown): value is Record<PropertyKey, unknown> {
    return !!value && typeof value === "object";
}

export const shallowEqual = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) {
        return true;
    }

    if (!isObjectRecord(a) || !isObjectRecord(b)) {
        return false;
    }

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);

    if (aKeys.length !== bKeys.length) {
        return false;
    }

    for (const key of aKeys) {
        if (!Object.prototype.hasOwnProperty.call(b, key) || !Object.is(a[key], b[key])) {
            return false;
        }
    }

    return true;
};

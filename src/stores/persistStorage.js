import { createJSONStorage } from 'zustand/middleware';

function replacer(_key, value) {
    if (value instanceof Map) {
        return { __type: 'Map', value: Array.from(value.entries()) };
    }
    if (value instanceof Set) {
        return { __type: 'Set', value: Array.from(value.values()) };
    }
    return value;
}

function reviver(_key, value) {
    if (value && value.__type === 'Map' && Array.isArray(value.value)) {
        return new Map(value.value);
    }
    if (value && value.__type === 'Set' && Array.isArray(value.value)) {
        return new Set(value.value);
    }
    return value;
}

export function createMapSetJSONStorage(getStorage) {
    return createJSONStorage(getStorage, { replacer, reviver });
}

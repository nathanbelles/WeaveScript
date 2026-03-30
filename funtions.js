export class Functions {
    constructor(utils) {
        this.utils = utils;
    }

    FUNCTION_DEFS = Object.freeze({
        round: {min: 1, max: 1, fn: (args) => Math.round(args[0])},
        floor: {min: 1, max: 1, fn: (args) => Math.floor(args[0])},
        ceil: {min: 1, max: 1, fn: (args) => Math.ceil(args[0])},
        abs: {min: 1, max: 1, fn: (args) => Math.abs(args[0])},
        min: {min: 2, max: Infinity, fn: (args) => Math.min(...args)},
        max: {min: 2, max: Infinity, fn: (args) => Math.max(...args)},
        clamp: {min: 3, max: 3, fn: (args) => Math.max(Math.min(args[0], args[2]), args[1])},
        random: {min: 0, max: 1, fn: (args) => Math.floor(Math.random() * (args[0] ?? 100))},

        toUpper: {min: 1, max: 1, fn: (args) => String(args[0]).toUpperCase()},
        toLower: {min: 1, max: 1, fn: (args) => String(args[0]).toLowerCase()},
        trim: {min: 1, max: 1, fn: (args) => String(args[0]).trim()},
        length: {min: 1, max: 1, fn: (args) => String(args[0]).length},
        substring: {min: 2, max: 3, fn: (args) => String(args[0]).substring(args[1], args[2])},
        replace: {min: 3, max: 3, fn: (args) => String(args[0]).replace(args[1], args[2])},

        toNumber: {min: 1, max: 1, fn: (args) => Number(args[0])},
        toString: {min: 1, max: 1, fn: (args) => String(args[0])},
        toBoolean: {min: 1, max: 1, fn: (args) => this.utils.isTruthy(args[0])},

        isNumber: {min: 1, max: 1, fn: (args) => typeof args[0] === "number"},
        isString: {min: 1, max: 1, fn: (args) => typeof args[0] === "string"},
        isBoolean: {min: 1, max: 1, fn: (args) => typeof args[0] === "boolean"},
    });
}

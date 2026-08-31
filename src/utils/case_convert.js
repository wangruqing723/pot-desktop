/**
 * 命名格式转换：把一段文本按指定的标识符命名格式重新拼接。
 *
 * 纯函数、无 React 依赖、不引入第三方包。仅供「复制为…」使用，
 * 与 SourceArea 里的 transformVarName 并存，互不影响（见 docs/adr/0002）。
 */

/** 支持的命名格式。值同时用作 i18n 键 translate.case_format.<value> */
export const CaseFormat = {
    original: 'original',
    camel: 'camel',
    pascal: 'pascal',
    snake: 'snake',
    constant: 'constant',
    kebab: 'kebab',
};

/** 菜单与快捷键共用的顺序：Alt+Shift+1..6 依次对应 */
export const caseFormatList = [
    CaseFormat.original,
    CaseFormat.camel,
    CaseFormat.pascal,
    CaseFormat.snake,
    CaseFormat.constant,
    CaseFormat.kebab,
];

// 所有非字母数字字符一律当分隔符，unicode-aware
const SEPARATOR_PATTERN = /[^\p{L}\p{N}]+/u;
// 兜底判断用：不含任何 ASCII 字母的文本（如纯中文译文）不做转换
const ASCII_LETTER_PATTERN = /[A-Za-z]/;

const UPPER_PATTERN = /\p{Lu}/u;
const LOWER_PATTERN = /\p{Ll}/u;
const DIGIT_PATTERN = /\p{Nd}/u;

const isUpper = (char) => UPPER_PATTERN.test(char);
const isLower = (char) => LOWER_PATTERN.test(char);
const isDigit = (char) => DIGIT_PATTERN.test(char);

/**
 * 在已有的大小写边界上继续切分一个连续片段。
 * - 小写/数字 后接 大写：在大写前切（userName -> user | Name）
 * - 连续大写后接小写：在最后一个大写前切（HTTPServer -> HTTP | Server）
 * - 字母 -> 数字 不切，数字附着到前一个词（http2 -> http2）
 */
function splitCaseBoundary(chunk) {
    const words = [];
    let start = 0;
    for (let i = 1; i < chunk.length; i++) {
        const prev = chunk[i - 1];
        const cur = chunk[i];
        const next = i + 1 < chunk.length ? chunk[i + 1] : '';
        const afterLowerOrDigit = (isLower(prev) || isDigit(prev)) && isUpper(cur);
        const beforeLower = isUpper(prev) && isUpper(cur) && isLower(next);
        if (afterLowerOrDigit || beforeLower) {
            words.push(chunk.slice(start, i));
            start = i;
        }
    }
    words.push(chunk.slice(start));
    return words.filter(Boolean);
}

/**
 * 分词：转换成任何命名格式的前置步骤。
 * @param {string} text
 * @returns {string[]}
 */
export function splitWords(text) {
    if (typeof text !== 'string' || text === '') {
        return [];
    }
    const words = [];
    for (const chunk of text.split(SEPARATOR_PATTERN)) {
        if (chunk === '') {
            continue;
        }
        words.push(...splitCaseBoundary(chunk));
    }
    return words;
}

/** 词首字母大写、其余小写。故 HTTPServer 经 pascal 得 HttpServer */
function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * 按指定命名格式转换文本。转换不可行时原样返回（no-op 兜底）。
 * @param {string} text
 * @param {string} format CaseFormat 之一
 * @returns {string}
 */
export function convertCase(text, format) {
    if (typeof text !== 'string' || text === '') {
        return '';
    }
    if (format === CaseFormat.original) {
        return text;
    }
    // 纯中文/日文等不含 ASCII 字母的译文，任何格式都等于原样复制
    if (!ASCII_LETTER_PATTERN.test(text)) {
        return text;
    }
    const words = splitWords(text);
    if (words.length === 0) {
        return text;
    }
    switch (format) {
        case CaseFormat.camel:
            return words.map((word, index) => (index === 0 ? word.toLowerCase() : capitalize(word))).join('');
        case CaseFormat.pascal:
            return words.map(capitalize).join('');
        case CaseFormat.snake:
            return words.map((word) => word.toLowerCase()).join('_');
        case CaseFormat.constant:
            return words.map((word) => word.toUpperCase()).join('_');
        case CaseFormat.kebab:
            return words.map((word) => word.toLowerCase()).join('-');
        default:
            return text;
    }
}

(function (root) {
  const zhDigitMap = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  const weekdayMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  const quantityPattern = String.raw`(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十]+|半|(?:\d+|[零〇一二两三四五六七八九十]+)个?半)`;

  function cloneDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseChineseInteger(text) {
    if (/^\d+$/.test(text)) return Number(text);
    if (text === "十") return 10;
    if (text.includes("十")) {
      const [tensText, onesText] = text.split("十");
      const tens = tensText ? zhDigitMap[tensText] : 1;
      const ones = onesText ? zhDigitMap[onesText] : 0;
      if (typeof tens === "number" && typeof ones === "number") return tens * 10 + ones;
      return NaN;
    }
    return [...text].reduce((value, char) => value * 10 + zhDigitMap[char], 0);
  }

  function parseQuantity(text) {
    const normalized = String(text).replace(/个/g, "");
    if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
    if (normalized === "半") return 0.5;
    if (normalized.endsWith("半")) {
      const prefix = normalized.slice(0, -1);
      return (prefix ? parseChineseInteger(prefix) : 0) + 0.5;
    }
    return parseChineseInteger(normalized);
  }

  function isValidDateParts(year, month, day) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function dateFromParts(year, month, day, baseDate) {
    const parsedYear = year ? Number(year) : baseDate.getFullYear();
    const parsedMonth = Number(month);
    const parsedDay = Number(day);
    if (!isValidDateParts(parsedYear, parsedMonth, parsedDay)) return null;
    return new Date(parsedYear, parsedMonth - 1, parsedDay);
  }

  function addMonths(date, amount) {
    const direction = amount < 0 ? -1 : 1;
    const absolute = Math.abs(amount);
    const wholeMonths = Math.trunc(absolute) * direction;
    const halfMonthDays = absolute % 1 === 0.5 ? 15 * direction : 0;
    const result = cloneDate(date);
    const originalDay = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + wholeMonths);
    const maxDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(originalDay, maxDay));
    if (halfMonthDays) result.setDate(result.getDate() + halfMonthDays);
    return result;
  }

  function weekdayDate(baseDate, weekday, direction) {
    const current = baseDate.getDay() || 7;
    const result = cloneDate(baseDate);
    if (direction === "next") {
      result.setDate(result.getDate() + (8 - current) + (weekday - 1));
      return result;
    }
    if (direction === "previous") {
      result.setDate(result.getDate() - (current + 6) + (weekday - 1));
      return result;
    }
    let offset = weekday - current;
    if (offset < 0) offset += 7;
    result.setDate(result.getDate() + offset);
    return result;
  }

  function parseRelativeDate(text, baseDate = new Date()) {
    const base = cloneDate(baseDate);
    const simpleRules = [
      { regex: /大后天/, offset: 3 },
      { regex: /后天/, offset: 2 },
      { regex: /明天/, offset: 1 },
      { regex: /今天/, offset: 0 },
      { regex: /昨天/, offset: -1 },
      { regex: /大前天/, offset: -3 },
      { regex: /前天/, offset: -2 }
    ];
    for (const rule of simpleRules) {
      const match = text.match(rule.regex);
      if (match) {
        const date = cloneDate(base);
        date.setDate(date.getDate() + rule.offset);
        return { date, matched: match[0] };
      }
    }

    const weekMatch = text.match(/(下周|上周|本周|这周|周)([一二三四五六日天])/);
    if (weekMatch) {
      const direction = weekMatch[1] === "下周" ? "next" : weekMatch[1] === "上周" ? "previous" : "current";
      return { date: weekdayDate(base, weekdayMap[weekMatch[2]], direction), matched: weekMatch[0] };
    }

    const weekendMatch = text.match(/周末/);
    if (weekendMatch) return { date: weekdayDate(base, 6, "current"), matched: weekendMatch[0] };

    const relativeRegex = new RegExp(`(${quantityPattern})\\s*(个月|月|周|星期|天|日)\\s*(后|前)`);
    const relativeMatch = text.match(relativeRegex);
    if (relativeMatch) {
      const quantity = parseQuantity(relativeMatch[1]);
      if (!Number.isFinite(quantity)) return null;
      const direction = relativeMatch[3] === "前" ? -1 : 1;
      const unit = relativeMatch[2];
      let date = cloneDate(base);
      if (unit === "个月" || unit === "月") {
        date = addMonths(date, quantity * direction);
      } else {
        const days = unit === "周" || unit === "星期" ? quantity * 7 : quantity;
        date.setDate(date.getDate() + Math.round(days * direction));
      }
      return { date, matched: relativeMatch[0] };
    }

    return null;
  }

  function parseAbsoluteDate(text, baseDate = new Date()) {
    const base = cloneDate(baseDate);
    const patterns = [
      /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日?/,
      /(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})/,
      /(\d{1,2})[.\-/](\d{1,2})/
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      const hasYear = match.length === 4;
      const date = hasYear
        ? dateFromParts(match[1], match[2], match[3], base)
        : dateFromParts(null, match[1], match[2], base);
      if (date) return { date, matched: match[0] };
    }
    return null;
  }

  function parseDueDate(text, baseDate = new Date()) {
    return parseAbsoluteDate(text, baseDate) || parseRelativeDate(text, baseDate);
  }

  function resolveDueDate(text, baseDate = new Date()) {
    const result = parseDueDate(text, baseDate);
    return result ? formatDate(result.date) : "";
  }

  function stripDateExpressions(text) {
    return String(text)
      .replace(new RegExp(`^\\s*(${quantityPattern})\\s*(?:个月|月|周|星期|天|日)\\s*(?:后|前)`), "")
      .replace(/^\s*(?:大后天|后天|明天|今天|昨天|前天|大前天|周末|(?:下周|上周|本周|这周|周)[一二三四五六日天])/, "")
      .replace(/^\s*(?:(?:\d{4})\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*日?/, "")
      .replace(/^\s*(?:(?:\d{4})[/-])?\d{1,2}[.\-/]\d{1,2}/, "");
  }

  root.TodoDateParser = {
    formatDate,
    parseChineseInteger,
    parseQuantity,
    parseRelativeDate,
    parseAbsoluteDate,
    parseDueDate,
    resolveDueDate,
    stripDateExpressions
  };
})(globalThis);

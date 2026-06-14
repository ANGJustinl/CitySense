/**
 * 标题质量过滤器
 *
 * 在数据流经适配器时进行预过滤，减少无效数据进入后续管线
 * 检测：
 * 1. 夸张表达（天花板、绝绝子等）
 * 2. 营销关键词（最全攻略、保姆级教程等）
 * 3. 无意义标题（纯符号、过短等）
 */

export interface TitleQualityResult {
  pass: boolean;
  reason?: string;
  category?: 'clickbait' | 'marketing' | 'meaningless' | 'valid';
}

/**
 * 夸张表达模式列表
 */
const CLICKBAIT_PATTERNS = [
  /简直是.*天花板/,
  /绝了?$/,
  /绝绝子/,
  /必去/,
  /不看后悔/,
  /错过后悔/,
  /太美了$/,
  /爱了$/,
  /绝绝绝/,
  /YYDS/,
  /强推$/,
  /冲鸭/,
  /绝绝$/,
];

/**
 * 营销关键词列表
 */
const MARKETING_KEYWORDS = [
  '最全攻略',
  '保姆级教程',
  '保姆级攻略',
  '终极指南',
  '终极攻略',
  '重磅推荐',
  '必看',
  '必收藏',
  '不看后悔',
  '错过等一年',
  '手把手教你',
  '一篇搞定',
  '全套攻略',
  '完整攻略',
  '干货满满',
  '纯干货',
];

/**
 * 无意义标题检测
 */
function isMeaninglessTitle(title: string): boolean {
  const trimmed = title.trim();

  // 纯标点符号
  if (/^[！？。、，；：""''【】《》\s]*$/.test(trimmed)) {
    return true;
  }

  // 少于3个汉字且无数字、字母
  const chineseChars = trimmed.replace(/[^一-龥]/g, '');
  if (chineseChars.length < 3 && !/[0-9a-zA-Z]/.test(trimmed)) {
    return true;
  }

  // 纯表情符号
  if (/^[\p{Emoji}\p{Emoji_Presentation}]+$/u.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * 检测夸张表达
 */
function hasClickbaitPattern(title: string): boolean {
  return CLICKBAIT_PATTERNS.some(pattern => pattern.test(title));
}

/**
 * 检测营销关键词
 */
function hasMarketingKeyword(title: string): boolean {
  return MARKETING_KEYWORDS.some(keyword => title.includes(keyword));
}

/**
 * 检查标题质量
 *
 * @param title - 标题文本
 * @param content - 内容文本（可选，用于辅助判断）
 * @returns 质量检测结果
 */
export function checkTitleQuality(title: string, content?: string): TitleQualityResult {
  const trimmedTitle = title.trim();

  // 空标题
  if (!trimmedTitle) {
    return {
      pass: false,
      reason: '标题为空',
      category: 'meaningless'
    };
  }

  // 检测无意义标题
  if (isMeaninglessTitle(trimmedTitle)) {
    return {
      pass: false,
      reason: '标题无意义',
      category: 'meaningless'
    };
  }

  // 检测夸张表达
  if (hasClickbaitPattern(trimmedTitle)) {
    // 如果内容有具体名称，可能仍有效
    if (content && content.length > 20) {
      // 内容足够长，可能是有效内容，继续检查
    } else {
      return {
        pass: false,
        reason: '标题包含夸张表达',
        category: 'clickbait'
      };
    }
  }

  // 检测营销关键词
  if (hasMarketingKeyword(trimmedTitle)) {
    // 检查是否有具体地点/活动名称
    // 营销关键词优先，如果标题包含营销词汇，需要有更具体的信息才通过
    const hasSpecificVenueName =
      /浦东|黄浦|静安|徐汇|长宁|普陀|虹口|杨浦|闵行|宝山|嘉定|松江|青浦|奉贤|金山|崇明|M50|外滩|新天地|田子坊|美术馆|博物馆/.test(
        content || trimmedTitle
      );

    if (!hasSpecificVenueName) {
      return {
        pass: false,
        reason: '标题包含营销关键词且无具体地点名称',
        category: 'marketing'
      };
    }
  }

  // 泛化标题（如"上海生活"、"周末好去处"）
  if (/^(上海|北京|深圳|广州|杭州)生活/.test(trimmedTitle)) {
    if (!content || content.length < 15) {
      return {
        pass: false,
        reason: '标题过于泛化且内容不足',
        category: 'clickbait'
      };
    }
  }

  if (/^周末好去处|周末推荐|必去清单/.test(trimmedTitle)) {
    if (!content || content.length < 20) {
      return {
        pass: false,
        reason: '标题为泛化推荐且内容不足',
        category: 'marketing'
      };
    }
  }

  return {
    pass: true,
    category: 'valid'
  };
}

/**
 * 批量检查标题质量
 *
 * @param titles - 标题列表
 * @returns 批量检测结果
 */
export function batchCheckTitleQuality(
  titles: Array<{ title: string; content?: string }>
): Array<TitleQualityResult & { index: number }> {
  return titles.map((item, index) => ({
    index,
    ...checkTitleQuality(item.title, item.content)
  }));
}

/**
 * 过滤低质量标题
 *
 * @param items - 包含标题的项目列表
 * @returns 过滤后的项目列表和统计
 */
export function filterLowQualityTitles<T extends { title: string; content?: string }>(
  items: T[]
): { filtered: T[]; removed: number; reasons: Map<string, number> } {
  const reasons = new Map<string, number>();

  const filtered = items.filter(item => {
    const result = checkTitleQuality(item.title, item.content);
    if (!result.pass) {
      const reason = result.reason || '未知原因';
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
      return false;
    }
    return true;
  });

  return {
    filtered,
    removed: items.length - filtered.length,
    reasons
  };
}

/**
 * 获取过滤器统计信息（用于调试/监控）
 */
export function getFilterStats(
  results: Array<TitleQualityResult & { index: number }>
): {
  total: number;
  passed: number;
  removed: number;
  byCategory: Record<string, number>;
} {
  const stats = {
    total: results.length,
    passed: 0,
    removed: 0,
    byCategory: {} as Record<string, number>
  };

  for (const result of results) {
    if (result.pass) {
      stats.passed++;
    } else {
      stats.removed++;
      const category = result.category || 'unknown';
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    }
  }

  return stats;
}
